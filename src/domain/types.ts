export type Severity = "info" | "warning" | "blocker";

export type ReviewStatus =
  | "idle"
  | "analyzing"
  | "blocked"
  | "ready"
  | "awaiting_approval"
  | "deploying"
  | "verified"
  | "rejected"
  | "failed";

export type ColumnDefinition = {
  name: string;
  type: string;
  nullable: boolean;
  description: string;
  classification: "public" | "internal" | "pii" | "secret";
  contracted?: boolean;
};

export type DataAsset = {
  id: string;
  name: string;
  kind: "source" | "model" | "dashboard" | "export";
  owner: string;
  access: "broad" | "restricted";
  grain: string;
  columns: ColumnDefinition[];
};

export type LineageEdge = {
  from: string;
  to: string;
};

export type ProfileCheck = {
  id: string;
  name: string;
  status: "pass" | "fail";
  actual: string;
  expected: string;
  detail: string;
  severity: Exclude<Severity, "info">;
};

export type ChangeScenario = {
  id: string;
  shortName: string;
  title: string;
  summary: string;
  pullRequest: string;
  author: string;
  changedAssetId: string;
  sourceSql: string;
  current: DataAsset;
  proposed: DataAsset;
  assets: DataAsset[];
  lineage: LineageEdge[];
  checks: ProfileCheck[];
};

export type EvidenceCategory =
  | "contract"
  | "governance"
  | "lineage"
  | "quality"
  | "memory";

export type Evidence = {
  id: string;
  category: EvidenceCategory;
  label: string;
  detail: string;
  assetIds: string[];
};

export type Finding = {
  id: string;
  severity: Severity;
  title: string;
  summary: string;
  evidenceIds: string[];
  affectedAssets: string[];
  recommendation: string;
};

export type RolloutStep = {
  id: string;
  label: string;
  description: string;
};

export type ReviewResult = {
  scenarioId: string;
  generatedAt: string;
  decision: "blocked" | "ready";
  evidence: Evidence[];
  findings: Finding[];
  impactedAssetIds: string[];
  rolloutPlan: RolloutStep[];
};

export type PolicyMemory = {
  id: string;
  pattern: string;
  classification: "pii" | "secret";
  instruction: string;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  action: string;
  detail: string;
  actor: string;
  createdAt: string;
};

export type WorkflowView = {
  id: string;
  status: ReviewStatus;
  stage: string;
  percent: number;
  message: string;
  approvalRequired: boolean;
};

export type BreakwaterState = {
  selectedScenarioId: string;
  status: ReviewStatus;
  review: ReviewResult | null;
  workflow: WorkflowView | null;
  memories: PolicyMemory[];
  recentAudit: AuditEvent[];
};

export type RolloutProgress = {
  stage: string;
  status: "pending" | "running" | "complete" | "error";
  percent: number;
  message: string;
  approvalRequired?: boolean;
};

export type RolloutParams = {
  scenarioId: string;
  reviewGeneratedAt: string;
};
