import { SectionCard } from '../../components/ui/SectionCard';
import { useAppStore } from '../../store/app-store';

type GrowthSummaryPanelProps = {
  compact?: boolean;
};

export function GrowthSummaryPanel({ compact = false }: GrowthSummaryPanelProps) {
  const notes = useAppStore((state) => state.notes);
  const user = useAppStore((state) => state.userProfile);
  const weeklySummary = useAppStore((state) => state.weeklySummary);

  return (
    <SectionCard
      title={compact ? 'Weekly Context' : 'Weekly Snapshot'}
      subtitle={compact ? 'At a glance' : 'Progress and next moves'}
    >
      <div className={compact ? 'snapshot-grid snapshot-grid-compact' : 'snapshot-grid'}>
        <div className="snapshot-card snapshot-card-primary">
          <span className="snapshot-label">Current Focus</span>
          <strong>{user.focusArea}</strong>
          {!compact ? <p>{user.lastInsight}</p> : null}
        </div>
        <div className="snapshot-card">
          <span className="snapshot-label">Evidence Saved</span>
          <strong>
            {notes.length}/{user.weeklyGoal}
          </strong>
          <p>Evidence records saved in this browser.</p>
        </div>
        {!compact ? (
          <>
            <div className="snapshot-card">
              <span className="snapshot-label">This Week</span>
              <ul className="compact-list">
                {weeklySummary.progress.slice(0, 2).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="snapshot-card">
              <span className="snapshot-label">Next Actions</span>
              <ul className="compact-list">
                {weeklySummary.nextActions.slice(0, 2).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </>
        ) : null}
      </div>
    </SectionCard>
  );
}
