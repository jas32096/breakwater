import type { ChangeScenario, DataAsset } from "./types";

const sourceUsage: DataAsset = {
  id: "raw.usage_events",
  name: "raw.usage_events",
  kind: "source",
  owner: "Developer Platform",
  access: "restricted",
  grain: "one row per account, product, and hour",
  columns: []
};

const sourceAccounts: DataAsset = {
  id: "core.accounts",
  name: "core.accounts",
  kind: "source",
  owner: "Identity",
  access: "restricted",
  grain: "one row per account",
  columns: []
};

const sourcePricing: DataAsset = {
  id: "billing.pricing_history",
  name: "billing.pricing_history",
  kind: "source",
  owner: "Billing",
  access: "restricted",
  grain: "one row per plan and effective period",
  columns: []
};

const currentRevenue: DataAsset = {
  id: "billing.monthly_revenue",
  name: "billing.monthly_revenue",
  kind: "model",
  owner: "Billing Data",
  access: "broad",
  grain: "one row per account and month",
  columns: [
    {
      name: "account_id",
      type: "varchar",
      nullable: false,
      description: "Stable account identifier",
      classification: "internal",
      contracted: true
    },
    {
      name: "revenue_month",
      type: "date",
      nullable: false,
      description: "UTC calendar month",
      classification: "public",
      contracted: true
    },
    {
      name: "revenue_usd",
      type: "decimal(18,2)",
      nullable: false,
      description: "Recognized monthly revenue in USD",
      classification: "internal",
      contracted: true
    }
  ]
};

const proposedRevenue: DataAsset = {
  ...currentRevenue,
  grain: "one row per customer email and month",
  columns: [
    {
      name: "customer_id",
      type: "varchar",
      nullable: false,
      description: "Account identifier renamed for GTM consumers",
      classification: "internal"
    },
    {
      name: "contact_email",
      type: "varchar",
      nullable: true,
      description: "Primary billing contact",
      classification: "pii"
    },
    {
      name: "revenue_month",
      type: "date",
      nullable: false,
      description: "UTC calendar month",
      classification: "public",
      contracted: true
    },
    {
      name: "monthly_revenue",
      type: "double",
      nullable: false,
      description: "Monthly revenue",
      classification: "internal"
    }
  ]
};

const billingScenario: ChangeScenario = {
  id: "billing-v42",
  shortName: "Billing v42",
  title: "Expose customer context in monthly revenue",
  summary:
    "A billing model change renames contracted fields, adds customer email, and simplifies the pricing join.",
  pullRequest: "PR #1842",
  author: "Maya Chen",
  changedAssetId: currentRevenue.id,
  sourceSql: `SELECT
  a.account_id AS customer_id,
  a.contact_email,
  date_trunc('month', u.event_at) AS revenue_month,
  sum(u.billable_units * p.unit_price) AS monthly_revenue
FROM raw.usage_events u
JOIN core.accounts a ON a.account_id = u.account_id
JOIN billing.pricing_history p ON p.plan_id = a.plan_id
GROUP BY 1, 2, 3`,
  current: currentRevenue,
  proposed: proposedRevenue,
  assets: [
    sourceUsage,
    sourceAccounts,
    sourcePricing,
    currentRevenue,
    {
      id: "finance.revenue_rollup",
      name: "finance.revenue_rollup",
      kind: "model",
      owner: "Finance Analytics",
      access: "restricted",
      grain: "one row per product and month",
      columns: []
    },
    {
      id: "dashboard.executive_arr",
      name: "Executive ARR",
      kind: "dashboard",
      owner: "Finance",
      access: "restricted",
      grain: "monthly dashboard",
      columns: []
    },
    {
      id: "support.account_value",
      name: "support.account_value",
      kind: "export",
      owner: "Support Systems",
      access: "broad",
      grain: "one row per account",
      columns: []
    }
  ],
  lineage: [
    { from: sourceUsage.id, to: currentRevenue.id },
    { from: sourceAccounts.id, to: currentRevenue.id },
    { from: sourcePricing.id, to: currentRevenue.id },
    { from: currentRevenue.id, to: "finance.revenue_rollup" },
    { from: "finance.revenue_rollup", to: "dashboard.executive_arr" },
    { from: currentRevenue.id, to: "support.account_value" }
  ],
  checks: [
    {
      id: "temporal-pricing-join",
      name: "Effective-dated pricing join",
      status: "fail",
      actual: "plan_id only",
      expected: "plan_id and event_at within effective period",
      detail:
        "pricing_history contains multiple rows per plan; joining only on plan_id duplicates usage across historical prices.",
      severity: "blocker"
    },
    {
      id: "revenue-reconciliation",
      name: "Revenue reconciliation",
      status: "fail",
      actual: "+23.7%",
      expected: "within +/- 1.0%",
      detail:
        "Candidate recognized revenue is 23.7% above the current production snapshot.",
      severity: "blocker"
    },
    {
      id: "account-uniqueness",
      name: "Account-month uniqueness",
      status: "fail",
      actual: "82.4% unique",
      expected: "100% unique",
      detail:
        "Grouping by contact_email changes the declared grain and creates duplicate account-month rows.",
      severity: "blocker"
    },
    {
      id: "freshness",
      name: "Source freshness",
      status: "pass",
      actual: "7 minutes",
      expected: "under 30 minutes",
      detail: "All upstream inputs meet the freshness SLO.",
      severity: "warning"
    }
  ]
};

