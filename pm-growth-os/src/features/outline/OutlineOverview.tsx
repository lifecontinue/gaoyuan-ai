import { useState } from 'react';
import { useAppStore } from '../../store/app-store';
import type { Capability } from '../../types/domain';

type OutlineOverviewProps = {
  onNavigateToGrowth?: () => void;
};

export function OutlineOverview({ onNavigateToGrowth }: OutlineOverviewProps) {
  const [detailCapabilityId, setDetailCapabilityId] = useState<string | null>(null);
  const capabilities = useAppStore((state) => state.capabilities);
  const generateCapabilityCoachPlan = useAppStore(
    (state) => state.generateCapabilityCoachPlan,
  );
  const selectCapability = useAppStore((state) => state.selectCapability);
  const selectedCapabilityId = useAppStore((state) => state.selectedCapabilityId);
  const exploredCount = capabilities.filter((item) => item.progress > 0).length;
  const weakestCapability = capabilities.slice().sort((a, b) => a.progress - b.progress)[0];
  const overallProgress = Math.round(
    capabilities.reduce((sum, item) => sum + item.progress, 0) / capabilities.length,
  );
  const detailCapability =
    capabilities.find((capability) => capability.id === detailCapabilityId) ?? null;
  const graphNodes = buildGrowthGraph(capabilities);

  return (
    <section className="growth-map-view">
      <div className="growth-map-topbar">
        <div>
          <span className="snapshot-label">AI PM Growth Knowledge Graph</span>
          <strong>Global capability and task map</strong>
          <small>
            {overallProgress}% overall · {exploredCount}/{capabilities.length} active dimensions
          </small>
        </div>
        <button
          className="solid-button"
          onClick={() => startLearningTask(weakestCapability.id)}
          type="button"
        >
          Start Weakest Gap
        </button>
      </div>
      <div className="growth-graph-shell">
        <div className="growth-graph-canvas" role="img" aria-label="AI PM Growth Map knowledge graph">
          <svg className="growth-graph-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            {graphNodes.flatMap((node) => [
              <line
                className="growth-graph-line growth-graph-line-main"
                key={`${node.id}-main`}
                x1="50"
                x2={node.x}
                y1="50"
                y2={node.y}
              />,
              ...node.tasks.map((task) => (
                <line
                  className="growth-graph-line growth-graph-line-task"
                  key={`${node.id}-${task.id}`}
                  x1={node.x}
                  x2={task.x}
                  y1={node.y}
                  y2={task.y}
                />
              )),
            ])}
          </svg>
          <button className="growth-graph-center" type="button">
            <span>PM Growth OS</span>
            <strong>{overallProgress}%</strong>
            <small>overall</small>
          </button>
          {graphNodes.map((node) => (
            <button
              className={`growth-graph-node capability-node ${
                selectedCapabilityId === node.capability.id ? 'growth-graph-node-active' : ''
              }`}
              data-category={node.capability.category}
              key={node.id}
              onClick={() => viewCapabilityDetails(node.capability.id)}
              style={{ left: `${node.x}%`, top: `${node.y}%` }}
              type="button"
            >
              <span>{node.capability.category}</span>
              <strong>{node.capability.name}</strong>
              <small>{node.capability.progress}% progress</small>
            </button>
          ))}
          {graphNodes.flatMap((node) =>
            node.tasks.map((task) => (
              <button
                className="growth-graph-node task-node"
                key={task.id}
                onClick={() => startLearningTask(node.capability.id)}
                style={{ left: `${task.x}%`, top: `${task.y}%` }}
                type="button"
              >
                <span>{task.type}</span>
                <strong>{task.label}</strong>
              </button>
            )),
          )}
        </div>
      </div>
      {detailCapability ? (
        <div className="growth-map-detail-panel">
          <div className="section-inline-header">
            <div>
              <p className="section-eyebrow">{detailCapability.category}</p>
              <h3>{detailCapability.name}</h3>
            </div>
            <span className="progress-number">{detailCapability.progress}%</span>
          </div>
          <p>{detailCapability.summary}</p>
          <div className="progress-bar">
            <span style={{ width: `${detailCapability.progress}%` }} />
          </div>
          <div className="growth-map-detail-meta">
            <span>{detailCapability.stageLabel}</span>
            <span>{detailCapability.evidenceCount} evidence records</span>
          </div>
          <div className="detail-actions">
            <button
              className="solid-button"
              onClick={() => startLearningTask(detailCapability.id)}
              type="button"
            >
              Start Task
            </button>
            <button
              className="ghost-button"
              onClick={() => {
                selectCapability(detailCapability.id);
                onNavigateToGrowth?.();
              }}
              type="button"
            >
              Open Workspace
            </button>
            <button
              className="text-button"
              onClick={() => setDetailCapabilityId(null)}
              type="button"
            >
              Hide Details
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );

  function viewCapabilityDetails(capabilityId: string) {
    selectCapability(capabilityId);
    setDetailCapabilityId(capabilityId);
  }

  function startLearningTask(capabilityId: string) {
    selectCapability(capabilityId);
    generateCapabilityCoachPlan(capabilityId);
    onNavigateToGrowth?.();
  }
}

