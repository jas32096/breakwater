import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import {
  convertToModelMessages,
  pruneMessages,
  simulateStreamingMiddleware,
  stepCountIs,
  streamText,
  tool,
  wrapLanguageModel
} from "ai";
import { z } from "zod";
import { getScenario, SCENARIOS } from "./domain/fixtures";
import {
  evaluateScenario,
  validateEvidenceReferences
} from "./domain/review-engine";
import type {
  AuditEvent,
  BreakwaterState,
  PolicyMemory,
  ReviewResult,
  RolloutProgress
} from "./domain/types";

const MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

const initialState: BreakwaterState = {
  selectedScenarioId: "billing-v42",
  status: "idle",
  review: null,
  workflow: null,
  memories: [],
  recentAudit: []
};

type MemoryRow = {
  id: string;
  pattern: string;
  classification: "pii" | "secret";
  instruction: string;
  created_at: string;
};

type AuditRow = {
  id: string;
  action: string;
  detail: string;
  actor: string;
  created_at: string;
};

export class BreakwaterAgent extends AIChatAgent<Env, BreakwaterState> {
  initialState = initialState;
  maxPersistedMessages = 60;
  chatRecovery = true;

  onStart() {
    this.sql`
      CREATE TABLE IF NOT EXISTS policy_memories (
        id TEXT PRIMARY KEY,
        pattern TEXT NOT NULL,
        classification TEXT NOT NULL CHECK(classification IN ('pii', 'secret')),
        instruction TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS review_history (
        scenario_id TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        decision TEXT NOT NULL,
        review_json TEXT NOT NULL,
        PRIMARY KEY (scenario_id, generated_at)
      )
    `;
    this.sql`
      CREATE TABLE IF NOT EXISTS audit_log (
        id TEXT PRIMARY KEY,
        action TEXT NOT NULL,
        detail TEXT NOT NULL,
        actor TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `;

    this.setState({
      ...this.state,
      memories: this.readMemories(),
      recentAudit: this.readAudit()
    });
  }

  private readMemories(): PolicyMemory[] {
    return this.sql<MemoryRow>`
      SELECT id, pattern, classification, instruction, created_at
      FROM policy_memories
      ORDER BY created_at DESC
    `.map((row) => ({
      id: row.id,
      pattern: row.pattern,
      classification: row.classification,
      instruction: row.instruction,
      createdAt: row.created_at
    }));
  }

  private readAudit(): AuditEvent[] {
    return this.sql<AuditRow>`
      SELECT id, action, detail, actor, created_at
      FROM audit_log
      ORDER BY created_at DESC
      LIMIT 12
    `.map((row) => ({
      id: row.id,
      action: row.action,
      detail: row.detail,
      actor: row.actor,
      createdAt: row.created_at
    }));
  }

  private appendAudit(action: string, detail: string, actor = "breakwater") {
    const event: AuditEvent = {
      id: crypto.randomUUID(),
      action,
      detail,
      actor,
      createdAt: new Date().toISOString()
    };
    this.sql`
      INSERT INTO audit_log (id, action, detail, actor, created_at)
      VALUES (${event.id}, ${event.action}, ${event.detail}, ${event.actor}, ${event.createdAt})
    `;
    return event;
  }

  private hasActiveWorkflow() {
    return Boolean(
      this.state.workflow &&
      ["deploying", "awaiting_approval"].includes(this.state.workflow.status)
    );
  }

  private runReview(scenarioId: string): ReviewResult {
    if (this.hasActiveWorkflow()) {
      throw new Error(
        "Resolve the active rollout before running another review"
      );
    }
    getScenario(scenarioId);
    this.setState({
      ...this.state,
      selectedScenarioId: scenarioId,
      status: "analyzing"
    });

    const review = evaluateScenario(scenarioId, this.readMemories());
    if (!validateEvidenceReferences(review)) {
      throw new Error("Review contains an invalid evidence reference");
    }

    this.sql`
      INSERT INTO review_history (scenario_id, generated_at, decision, review_json)
      VALUES (${scenarioId}, ${review.generatedAt}, ${review.decision}, ${JSON.stringify(review)})
    `;
    this.appendAudit(
      "review.completed",
      `${scenarioId}: ${review.findings.length} findings, decision ${review.decision}`
    );
    this.setState({
      ...this.state,
      selectedScenarioId: scenarioId,
      status: review.decision,
      review,
      workflow: null,
      memories: this.readMemories(),
      recentAudit: this.readAudit()
    });
    return review;
  }

  @callable()
  async selectScenario(scenarioId: string) {
    if (this.hasActiveWorkflow()) {
      throw new Error("Resolve the active rollout before changing scenarios");
    }
    getScenario(scenarioId);
    this.setState({
      ...this.state,
      selectedScenarioId: scenarioId,
      status: "idle",
      review: null,
      workflow: null
    });
  }

