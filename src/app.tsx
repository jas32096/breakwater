import { useCallback, useEffect, useRef, useState } from "react";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  ClockCountdownIcon,
  DatabaseIcon,
  GitBranchIcon,
  LockKeyIcon,
  PaperPlaneRightIcon,
  PlayIcon,
  RobotIcon,
  ShieldCheckIcon,
  SparkleIcon,
  StopIcon,
  WarningCircleIcon,
  XCircleIcon
} from "@phosphor-icons/react";
import type { BreakwaterAgent } from "./agent";
import { SCENARIOS, getScenario } from "./domain/fixtures";
import type {
  BreakwaterState,
  Finding,
  ReviewStatus,
  Severity
} from "./domain/types";

const EMPTY_STATE: BreakwaterState = {
  selectedScenarioId: "billing-v42",
  status: "idle",
  review: null,
  workflow: null,
  memories: [],
  recentAudit: []
};

function sessionName() {
  const key = "breakwater-session";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const created = `review-${crypto.randomUUID()}`;
  localStorage.setItem(key, created);
  return created;
}

function statusLabel(status: ReviewStatus) {
  return status.replaceAll("_", " ");
}

function StatusPill({ status }: { status: ReviewStatus }) {
  return (
    <span className={`status-pill status-${status}`}>
      {statusLabel(status)}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "blocker") return <XCircleIcon weight="fill" />;
  if (severity === "warning") return <WarningCircleIcon weight="fill" />;
  return <CheckCircleIcon weight="fill" />;
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <article className={`finding finding-${finding.severity}`}>
      <div className="finding-icon">
        <SeverityIcon severity={finding.severity} />
      </div>
      <div>
        <div className="finding-heading">
          <span className="severity-label">{finding.severity}</span>
          <span className="evidence-refs">
            {finding.evidenceIds.join(" · ")}
          </span>
        </div>
        <h4>{finding.title}</h4>
        <p>{finding.summary}</p>
        <div className="recommendation">
          <strong>Safe path</strong>
          <span>{finding.recommendation}</span>
        </div>
      </div>
    </article>
  );
}

function ToolPart({
  part,
  approve
}: {
  part: UIMessage["parts"][number];
  approve: (response: { id: string; approved: boolean }) => void;
}) {
  if (!isToolUIPart(part)) return null;
  const name = getToolName(part);

  if (part.state === "approval-requested" && "approval" in part) {
    const approvalId = (part.approval as { id?: string }).id;
    return (
      <div className="tool-call tool-approval">
        <div className="tool-label">
          <LockKeyIcon weight="fill" /> Policy write requires approval
        </div>
        <code>{JSON.stringify(part.input)}</code>
        <div className="tool-actions">
          <button
            className="button button-primary button-small"
            onClick={() =>
              approvalId && approve({ id: approvalId, approved: true })
            }
          >
            Approve memory
          </button>
          <button
            className="button button-quiet button-small"
            onClick={() =>
              approvalId && approve({ id: approvalId, approved: false })
            }
          >
            Reject
          </button>
        </div>
      </div>
    );
  }

  if (part.state === "output-available") {
    const output = part.output as {
      decision?: string;
      findings?: unknown[];
      pattern?: string;
    };
    return (
      <div className="tool-call tool-complete">
        <CheckCircleIcon weight="fill" />
        <span>{name}</span>
        {output?.decision && (
          <code>
            {output.decision} · {output.findings?.length ?? 0} findings
          </code>
        )}
        {output?.pattern && <code>{output.pattern} saved</code>}
      </div>
    );
  }

  if (part.state === "output-error" || part.state === "output-denied") {
    return (
      <div className="tool-call tool-error">
        <XCircleIcon weight="fill" /> {name} did not complete
      </div>
    );
  }

  return (
    <div className="tool-call tool-running">
      <ArrowsClockwiseIcon className="spin" /> Running {name}
    </div>
  );
}

