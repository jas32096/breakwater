import { describe, expect, it } from "vitest";
import { getScenario } from "./fixtures";
import { evaluateChange, validateEvidenceReferences } from "./review-engine";
import type { ChangeScenario, PolicyMemory } from "./types";

function supportVariant(
  id: string,
  update: (scenario: ChangeScenario) => ChangeScenario
) {
  return update(
    structuredClone({ ...getScenario("support-token-export"), id })
  );
}

describe("golden change evaluation set", () => {
  it("does not block a safe additive internal column", () => {
    expect(evaluateChange(getScenario("support-token-export")).decision).toBe(
      "ready"
    );
  });

  it("blocks removal of a contracted column", () => {
    const scenario = supportVariant("contract-removal", (value) => ({
      ...value,
      proposed: { ...value.proposed, columns: value.proposed.columns.slice(1) }
    }));
    const result = evaluateChange(scenario);

    expect(result.findings).toContainEqual(
      expect.objectContaining({ id: expect.stringContaining("contract") })
    );
    expect(result.decision).toBe("blocked");
  });

  it("warns when a retained physical type changes", () => {
    const scenario = supportVariant("type-change", (value) => ({
      ...value,
      proposed: {
        ...value.proposed,
        columns: value.proposed.columns.map((column) =>
          column.name === "case_id" ? { ...column, type: "bigint" } : column
        )
      }
    }));

    expect(evaluateChange(scenario).findings).toContainEqual(
      expect.objectContaining({ severity: "warning" })
    );
  });

  it("blocks a new PII column on a broadly accessible model", () => {
    const scenario = supportVariant("broad-pii", (value) => ({
      ...value,
      proposed: {
        ...value.proposed,
        access: "broad",
        columns: value.proposed.columns.map((column) =>
          column.name === "session_token"
            ? { ...column, name: "contact_email", classification: "pii" }
            : column
        )
      }
    }));

    expect(evaluateChange(scenario).decision).toBe("blocked");
  });

  it("warns on PII introduced into a restricted model", () => {
    const scenario = supportVariant("restricted-pii", (value) => ({
      ...value,
      proposed: {
        ...value.proposed,
        columns: value.proposed.columns.map((column) =>
          column.name === "session_token"
            ? { ...column, name: "contact_email", classification: "pii" }
            : column
        )
      }
    }));
    const result = evaluateChange(scenario);

    expect(result.findings).toContainEqual(
      expect.objectContaining({ severity: "warning" })
    );
    expect(result.decision).toBe("ready");
  });

  it("blocks a failed reconciliation control", () => {
    const scenario = supportVariant("failed-control", (value) => ({
      ...value,
      checks: [
        {
          id: "aggregate-delta",
          name: "Aggregate delta",
          status: "fail",
          actual: "+4.2%",
          expected: "within +/- 1%",
          detail: "Candidate exceeds the aggregate tolerance.",
          severity: "blocker"
        }
      ]
    }));

    expect(evaluateChange(scenario).decision).toBe("blocked");
  });

  it("applies a learned wildcard policy to a previously safe change", () => {
    const memory: PolicyMemory = {
      id: "tokens-secret",
      pattern: "*_token",
      classification: "secret",
      instruction: "Authentication tokens must not enter analytical exports.",
      createdAt: "2026-08-30T00:00:00.000Z"
    };
    const result = evaluateChange(getScenario("support-token-export"), [
      memory
    ]);

    expect(result.decision).toBe("blocked");
    expect(result.evidence).toContainEqual(
      expect.objectContaining({ category: "memory" })
    );
  });

  it("requires every finding to cite known evidence", () => {
    const result = evaluateChange(getScenario("billing-v42"));
    expect(validateEvidenceReferences(result)).toBe(true);

    result.findings[0].evidenceIds.push("hallucinated-evidence");
    expect(validateEvidenceReferences(result)).toBe(false);
  });
});