const supportCurrent: DataAsset = {
  id: "support.case_export",
  name: "support.case_export",
  kind: "export",
  owner: "Support Systems",
  access: "restricted",
  grain: "one row per support case",
  columns: [
    {
      name: "case_id",
      type: "varchar",
      nullable: false,
      description: "Support case identifier",
      classification: "internal",
      contracted: true
    },
    {
      name: "case_status",
      type: "varchar",
      nullable: false,
      description: "Current case status",
      classification: "internal"
    }
  ]
};

const supportScenario: ChangeScenario = {
  id: "support-token-export",
  shortName: "Support export",
  title: "Add debugging context to support export",
  summary:
    "A small additive change includes an opaque session_token field for support diagnostics.",
  pullRequest: "PR #1851",
  author: "Noah Williams",
  changedAssetId: supportCurrent.id,
  sourceSql: `SELECT
  c.case_id,
  c.case_status,
  s.session_token
FROM support.cases c
LEFT JOIN auth.sessions s ON s.account_id = c.account_id`,
  current: supportCurrent,
  proposed: {
    ...supportCurrent,
    columns: [
      ...supportCurrent.columns,
      {
        name: "session_token",
        type: "varchar",
        nullable: true,
        description: "Opaque session debugging context",
        classification: "internal"
      }
    ]
  },
  assets: [
    {
      ...supportCurrent,
      id: "support.cases",
      name: "support.cases",
      kind: "source"
    },
    {
      ...supportCurrent,
      id: "auth.sessions",
      name: "auth.sessions",
      kind: "source",
      owner: "Identity"
    },
    supportCurrent
  ],
  lineage: [
    { from: "support.cases", to: supportCurrent.id },
    { from: "auth.sessions", to: supportCurrent.id }
  ],
  checks: [
    {
      id: "case-row-count",
      name: "Case row count",
      status: "pass",
      actual: "+0.0%",
      expected: "within +/- 1.0%",
      detail: "The candidate preserves the current case grain.",
      severity: "warning"
    }
  ]
};

export const SCENARIOS: ChangeScenario[] = [billingScenario, supportScenario];

export function getScenario(id: string): ChangeScenario {
  const scenario = SCENARIOS.find((candidate) => candidate.id === id);
  if (!scenario) throw new Error(`Unknown change scenario: ${id}`);
  return scenario;
}