function ChatPanel({
  agent,
  connected
}: {
  agent: ReturnType<typeof useAgent<BreakwaterAgent, BreakwaterState>>;
  connected: boolean;
}) {
  const [input, setInput] = useState("");
  const messagesEnd = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, addToolApprovalResponse, status, stop } =
    useAgentChat({
      agent,
      experimental_throttle: 80
    });
  const isStreaming = status === "streaming" || status === "submitted";

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function send(text = input) {
    const clean = text.trim();
    if (!clean || isStreaming) return;
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text: clean }] });
  }

  return (
    <section className="chat-panel">
      <div className="panel-heading chat-heading">
        <div>
          <span className="eyebrow">Evidence agent</span>
          <h2>Review thread</h2>
        </div>
        <span className={`connection ${connected ? "connected" : ""}`}>
          <i /> {connected ? "live" : "connecting"}
        </span>
      </div>
      <div className="messages">
        {messages.length === 0 && (
          <div className="empty-chat">
            <RobotIcon size={28} />
            <h3>Interrogate the change</h3>
            <p>
              Breakwater inspects the catalog, runs deterministic controls, and
              explains only what the evidence supports.
            </p>
            <button
              className="prompt-chip"
              disabled={!connected}
              onClick={() => send("Review this change. Is it safe to ship?")}
            >
              Review this change
            </button>
            <button
              className="prompt-chip"
              disabled={!connected}
              onClick={() =>
                send("What is the smallest safe rollout for this change?")
              }
            >
              Propose a safe rollout
            </button>
          </div>
        )}
        {messages.map((message) => (
          <div key={message.id} className={`message message-${message.role}`}>
            <span className="message-author">
              {message.role === "user" ? "Reviewer" : "Breakwater"}
            </span>
            {message.parts.map((part, index) => {
              if (isToolUIPart(part)) {
                return (
                  <ToolPart
                    key={`${message.id}-${index}`}
                    part={part}
                    approve={addToolApprovalResponse}
                  />
                );
              }
              if (part.type === "text" && part.text) {
                return (
                  <div className="message-text" key={`${message.id}-${index}`}>
                    {part.text}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
        <div ref={messagesEnd} />
      </div>
      <form
        className="chat-input"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send();
            }
          }}
          placeholder="Ask about risk, lineage, or policy..."
          rows={2}
          disabled={!connected || isStreaming}
        />
        {isStreaming ? (
          <button
            type="button"
            className="send-button"
            onClick={stop}
            aria-label="Stop"
          >
            <StopIcon weight="fill" />
          </button>
        ) : (
          <button
            type="submit"
            className="send-button"
            disabled={!connected || !input.trim()}
            aria-label="Send"
          >
            <PaperPlaneRightIcon weight="fill" />
          </button>
        )}
      </form>
    </section>
  );
}

function LineageView({ scenarioId }: { scenarioId: string }) {
  const scenario = getScenario(scenarioId);
  const upstreamIds = scenario.lineage
    .filter((edge) => edge.to === scenario.changedAssetId)
    .map((edge) => edge.from);
  const downstreamIds = scenario.lineage
    .filter((edge) => edge.from === scenario.changedAssetId)
    .map((edge) => edge.to);
  return (
    <div className="lineage-map">
      <div className="lineage-column">
        <span className="lineage-label">Upstream</span>
        {upstreamIds.map((id) => (
          <div className="asset-node" key={id}>
            <DatabaseIcon />
            <span>{id}</span>
          </div>
        ))}
      </div>
      <ArrowRightIcon className="lineage-arrow" />
      <div className="lineage-column lineage-center">
        <span className="lineage-label">Changed model</span>
        <div className="asset-node changed-node">
          <GitBranchIcon weight="fill" />
          <span>{scenario.changedAssetId}</span>
        </div>
      </div>
      <ArrowRightIcon className="lineage-arrow" />
      <div className="lineage-column">
        <span className="lineage-label">Direct consumers</span>
        {downstreamIds.map((id) => (
          <div className="asset-node downstream-node" key={id}>
            <span>{id}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function SchemaDiff({ scenarioId }: { scenarioId: string }) {
  const scenario = getScenario(scenarioId);
  const current = new Map(
    scenario.current.columns.map((column) => [column.name, column])
  );
  const proposed = new Map(
    scenario.proposed.columns.map((column) => [column.name, column])
  );
  const names = [...new Set([...current.keys(), ...proposed.keys()])];
  return (
    <div className="schema-diff">
      <div className="schema-row schema-header">
        <span>Column</span>
        <span>Current</span>
        <span>Proposed</span>
      </div>
      {names.map((name) => {
        const before = current.get(name);
        const after = proposed.get(name);
        const change = !before ? "added" : !after ? "removed" : "unchanged";
        return (
          <div className={`schema-row schema-${change}`} key={name}>
            <code>{name}</code>
            <span>{before?.type ?? "-"}</span>
            <span>
              {after?.type ?? "-"}
              {after?.classification === "pii" && <em>PII</em>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function WorkflowPanel({
  state,
  onStart,
  onApprove,
  onReject,
  busy
}: {
  state: BreakwaterState;
  onStart: () => void;
  onApprove: (reason: string) => void;
  onReject: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = useState(
    "Controls passed; approved for publication."
  );
  const workflow = state.workflow;
  const plan = state.review?.rolloutPlan ?? [];
  const stageIndex = plan.findIndex((step) => step.id === workflow?.stage);
  return (
    <section className="workflow-panel panel">
      <div className="panel-heading workflow-heading">
        <div>
          <span className="eyebrow">Durable execution</span>
          <h2>Remediation rollout</h2>
        </div>
        {workflow && <StatusPill status={workflow.status} />}
      </div>
      {!state.review ? (
        <div className="workflow-empty">
          <ClockCountdownIcon /> Complete a review to generate a rollout plan.
        </div>
      ) : (
        <>
          <div className="workflow-steps">
            {plan.map((step, index) => {
              const complete =
                workflow?.status === "verified" || index < stageIndex;
              const active = step.id === workflow?.stage;
              return (
                <div
                  className={`workflow-step ${complete ? "step-complete" : ""} ${active ? "step-active" : ""}`}
                  key={step.id}
                >
                  <span className="step-marker">
                    {complete ? <CheckCircleIcon weight="fill" /> : index + 1}
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <p>{step.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {workflow && (
            <div className="workflow-progress">
              <div>
                <span>{workflow.stage}</span>
                <strong>{workflow.percent}%</strong>
              </div>
              <div className="progress-track">
                <i style={{ width: `${workflow.percent}%` }} />
              </div>
              <p>{workflow.message}</p>
            </div>
          )}
          {!workflow && (
            <button
              className="button button-primary rollout-button"
              onClick={onStart}
              disabled={busy}
            >
              <PlayIcon weight="fill" /> Start safe rollout
            </button>
          )}
          {workflow?.approvalRequired && (
            <div className="approval-gate">
              <div className="approval-title">
                <ShieldCheckIcon weight="fill" />
                <div>
                  <strong>Publication is paused</strong>
                  <span>7 controls passed · aggregate delta 0.2%</span>
                </div>
              </div>
              <label>
                Decision reason
                <input
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="approval-actions">
                <button
                  className="button button-primary"
                  onClick={() => onApprove(reason)}
                  disabled={busy || reason.trim().length < 3}
                >
                  Approve and publish
                </button>
                <button
                  className="button button-danger"
                  onClick={() => onReject(reason)}
                  disabled={busy || reason.trim().length < 3}
                >
                  Reject
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"change" | "evidence" | "operations">(
    "change"
  );
  const [name] = useState(sessionName);
  const agent = useAgent<BreakwaterAgent, BreakwaterState>({
    agent: "BreakwaterAgent",
    name,
    onOpen: useCallback(() => setConnected(true), []),
    onClose: useCallback(() => setConnected(false), []),
    onError: useCallback(
      (event: Event) => console.error("Agent error", event),
      []
    )
  });
  const state = agent.state ?? EMPTY_STATE;
  const scenario = getScenario(state.selectedScenarioId);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
    } catch (error) {
      console.error(error);
    } finally {
      setBusy(false);
    }
  }

  const workflowActions = {
    onStart: () => perform(() => agent.stub.startRollout()),
    onApprove: (reason: string) =>
      state.workflow &&
      perform(() => agent.stub.approveRollout(state.workflow!.id, reason)),
    onReject: (reason: string) =>
      state.workflow &&
      perform(() => agent.stub.rejectRollout(state.workflow!.id, reason))
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheckIcon weight="fill" />
          </div>
          <div>
            <strong>Breakwater</strong>
            <span>Lakehouse change control</span>
          </div>
        </div>
        <div className="runtime-badges">
          <span>
            <SparkleIcon weight="fill" /> Llama 3.3 · Workers AI
          </span>
          <span>
            <DatabaseIcon weight="fill" /> Durable state
          </span>
          <span className={connected ? "runtime-live" : ""}>
            <i /> {connected ? "Agent connected" : "Connecting"}
          </span>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-section">
          <span className="sidebar-label">Change queue</span>
          {SCENARIOS.map((item) => (
            <button
              key={item.id}
              className={`scenario-button ${item.id === scenario.id ? "active" : ""}`}
              onClick={() => perform(() => agent.stub.selectScenario(item.id))}
              disabled={busy}
            >
              <span className="scenario-icon">
                {item.id === "billing-v42" ? <DatabaseIcon /> : <LockKeyIcon />}
              </span>
              <span>
                <strong>{item.shortName}</strong>
                <small>{item.pullRequest}</small>
              </span>
              {item.id === scenario.id && <i />}
            </button>
          ))}
        </div>
        <div className="memory-section">
          <div className="memory-heading">
            <span className="sidebar-label">Policy memory</span>
            <span>{state.memories.length}</span>
          </div>
          {state.memories.length === 0 ? (
            <p>No organization-specific rules learned yet.</p>
          ) : (
            state.memories.map((memory) => (
              <div className="memory-item" key={memory.id}>
                <code>{memory.pattern}</code>
                <span>{memory.classification}</span>
                <button
                  onClick={() =>
                    perform(() => agent.stub.deletePolicy(memory.id))
                  }
                  aria-label={`Delete ${memory.pattern} policy`}
                >
                  ×
                </button>
              </div>
            ))
          )}
          <p className="memory-hint">
            Ask the agent to remember that <code>*_token</code> fields are
            secret, then review the support export.
          </p>
        </div>
        <div className="sidebar-footer">
          <span>Session isolated</span>
          <code>{name.slice(7, 15)}</code>
        </div>
      </aside>

      <main className="workspace">
        <section className="change-header">
          <div>
            <div className="change-meta">
              <span>{scenario.pullRequest}</span>
              <span>{scenario.author}</span>
              <StatusPill status={state.status} />
            </div>
            <h1>{scenario.title}</h1>
            <p>{scenario.summary}</p>
          </div>
          <button
            className="button button-primary review-button"
            disabled={!connected || busy || state.status === "analyzing"}
            onClick={() =>
              perform(() => agent.stub.analyzeScenario(scenario.id))
            }
          >
            {state.status === "analyzing" ? (
              <ArrowsClockwiseIcon className="spin" />
            ) : (
              <ShieldCheckIcon weight="fill" />
            )}{" "}
            Run controls
          </button>
        </section>

        <nav className="mobile-tabs">
          {(["change", "evidence", "operations"] as const).map((item) => (
            <button
              key={item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="workspace-grid">
          <div className={`main-column tab-${tab}`}>
            <section className="panel lineage-panel change-view">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Impact graph</span>
                  <h2>Lineage blast radius</h2>
                </div>
                <span className="panel-stat">
                  {state.review?.impactedAssetIds.length ?? "?"} downstream
                </span>
              </div>
              <LineageView scenarioId={scenario.id} />
            </section>
            <section className="panel diff-panel change-view">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Proposed transformation</span>
                  <h2>Schema and SQL diff</h2>
                </div>
                <code className="file-name">models/{scenario.id}.sql</code>
              </div>
              <div className="diff-grid">
                <pre className="sql-block">
                  <code>{scenario.sourceSql}</code>
                </pre>
                <SchemaDiff scenarioId={scenario.id} />
              </div>
            </section>
            <section className="panel findings-panel evidence-view">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">Authoritative controls</span>
                  <h2>Evidence-backed findings</h2>
                </div>
                {state.review && (
                  <span className="panel-stat">
                    {state.review.evidence.length} evidence records
                  </span>
                )}
              </div>
              {!state.review ? (
                <div className="findings-empty">
                  <ShieldCheckIcon />
                  <div>
                    <strong>No review has run</strong>
                    <p>
                      Run controls or ask the agent to evaluate this change.
                    </p>
                  </div>
                </div>
              ) : state.review.findings.length === 0 ? (
                <div className="findings-empty findings-safe">
                  <CheckCircleIcon weight="fill" />
                  <div>
                    <strong>No blocking evidence found</strong>
                    <p>
                      The current deterministic controls consider this change
                      ready.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="findings-list">
                  {state.review.findings.map((finding) => (
                    <FindingCard finding={finding} key={finding.id} />
                  ))}
                </div>
              )}
              {state.review && state.review.evidence.length > 0 && (
                <details className="evidence-drawer">
                  <summary>Inspect raw evidence</summary>
                  <div>
                    {state.review.evidence.map((evidence) => (
                      <article key={evidence.id}>
                        <code>{evidence.id}</code>
                        <strong>{evidence.label}</strong>
                        <p>{evidence.detail}</p>
                      </article>
                    ))}
                  </div>
                </details>
              )}
            </section>
            <div className="operations-view">
              <WorkflowPanel state={state} busy={busy} {...workflowActions} />
              <section className="panel audit-panel">
                <div className="panel-heading">
                  <div>
                    <span className="eyebrow">Append-only record</span>
                    <h2>Audit trail</h2>
                  </div>
                </div>
                {state.recentAudit.length === 0 ? (
                  <p className="audit-empty">Actions will be recorded here.</p>
                ) : (
                  <div className="audit-list">
                    {state.recentAudit.map((event) => (
                      <div className="audit-event" key={event.id}>
                        <i />
                        <div>
                          <strong>{event.action}</strong>
                          <p>{event.detail}</p>
                        </div>
                        <time>
                          {new Date(event.createdAt).toLocaleTimeString()}
                        </time>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </div>
          <div className="right-column">
            <ChatPanel agent={agent} connected={connected} />
            <WorkflowPanel state={state} busy={busy} {...workflowActions} />
          </div>
        </div>
      </main>
    </div>
  );
}
