import { useState, type ReactNode } from 'react';
import { SectionCard } from '../../components/ui/SectionCard';
import { notify } from '../../lib/notifications';
import { useAppStore } from '../../store/app-store';
import type { WeeklySummary } from '../../types/domain';

export function ReflectionPanel() {
  const generateReflectionDraft = useAppStore((state) => state.generateReflectionDraft);
  const notes = useAppStore((state) => state.notes);
  const reflectionDraft = useAppStore((state) => state.reflectionDraft);
  const updateReflectionDraft = useAppStore((state) => state.updateReflectionDraft);
  const weeklySummary = useAppStore((state) => state.weeklySummary);
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');

  const draft = reflectionDraft || buildFallbackDraft(weeklySummary);

  return (
    <SectionCard
      title="Reflection Agent"
      subtitle="Periodic review"
      actionLabel="Generate Review"
      actionVariant="primary"
      onAction={generateReflectionDraft}
    >
      <div className="stack-sm">
        <div className="section-inline-header">
          <p className="panel-intro">{weeklySummary.period}</p>
          <span className="muted-text">{notes.length} evidence records available</span>
        </div>
        <div className="summary-block">
          <strong>Progress This Week</strong>
          <ul className="plain-list">
            {weeklySummary.progress.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="summary-block">
          <strong>Plan for Next Week</strong>
          <ul className="plain-list">
            {weeklySummary.nextActions.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="mode-toggle" aria-label="Reflection editor mode">
          <button
            className={mode === 'edit' ? 'mode-toggle-active' : ''}
            type="button"
            onClick={() => setMode('edit')}
          >
            Edit
          </button>
          <button
            className={mode === 'preview' ? 'mode-toggle-active' : ''}
            type="button"
            onClick={() => setMode('preview')}
          >
            Preview
          </button>
        </div>
        {mode === 'edit' ? (
          <textarea
            className="summary-editor"
            value={draft}
            onChange={(event) => updateReflectionDraft(event.target.value)}
          />
        ) : (
          <div className="markdown-preview">{renderMarkdown(draft)}</div>
        )}
        <div className="reflection-actions">
          <button
            className="solid-button"
            disabled={!draft.trim()}
            onClick={() => downloadMarkdown(draft)}
          >
            Export Markdown
          </button>
          <button
            className="ghost-button"
            disabled={!draft.trim()}
            onClick={() => {
              updateReflectionDraft(buildFallbackDraft(weeklySummary));
              notify('Review template restored.', 'success');
            }}
          >
            Restore Template
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

function buildFallbackDraft(weeklySummary: WeeklySummary) {
  return [
    `# ${weeklySummary.period}`,
    '',
    '## Progress This Week',
    ...weeklySummary.progress.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Plan for Next Week',
    ...weeklySummary.nextActions.map((item, index) => `${index + 1}. ${item}`),
  ].join('\n');
}

function renderMarkdown(markdown: string) {
  const lines = markdown.split('\n');
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      index += 1;
      continue;
    }

    if (line.startsWith('## ')) {
      nodes.push(<h3 key={index}>{line.slice(3)}</h3>);
      index += 1;
      continue;
    }

    if (line.startsWith('# ')) {
      nodes.push(<h2 key={index}>{line.slice(2)}</h2>);
      index += 1;
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^\d+\.\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^\d+\.\s+/, ''));
        index += 1;
      }

      nodes.push(
        <ol key={index}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];

      while (index < lines.length && /^[-*]\s+/.test(lines[index].trim())) {
        items.push(lines[index].trim().replace(/^[-*]\s+/, ''));
        index += 1;
      }

      nodes.push(
        <ul key={index}>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>,
      );
      continue;
    }

    nodes.push(<p key={index}>{line}</p>);
    index += 1;
  }

  return nodes;
}

function downloadMarkdown(markdown: string) {
  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = `pm-growth-weekly-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
  notify('Weekly review exported as Markdown.', 'success');
}
