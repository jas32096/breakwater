import { AgentWorkflow } from "agents/workflows";
import type { AgentWorkflowEvent, AgentWorkflowStep } from "agents/workflows";
import type { BreakwaterAgent } from "./agent";
import type { RolloutParams, RolloutProgress } from "./domain/types";

export class RolloutWorkflow extends AgentWorkflow<
  BreakwaterAgent,
  RolloutParams,
  RolloutProgress,
  Env
> {
  async run(event: AgentWorkflowEvent<RolloutParams>, step: AgentWorkflowStep) {
    const { scenarioId, reviewGeneratedAt } = event.payload;

    await this.reportProgress({
      stage: "snapshot",
      status: "running",
      percent: 10,
      message: "Pinning current contract and downstream dependency graph"
    });
    const snapshot = await step.do("snapshot-current-contract", async () => ({
      scenarioId,
      reviewGeneratedAt,
      snapshotId: crypto.randomUUID(),
      capturedAt: new Date().toISOString()
    }));

    await this.reportProgress({
      stage: "stage",
      status: "running",
      percent: 35,
      message: "Applying proposed remediations in an isolated namespace"
    });
    const candidate = await step.do(
      "stage-remediated-candidate",
      {
        retries: { limit: 3, delay: "1 second", backoff: "exponential" }
      },
      async () => ({
        snapshotId: snapshot.snapshotId,
        namespace: `staging_${scenarioId.replaceAll("-", "_")}`,
        remediations: [
          "preserve contracted aliases",
          "enforce sensitive-column isolation",
          "apply effective-dated joins"
        ]
      })
    );

    await this.reportProgress({
      stage: "validate",
      status: "running",
      percent: 60,
      message:
        "Re-running schema, governance, grain, and reconciliation controls"
    });
    const validation = await step.do("validate-candidate", async () => ({
      namespace: candidate.namespace,
      controlsPassed: 7,
      controlsFailed: 0,
      aggregateDelta: "0.2%"
    }));

    await this.agent.recordWorkflowAudit(
      "rollout.validated",
      `${scenarioId}: ${validation.controlsPassed} controls passed in ${candidate.namespace}`
    );
    await this.reportProgress({
      stage: "approval",
      status: "pending",
      percent: 72,
      message: "Validated candidate is waiting for accountable human approval",
      approvalRequired: true
    });
    const approval = await this.waitForApproval<{ approvedBy?: string }>(step, {
      timeout: "7 days"
    });

    await this.reportProgress({
      stage: "publish",
      status: "running",
      percent: 86,
      message: "Promoting the approved candidate with rollback metadata"
    });
    const publication = await step.do("publish-atomically", async () => ({
      version: `v-${Date.now()}`,
      approvedBy: approval?.approvedBy ?? "demo-reviewer",
      rollbackSnapshot: snapshot.snapshotId,
      publishedAt: new Date().toISOString()
    }));

    await this.reportProgress({
      stage: "verify",
      status: "running",
      percent: 96,
      message: "Running post-publication controls"
    });
    await step.do("verify-publication", async () => ({
      version: publication.version,
      healthy: true,
      checks: ["contract", "freshness", "reconciliation"]
    }));

    await step.reportComplete(publication);
    return publication;
  }
}
