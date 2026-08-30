import { describe, expect, it } from "vitest";
import {
  evaluateScenario,
  downstreamAssets,
  validateEvidenceReferences
} from "./review-engine";
import { getScenario } from "./fixtures";
import type { PolicyMemory } from "./types";

describe("review engine", () => {
  it("traverses transitive downstream lineage without duplicating assets", () => {
    const impacted = downstreamAssets(getScenario("billing-v42"));

    expect(impacted).toEqual([
      "finance.revenue_rollup",
      "support.account_value",
      "dashboard.executive_arr"
    ]);
  });

  it("blocks the billing change with contract, governance, and quality evidence", () => {
    const review = evaluateScenario(
      "billing-v42",
      [],
      new Date("2026-08-30T12:00:00.000Z")
    );

    expect(review.decision).toBe("blocked");
    expect(review.findings.some((item) => item.id.includes("contract"))).toBe(
      true
    );
    expect(review.findings.some((item) => item.id.includes("governance"))).toBe(
      true
    );
    expect(review.findings.some((item) => item.id.includes("quality"))).toBe(
      true
    );
    expect(review.impactedAssetIds).toHaveLength(3);
    expect(validateEvidenceReferences(review)).toBe(true);
  });

  it("allows the additive support change before organization memory is learned", () => {
    const review = evaluateScenario("support-token-export");

    expect(review.decision).toBe("ready");
    expect(review.findings).toHaveLength(0);
  });

  it("turns a learned wildcard policy into a blocker", () => {
    const memories: PolicyMemory[] = [
      {
        id: "memory-token",
        pattern: "*_token",
        classification: "secret",
        instruction:
          "Authentication tokens must never enter analytical exports.",
        createdAt: "2026-08-30T12:00:00.000Z"
      }
    ];

    const review = evaluateScenario("support-token-export", memories);

    expect(review.decision).toBe("blocked");
    expect(review.evidence).toContainEqual(
      expect.objectContaining({ category: "memory" })
    );
    expect(validateEvidenceReferences(review)).toBe(true);
  });
});
