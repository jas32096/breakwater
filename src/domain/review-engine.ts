import { getScenario } from "./fixtures";
import type {
  ChangeScenario,
  Evidence,
  Finding,
  PolicyMemory,
  ReviewResult,
  RolloutStep
} from "./types";

const DEFAULT_ROLLOUT_PLAN: RolloutStep[] = [
  {
    id: "snapshot",
    label: "Snapshot contract",
    description:
      "Pin the current schema, profiles, and downstream dependencies."
  },
  {
    id: "stage",
    label: "Stage candidate",
    description: "Materialize the candidate in an isolated namespace."
  },
  {
    id: "validate",
    label: "Run controls",
    description:
      "Re-run contracts, policy checks, and aggregate reconciliation."
  },
  {
    id: "approval",
    label: "Human approval",
    description: "Require an accountable reviewer before publication."
  },
  {
    id: "publish",
    label: "Publish atomically",
    description: "Promote the verified version and retain rollback metadata."
  }
];

function wildcardMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`, "i").test(value);
}

export function downstreamAssets(
  scenario: ChangeScenario,
  assetId = scenario.changedAssetId
): string[] {
  const visited = new Set<string>();
  const queue = [assetId];

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of scenario.lineage) {
      if (edge.from === current && !visited.has(edge.to)) {
        visited.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return [...visited];
}

export function evaluateScenario(
  scenarioId: string,
  memories: PolicyMemory[] = [],
  now = new Date()
): ReviewResult {
  return evaluateChange(getScenario(scenarioId), memories, now);
}

export function evaluateChange(
  scenario: ChangeScenario,
  memories: PolicyMemory[] = [],
  now = new Date()
): ReviewResult {
  const scenarioId = scenario.id;
  const evidence: Evidence[] = [];
  const findings: Finding[] = [];
  const impactedAssetIds = downstreamAssets(scenario);
  const currentByName = new Map(
    scenario.current.columns.map((column) => [column.name, column])
  );
  const proposedByName = new Map(
    scenario.proposed.columns.map((column) => [column.name, column])
  );

  const removedContracted = scenario.current.columns.filter(
    (column) => column.contracted && !proposedByName.has(column.name)
  );
  if (removedContracted.length > 0) {
    const evidenceId = `contract-removed-${scenario.id}`;
    evidence.push({
      id: evidenceId,
      category: "contract",
      label: "Contracted columns removed",
      detail: removedContracted.map((column) => column.name).join(", "),
      assetIds: [scenario.changedAssetId, ...impactedAssetIds]
    });
    findings.push({
      id: `finding-contract-${scenario.id}`,
      severity: "blocker",
      title: "Published schema contract is broken",
      summary: `${removedContracted.length} contracted column${removedContracted.length === 1 ? " is" : "s are"} absent from the proposed model.`,
      evidenceIds: [evidenceId],
      affectedAssets: [scenario.changedAssetId, ...impactedAssetIds],
      recommendation:
        "Preserve compatibility aliases through a measured deprecation window, then migrate each known consumer."
    });
  }

  const typeChanges = scenario.proposed.columns.filter((proposed) => {
    const current = currentByName.get(proposed.name);
    return current && current.type !== proposed.type;
  });
  if (typeChanges.length > 0) {
    const evidenceId = `contract-types-${scenario.id}`;
    evidence.push({
      id: evidenceId,
      category: "contract",
      label: "Column types changed",
      detail: typeChanges
        .map(
          (column) =>
            `${column.name}: ${currentByName.get(column.name)?.type} -> ${column.type}`
        )
        .join("; "),
      assetIds: [scenario.changedAssetId]
    });
    findings.push({
      id: `finding-types-${scenario.id}`,
      severity: "warning",
      title: "Schema types changed",
      summary: "One or more retained columns changed physical type.",
      evidenceIds: [evidenceId],
      affectedAssets: [scenario.changedAssetId, ...impactedAssetIds],
      recommendation:
        "Validate coercion behavior and update the contract only after downstream compatibility tests pass."
    });
  }

  const sensitiveAdditions = scenario.proposed.columns.filter(
    (column) =>
      !currentByName.has(column.name) &&
      (column.classification === "pii" || column.classification === "secret")
  );
  for (const column of sensitiveAdditions) {
    const evidenceId = `governance-${scenario.id}-${column.name}`;
    evidence.push({
      id: evidenceId,
      category: "governance",
      label: `${column.classification.toUpperCase()} column introduced`,
      detail: `${column.name} is classified ${column.classification} while ${scenario.proposed.name} has ${scenario.proposed.access} access.`,
      assetIds: [scenario.changedAssetId]
    });
    findings.push({
      id: `finding-governance-${scenario.id}-${column.name}`,
      severity: scenario.proposed.access === "broad" ? "blocker" : "warning",
      title: `${column.name} expands the sensitive-data surface`,
      summary:
        "The proposed field changes the governance posture of the published asset.",
      evidenceIds: [evidenceId],
      affectedAssets: [scenario.changedAssetId],
      recommendation:
        "Keep the field in a restricted relation or apply redaction and explicit access review before publication."
    });
  }

  for (const memory of memories) {
    for (const column of scenario.proposed.columns) {
      if (
        !currentByName.has(column.name) &&
        wildcardMatches(memory.pattern, column.name)
      ) {
        const evidenceId = `memory-${memory.id}-${column.name}`;
        evidence.push({
          id: evidenceId,
          category: "memory",
          label: "Organization policy matched",
          detail: `${memory.pattern} classifies ${column.name} as ${memory.classification}: ${memory.instruction}`,
          assetIds: [scenario.changedAssetId]
        });
        findings.push({
          id: `finding-memory-${memory.id}-${column.name}`,
          severity: "blocker",
          title: `${column.name} violates a learned organization policy`,
          summary: memory.instruction,
          evidenceIds: [evidenceId],
          affectedAssets: [scenario.changedAssetId],
          recommendation:
            "Remove the field from this asset or route it through an approved restricted data product."
        });
      }
    }
  }

  if (impactedAssetIds.length > 0) {
    evidence.push({
      id: `lineage-${scenario.id}`,
      category: "lineage",
      label: "Transitive downstream impact",
      detail: `${impactedAssetIds.length} downstream asset${impactedAssetIds.length === 1 ? "" : "s"}: ${impactedAssetIds.join(", ")}`,
      assetIds: impactedAssetIds
    });
  }

  const failedChecks = scenario.checks.filter(
    (check) => check.status === "fail"
  );
  for (const check of failedChecks) {
    evidence.push({
      id: `quality-${scenario.id}-${check.id}`,
      category: "quality",
      label: check.name,
      detail: `${check.detail} Actual: ${check.actual}. Expected: ${check.expected}.`,
      assetIds: [scenario.changedAssetId]
    });
  }
  if (failedChecks.length > 0) {
    findings.push({
      id: `finding-quality-${scenario.id}`,
      severity: failedChecks.some((check) => check.severity === "blocker")
        ? "blocker"
        : "warning",
      title: `${failedChecks.length} validation control${failedChecks.length === 1 ? "" : "s"} failed`,
      summary: failedChecks
        .map((check) => `${check.name}: ${check.actual}`)
        .join("; "),
      evidenceIds: failedChecks.map(
        (check) => `quality-${scenario.id}-${check.id}`
      ),
      affectedAssets: [scenario.changedAssetId, ...impactedAssetIds],
      recommendation:
        "Correct the transformation and re-run the candidate against a production snapshot before requesting approval."
    });
  }

  const hasBlocker = findings.some((finding) => finding.severity === "blocker");

  return {
    scenarioId,
    generatedAt: now.toISOString(),
    decision: hasBlocker ? "blocked" : "ready",
    evidence,
    findings,
    impactedAssetIds,
    rolloutPlan: DEFAULT_ROLLOUT_PLAN
  };
}

export function validateEvidenceReferences(review: ReviewResult): boolean {
  const evidenceIds = new Set(review.evidence.map((item) => item.id));
  return review.findings.every(
    (finding) =>
      finding.evidenceIds.length > 0 &&
      finding.evidenceIds.every((id) => evidenceIds.has(id))
  );
}
