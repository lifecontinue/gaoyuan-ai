import { SectionCard } from '../../components/ui/SectionCard';
import { useAppStore } from '../../store/app-store';

export function ProfilePanel() {
  const user = useAppStore((state) => state.userProfile);
  const resetWorkspace = useAppStore((state) => state.resetWorkspace);
  const updateUserProfile = useAppStore((state) => state.updateUserProfile);

  return (
    <SectionCard
      title="Profile Agent"
      subtitle="Growth profile"
      actionLabel="Reset"
      actionVariant="danger"
      onAction={resetWorkspace}
    >
      <div className="stack-sm">
        <div className="profile-metric-row">
          <label className="profile-edit-field">
            <span>Current focus</span>
            <input
              className="inline-input"
              value={user.focusArea}
              onChange={(event) => updateUserProfile({ focusArea: event.target.value })}
            />
          </label>
          <label className="profile-edit-field">
            <span>Preferred model setup</span>
            <input
              className="inline-input"
              value={user.preferredModel}
              onChange={(event) => updateUserProfile({ preferredModel: event.target.value })}
            />
          </label>
          <label className="profile-edit-field">
            <span>Weekly goal</span>
            <input
              className="inline-input"
              min="1"
              type="number"
              value={user.weeklyGoal}
              onChange={(event) =>
                updateUserProfile({ weeklyGoal: Number(event.target.value) || 1 })
              }
            />
          </label>
        </div>
        <label className="profile-edit-field">
          <span>Latest insight</span>
          <textarea
            className="inline-textarea"
            value={user.lastInsight}
            onChange={(event) => updateUserProfile({ lastInsight: event.target.value })}
          />
        </label>
        <label className="profile-edit-field">
          <span>Long-term goal</span>
          <textarea
            className="inline-textarea"
            value={user.longTermGoal}
            onChange={(event) => updateUserProfile({ longTermGoal: event.target.value })}
          />
        </label>
        <div className="summary-block">
          <strong>Saved Evidence</strong>
          <p>{user.savedNotes} evidence records saved in this browser.</p>
        </div>
      </div>
    </SectionCard>
  );
}