function buildGrowthGraph(capabilities: Capability[]) {
  const total = Math.max(capabilities.length, 1);

  return capabilities.map((capability, index) => {
    const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
    const x = 50 + Math.cos(angle) * 34;
    const y = 50 + Math.sin(angle) * 35;
    const normalX = Math.cos(angle);
    const normalY = Math.sin(angle);
    const tangentX = -Math.sin(angle);
    const tangentY = Math.cos(angle);
    const taskLabels = getCapabilityTaskLabels(capability);

    return {
      capability,
      id: capability.id,
      x,
      y,
      tasks: taskLabels.map((task, taskIndex) => {
        const spread = [-7, 0, 7][taskIndex] ?? 0;
        const distance = 13;

        return {
          ...task,
          id: `${capability.id}-${task.type.toLowerCase()}`,
          x: clamp(x + normalX * distance + tangentX * spread, 5, 95),
          y: clamp(y + normalY * distance + tangentY * spread, 7, 93),
        };
      }),
    };
  });
}

function getCapabilityTaskLabels(capability: Capability) {
  const taskMap: Record<string, Array<{ label: string; type: string }>> = {
    'prompt-engineering': [
      { label: 'Prompt pattern', type: 'Learn' },
      { label: 'Before/after test', type: 'Practice' },
      { label: 'Reusable template', type: 'Evidence' },
    ],
    'ai-product-strategy': [
      { label: 'Opportunity thesis', type: 'Strategy' },
      { label: 'Value hypothesis', type: 'Practice' },
      { label: 'Decision memo', type: 'Evidence' },
    ],
    'user-research-synthesis': [
      { label: 'Interview signals', type: 'Research' },
      { label: 'Insight clustering', type: 'Practice' },
      { label: 'Evidence board', type: 'Evidence' },
    ],
    'context-engineering': [
      { label: 'Context packet', type: 'Learn' },
      { label: 'Memory boundary', type: 'Practice' },
      { label: 'Source summary', type: 'Evidence' },
    ],
    'rag-knowledge-systems': [
      { label: 'Source quality', type: 'Learn' },
      { label: 'Retrieval test', type: 'Practice' },
      { label: 'Grounding report', type: 'Evidence' },
    ],
    'agent-design': [
      { label: 'Role map', type: 'Learn' },
      { label: 'Tool handoff', type: 'Practice' },
      { label: 'Workflow diagram', type: 'Evidence' },
    ],
    'tool-orchestration': [
      { label: 'Tool contract', type: 'Learn' },
      { label: 'API handoff', type: 'Practice' },
      { label: 'Failure mode', type: 'Evidence' },
    ],
    'ai-evaluation': [
      { label: 'Rubric design', type: 'Learn' },
      { label: 'Output scoring', type: 'Practice' },
      { label: 'Quality review', type: 'Evidence' },
    ],
    'experimentation-metrics': [
      { label: 'Success metric', type: 'Learn' },
      { label: 'Experiment plan', type: 'Practice' },
      { label: 'Learning review', type: 'Evidence' },
    ],
    'ai-safety-governance': [
      { label: 'Risk boundary', type: 'Learn' },
      { label: 'Policy check', type: 'Practice' },
      { label: 'Launch gate', type: 'Evidence' },
    ],
    'automation-ops': [
      { label: 'Workflow trigger', type: 'Learn' },
      { label: 'Fallback path', type: 'Practice' },
      { label: 'Ops checklist', type: 'Evidence' },
    ],
    'product-storytelling': [
      { label: 'Narrative arc', type: 'Learn' },
      { label: 'Demo script', type: 'Practice' },
      { label: 'Launch story', type: 'Evidence' },
    ],
    'multi-agent-collaboration': [
      { label: 'Agent roles', type: 'Learn' },
      { label: 'Handoff protocol', type: 'Practice' },
      { label: 'Review loop', type: 'Evidence' },
    ],
  };

  return taskMap[capability.id] ?? [
    { label: 'Core concept', type: 'Learn' },
    { label: 'Practice loop', type: 'Practice' },
    { label: 'Evidence record', type: 'Evidence' },
  ];
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