  @callable()
  async analyzeScenario(scenarioId: string) {
    return this.runReview(scenarioId);
  }

  @callable()
  async rememberPolicy(
    pattern: string,
    classification: "pii" | "secret",
    instruction: string
  ) {
    if (this.hasActiveWorkflow()) {
      throw new Error("Resolve the active rollout before changing policy");
    }
    const parsed = z
      .object({
        pattern: z
          .string()
          .min(2)
          .max(80)
          .regex(/^[a-zA-Z0-9_.*-]+$/),
        classification: z.enum(["pii", "secret"]),
        instruction: z.string().min(10).max(240)
      })
      .parse({ pattern, classification, instruction });
    const memory: PolicyMemory = {
      id: crypto.randomUUID(),
      ...parsed,
      createdAt: new Date().toISOString()
    };
    this.sql`
      INSERT INTO policy_memories (id, pattern, classification, instruction, created_at)
      VALUES (${memory.id}, ${memory.pattern}, ${memory.classification}, ${memory.instruction}, ${memory.createdAt})
    `;
    this.appendAudit(
      "memory.created",
      `${memory.pattern} classified as ${memory.classification}`,
      "reviewer"
    );
    this.setState({
      ...this.state,
      status: "idle",
      review: null,
      workflow: null,
      memories: this.readMemories(),
      recentAudit: this.readAudit()
    });
    return memory;
  }

  @callable()
  async deletePolicy(memoryId: string) {
    if (this.hasActiveWorkflow()) {
      throw new Error("Resolve the active rollout before changing policy");
    }
    this.sql`DELETE FROM policy_memories WHERE id = ${memoryId}`;
    this.appendAudit("memory.deleted", memoryId, "reviewer");
    this.setState({
      ...this.state,
      status: "idle",
      review: null,
      workflow: null,
      memories: this.readMemories(),
      recentAudit: this.readAudit()
    });
  }

  @callable()
  async startRollout() {
    const review = this.state.review;
    if (!review) throw new Error("Run a review before starting a rollout");
    if (
      this.state.workflow &&
      ["deploying", "awaiting_approval"].includes(this.state.workflow.status)
    ) {
      return this.state.workflow.id;
    }

    const workflowId = await this.runWorkflow(
      "ROLLOUT_WORKFLOW",
      {
        scenarioId: review.scenarioId,
        reviewGeneratedAt: review.generatedAt
      },
      {
        metadata: {
          scenarioId: review.scenarioId,
          decision: review.decision
        }
      }
    );
    this.appendAudit(
      "rollout.started",
      `${review.scenarioId} remediation rollout ${workflowId}`,
      "reviewer"
    );
    this.setState({
      ...this.state,
      status: "deploying",
      workflow: {
        id: workflowId,
        status: "deploying",
        stage: "queued",
        percent: 0,
        message: "Rollout queued for durable execution",
        approvalRequired: false
      },
      recentAudit: this.readAudit()
    });
    return workflowId;
  }

  @callable()
  async approveRollout(workflowId: string, reason: string) {
    if (this.state.workflow?.id !== workflowId) {
      throw new Error("Workflow is not active in this review session");
    }
    const cleanReason = z.string().min(3).max(240).parse(reason);
    this.appendAudit("rollout.approved", cleanReason, "reviewer");
    await this.approveWorkflow(workflowId, {
      reason: cleanReason,
      metadata: { approvedBy: "demo-reviewer" }
    });
    this.setState({
      ...this.state,
      status: "deploying",
      workflow: {
        ...this.state.workflow,
        status: "deploying",
        stage: "publish",
        message: "Approval recorded; resuming durable rollout",
        approvalRequired: false
      },
      recentAudit: this.readAudit()
    });
  }

  @callable()
  async rejectRollout(workflowId: string, reason: string) {
    if (this.state.workflow?.id !== workflowId) {
      throw new Error("Workflow is not active in this review session");
    }
    const cleanReason = z.string().min(3).max(240).parse(reason);
    this.appendAudit("rollout.rejected", cleanReason, "reviewer");
    this.setState({
      ...this.state,
      status: "rejected",
      workflow: {
        ...this.state.workflow,
        status: "rejected",
        stage: "rejected",
        message: cleanReason,
        approvalRequired: false
      },
      recentAudit: this.readAudit()
    });
    await this.rejectWorkflow(workflowId, { reason: cleanReason });
  }

  async recordWorkflowAudit(action: string, detail: string) {
    this.appendAudit(action, detail);
    this.setState({ ...this.state, recentAudit: this.readAudit() });
  }

  async onWorkflowProgress(
    _workflowName: string,
    workflowId: string,
    progress: unknown
  ) {
    const update = progress as RolloutProgress;
    const waiting = update.approvalRequired === true;
    this.setState({
      ...this.state,
      status: waiting ? "awaiting_approval" : "deploying",
      workflow: {
        id: workflowId,
        status: waiting ? "awaiting_approval" : "deploying",
        stage: update.stage,
        percent: update.percent,
        message: update.message,
        approvalRequired: waiting
      }
    });
  }

