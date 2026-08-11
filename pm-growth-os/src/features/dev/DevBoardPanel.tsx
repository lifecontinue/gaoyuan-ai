import { useMemo, useState } from 'react';
import { SectionCard } from '../../components/ui/SectionCard';
import { formatUsd } from '../../lib/model-telemetry';
import { notify } from '../../lib/notifications';
import { useAppStore } from '../../store/app-store';
import type { UsageLog } from '../../types/domain';

const TOKEN_BUDGET = 50_000;

type DevBoardPanelProps = {
  compact?: boolean;
  userId?: string;
};

export function DevBoardPanel({ compact = false, userId = 'local-user' }: DevBoardPanelProps) {
  const clearModelTraces = useAppStore((state) => state.clearModelTraces);
  const exportUsageLogs = useAppStore((state) => state.exportUsageLogs);
  const syncBridgeUsageLogs = useAppStore((state) => state.syncBridgeUsageLogs);
  const toolConnectors = useAppStore((state) => state.toolConnectors);
  const traces = useAppStore((state) => state.modelTraces);
  const usageLogs = useAppStore((state) => state.usageLogs);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const summary = summarizeUsageLogs(usageLogs);
  const usagePercent = Math.min(100, Math.round((summary.totalTokens / TOKEN_BUDGET) * 100));
  const featureRows = summarizeByFeature(usageLogs);
  const sortedUsageLogs = useMemo(() => sortUsageLogs(usageLogs), [usageLogs]);
  const traceLimit = compact ? 3 : 8;
  const recentUsageLogs = sortedUsageLogs.slice(0, traceLimit);
  const langfuseConnector = toolConnectors.find((connector) => connector.id === 'langfuse-trace-sink');
  const langfuseStatus =
    langfuseConnector?.status === 'configured' || langfuseConnector?.status === 'enabled'
      ? 'ready'
      : 'setup';

  if (compact) {
    return (
      <>
        <div className="dev-sidebar-stack">
          <SectionCard
            title="Cost Proxy"
            subtitle="Private traces"
          >
            <div className="dev-board dev-board-compact">
              <div className="dev-compact-summary">
                <Metric label="Cost" value={formatUsd(summary.estimatedCostUsd)} />
                <Metric
                  label={`${summary.totalCalls.toLocaleString()} calls`}
                  value={summary.totalTokens.toLocaleString()}
                />
              </div>

              <div className="dev-sink-row">
                <span>Langfuse sink</span>
                <strong>{langfuseStatus}</strong>
              </div>

              <div className="dev-compact-controls">
                <button
                  className="ghost-button"
                  onClick={() => {
                    void syncBridgeUsageLogs(true);
                  }}
                  type="button"
                >
                  Sync Bridge
                </button>
                <button
                  className="ghost-button"
                  disabled={usageLogs.length === 0}
                  onClick={() => setIsHistoryOpen(true)}
                  type="button"
                >
                  History
                </button>
              </div>

              <div className="trace-list trace-list-compact">
                <div className="section-inline-header">
                  <strong>Recent</strong>
                  <span className="muted-text">{Math.min(3, usageLogs.length)} of {usageLogs.length}</span>
                </div>
                {recentUsageLogs.length > 0 ? (
                  recentUsageLogs.map((log) => <UsageLogRow compact key={log.id} log={log} />)
                ) : (
                  <p className="muted-text">
                    No traces yet. Use Sync Bridge only when the local usage API is running.
                  </p>
                )}
              </div>
            </div>
          </SectionCard>
        </div>
        {isHistoryOpen ? (
          <UsageHistoryModal logs={sortedUsageLogs} onClose={() => setIsHistoryOpen(false)} />
        ) : null}
      </>
    );
  }

  return (
    <div className="view-stack">
      <SectionCard
        title="Development Board"
        subtitle="Private cost and trace proxy"
        actionLabel="Export usage_logs"
        actionDisabled={usageLogs.length === 0}
        onAction={() => downloadJson(exportUsageLogs())}
      >
        <div className="dev-board">
          <div className="dev-hero-card">
            <div>
              <span className="snapshot-label">Token Budget</span>
              <strong>{summary.totalTokens.toLocaleString()} tokens</strong>
              <p>{usagePercent}% of the local planning budget used.</p>
            </div>
            <div className="progress-bar dev-budget-bar">
              <span style={{ width: `${usagePercent}%` }} />
            </div>
          </div>

          <div className="dev-metric-grid">
            <Metric label="Calls" value={summary.totalCalls.toLocaleString()} />
            <Metric label="Prompt" value={summary.promptTokens.toLocaleString()} />
            <Metric label="Completion" value={summary.completionTokens.toLocaleString()} />
            <Metric label="Cost" value={formatUsd(summary.estimatedCostUsd)} />
          </div>

          <AutomaticGatewayStatus userId={userId} />

          <div className="dev-split-grid">
            <div className="summary-block">
              <strong>Usage by Feature</strong>
              {featureRows.length > 0 ? (
                <div className="agent-usage-list">
                  {featureRows.map((row) => (
                    <div className="agent-usage-row" key={`${row.feature}-${row.model}`}>
                      <div>
                        <strong>{row.feature}</strong>
                        <span>{row.calls} calls</span>
                      </div>
                      <span>{row.tokens.toLocaleString()} tokens</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted-text">No agent traces yet.</p>
              )}
            </div>

            <div className="summary-block">
              <strong>Gateway Controls</strong>
              <p>
                Usage is calculated automatically from instrumented calls. No manual token entry is
                required.
              </p>
              <div className="detail-actions">
                <button
                  className="ghost-button"
                  onClick={() => {
                    void syncBridgeUsageLogs(true);
                  }}
                  type="button"
                >
                  Sync Bridge
                </button>
                <button
                  className="danger-button"
                  disabled={traces.length === 0 && usageLogs.length === 0}
                  onClick={clearModelTraces}
                  type="button"
                >
                  Clear Traces
                </button>
              </div>
            </div>
          </div>

          <div className="trace-list">
            <div className="section-inline-header">
              <strong>usage_logs</strong>
              <span className="muted-text">{usageLogs.length} rows</span>
            </div>
            {recentUsageLogs.length > 0 ? (
              recentUsageLogs.map((log) => <UsageLogRow key={log.id} log={log} />)
            ) : (
              <div className="empty-state">
                <div className="empty-state-icon">T</div>
                <h3>No traces yet</h3>
                <p>Save evidence, generate a task, or run an instrumented workflow.</p>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function UsageHistoryModal({ logs, onClose }: { logs: UsageLog[]; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-modal="true"
        className="modal-panel modal-panel-wide usage-history-panel"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <div>
            <p className="section-eyebrow">Private cost and trace proxy</p>
            <strong>usage_logs history</strong>
          </div>
          <button
            aria-label="Close usage history"
            className="icon-button"
            onClick={onClose}
            title="Close usage history"
            type="button"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
            >
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="usage-history-table" role="table" aria-label="Usage log history">
          <div className="usage-history-row usage-history-head" role="row">
            <span>Feature</span>
            <span>Model</span>
            <span>Prompt</span>
            <span>Completion</span>
            <span>Cost</span>
            <span>Latency</span>
            <span>Created</span>
          </div>
          {logs.length > 0 ? (
            logs.map((log) => (
              <div className="usage-history-row" key={log.id} role="row">
                <span>{log.feature}</span>
                <span>{log.model}</span>
                <span>{log.prompt_tokens.toLocaleString()}</span>
                <span>{log.completion_tokens.toLocaleString()}</span>
                <span>{formatUsd(log.cost)}</span>
                <span>{log.latency} ms</span>
                <span>{formatDateTime(log.created_at)}</span>
              </div>
            ))
          ) : (
            <p className="muted-text">No usage logs yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function UsageLogRow({ compact = false, log }: { compact?: boolean; log: UsageLog }) {
  return (
    <article className={compact ? 'trace-item usage-log-row usage-log-row-compact' : 'trace-item usage-log-row'}>
      <div className="section-inline-header">
        <strong>{log.feature}</strong>
        <span>{formatUsd(log.cost)}</span>
      </div>
      {compact ? null : <p>{log.user_id}</p>}
      <small>
        {log.prompt_tokens.toLocaleString()} input + {log.completion_tokens.toLocaleString()} output
        {' - '}
        {log.model}
        {' - '}
        {log.latency} ms
      </small>
    </article>
  );
}

function AutomaticGatewayStatus({ userId }: { userId: string }) {
  return (
    <div className="dev-gateway-card">
      <div>
        <span className="snapshot-label">Automatic Gateway</span>
        <strong>Usage is computed from calls</strong>
        <p className="muted-text">
          App-side Agent calls already write usage_logs automatically. VS Code/Codex usage needs a
          bridge that forwards real usage metadata from the extension or provider response.
        </p>
      </div>
      <div className="dev-gateway-total">
        <span>Current user_id</span>
        <strong>{userId}</strong>
      </div>
      <div className="dev-gateway-grid">
        <div className="gateway-status-pill gateway-status-ready">
          <strong>App Agent usage</strong>
          <span>Auto logged</span>
        </div>
        <div className="gateway-status-pill gateway-status-pending">
          <strong>VS Code usage</strong>
          <span>Bridge required</span>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="telemetry-metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function summarizeUsageLogs(usageLogs: UsageLog[]) {
  return usageLogs.reduce(
    (summary, log) => {
      const totalTokens = log.prompt_tokens + log.completion_tokens;

      return {
        totalCalls: summary.totalCalls + 1,
        promptTokens: summary.promptTokens + log.prompt_tokens,
        completionTokens: summary.completionTokens + log.completion_tokens,
        totalTokens: summary.totalTokens + totalTokens,
        estimatedCostUsd: summary.estimatedCostUsd + log.cost,
      };
    },
    {
      totalCalls: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostUsd: 0,
    },
  );
}

function summarizeByFeature(usageLogs: UsageLog[]) {
  const rows = new Map<string, { calls: number; feature: string; model: string; tokens: number }>();

  for (const log of usageLogs) {
    const key = `${log.feature}-${log.model}`;
    const row = rows.get(key) ?? {
      calls: 0,
      feature: log.feature,
      model: log.model,
      tokens: 0,
    };

    row.calls += 1;
    row.tokens += log.prompt_tokens + log.completion_tokens;
    rows.set(key, row);
  }

  return Array.from(rows.values()).sort((a, b) => b.tokens - a.tokens);
}

function sortUsageLogs(usageLogs: UsageLog[]) {
  return usageLogs
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function downloadJson(content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `pm-growth-dev-traces-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify('usage_logs exported.', 'success');
}