  async onWorkflowComplete(
    _workflowName: string,
    workflowId: string,
    _result?: unknown
  ) {
    this.appendAudit(
      "rollout.verified",
      `${workflowId} published and verified`
    );
    this.setState({
      ...this.state,
      status: "verified",
      workflow: {
        id: workflowId,
        status: "verified",
        stage: "verified",
        percent: 100,
        message: "Candidate published; post-deploy controls passed",
        approvalRequired: false
      },
      recentAudit: this.readAudit()
    });
  }

  async onWorkflowError(
    _workflowName: string,
    workflowId: string,
    error: string
  ) {
    if (this.state.status === "rejected") return;
    this.appendAudit("rollout.failed", error);
    this.setState({
      ...this.state,
      status: "failed",
      workflow: {
        id: workflowId,
        status: "failed",
        stage: "failed",
        percent: this.state.workflow?.percent ?? 0,
        message: error,
        approvalRequired: false
      },
      recentAudit: this.readAudit()
    });
  }

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const scenarioId = this.state.selectedScenarioId;
    const latestUserText = [...this.messages]
      .reverse()
      .find((message) => message.role === "user")
      ?.parts.filter((part) => part.type === "text")
      .map((part) => part.text)
      .join(" ");
    const reviewRequested = /\b(review|safe|ship|evaluate|controls?)\b/i.test(
      latestUserText ?? ""
    );

    const result = streamText({
      model: wrapLanguageModel({
        model: workersai(MODEL, { sessionAffinity: this.sessionAffinity }),
        // Workers AI currently returns both native and OpenAI SSE text fields.
        middleware: simulateStreamingMiddleware()
      }),
      system: `You are Breakwater, an evidence-first change-control agent for analytical data platforms.

The active change is ${scenarioId}. Your job is to help a data engineer determine whether it is safe to ship.

Rules:
- Evaluate the active change before drawing conclusions. Inspect the catalog when additional context is useful.
- Treat tool output as the only source of facts. Never invent schemas, metrics, lineage, or policies.
- Cite evidence identifiers in square brackets for every concrete risk claim.
- Keep the response concise: decision, highest-risk findings, and safe next action.
- Never claim that a rollout is published until the durable Workflow reports completion.
- A blocked review can start a remediation rollout. That Workflow stages recommended fixes and reruns controls before asking for human approval.
- Only store policy memory when the user explicitly asks you to remember a durable organizational rule. The memory tool requires their approval.
- Do not expose hidden reasoning or chain-of-thought. Show tool activity and evidence instead.

Available scenarios: ${SCENARIOS.map((scenario) => `${scenario.id} (${scenario.title})`).join(", ")}.`,
      messages: pruneMessages({
        messages: await convertToModelMessages(this.messages),
        toolCalls: "before-last-2-messages",
        reasoning: "before-last-message"
      }),
      tools: {
        inspectCatalog: tool({
          description:
            "Inspect the current and proposed schema, lineage, profile controls, and stored organization policies for the active change.",
          inputSchema: z.object({}),
          execute: async () => {
            const scenario = getScenario(scenarioId);
            return {
              scenarioId: scenario.id,
              current: scenario.current,
              proposed: scenario.proposed,
              lineage: scenario.lineage,
              checks: scenario.checks,
              policies: this.readMemories()
            };
          }
        }),
        evaluateChange: tool({
          description:
            "Run deterministic contract, governance, transitive-lineage, quality, and learned-policy controls for the active change. Returns the authoritative review and evidence IDs.",
          inputSchema: z.object({}),
          execute: async () => this.runReview(scenarioId)
        }),
        rememberPolicy: tool({
          description:
            "Persist an explicit organization-wide column classification rule. Use only when the user says to remember a policy.",
          inputSchema: z.object({
            pattern: z.string().describe("Column glob such as *_token"),
            classification: z.enum(["pii", "secret"]),
            instruction: z.string().describe("The durable policy and rationale")
          }),
          needsApproval: true,
          execute: async ({ pattern, classification, instruction }) =>
            this.rememberPolicy(pattern, classification, instruction)
        })
      },
      stopWhen: stepCountIs(6),
      prepareStep: reviewRequested
        ? ({ stepNumber }) =>
            stepNumber === 0
              ? {
                  activeTools: ["evaluateChange"],
                  toolChoice: {
                    type: "tool" as const,
                    toolName: "evaluateChange" as const
                  }
                }
              : { toolChoice: "none" as const }
        : undefined,
      temperature: 0.2,
      abortSignal: options?.abortSignal
    });

    return result.toUIMessageStreamResponse();
  }
}
