import type { ReactNode } from 'react';
import { ToastViewport } from '../ui/ToastViewport';
import { useAppStore } from '../../store/app-store';

type AppShellProps = {
  children: ReactNode;
  onOpenSystem: () => void;
  onLogout: () => void;
  userEmail: string;
};

export function AppShell({
  children,
  onOpenSystem,
  onLogout,
  userEmail,
}: AppShellProps) {
  const backendError = useAppStore((state) => state.backendError);
  const user = useAppStore((state) => state.userProfile);

  return (
    <div className="app-shell">
      <div className="hero-backdrop" />
      <header className="hero">
        <div className="hero-left">
          <div className="hero-badge">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span>AI PM Growth System</span>
          </div>
          <h1>PM Growth OS</h1>
          <p className="hero-copy">Collect evidence, learn, and reflect in one focused AI PM workspace.</p>
        </div>
        <div className="hero-right">
          <div className="growth-stats">
            <div className="stat-item">
              <span className="stat-value">{user.savedNotes}</span>
              <span className="stat-label">Evidence</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{user.weeklyGoal}</span>
              <span className="stat-label">Weekly Goal</span>
            </div>
            <div className="stat-item">
              <span className="stat-value">{user.focusArea}</span>
              <span className="stat-label">Focus Area</span>
            </div>
          </div>
          <div className="hero-account-row">
            <div className="hero-tagline">{user.currentStageLabel}</div>
            <button
              aria-label="Open system settings"
              className="icon-button settings-button"
              onClick={onOpenSystem}
              title="Open system settings"
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
                <path d="M12 15.5A3.5 3.5 0 1 0 12 8.5a3.5 3.5 0 0 0 0 7z" />
                <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.04.04a2 2 0 1 1-2.83 2.83l-.04-.04A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 1.55V21a2 2 0 0 1-4 0v-.05A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.88.34l-.04.04a2 2 0 1 1-2.83-2.83l.04-.04A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 0 1 0-4h.05A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.04-.04a2 2 0 1 1 2.83-2.83l.04.04A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.05A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.04-.04a2 2 0 1 1 2.83 2.83l-.04.04A1.7 1.7 0 0 0 19.4 9c.33.3.84.6 1.55.6H21a2 2 0 0 1 0 4h-.05A1.7 1.7 0 0 0 19.4 15z" />
              </svg>
            </button>
            <button className="ghost-button account-button" onClick={onLogout} type="button">
              <span>{userEmail}</span>
              Sign out
            </button>
          </div>
        </div>
      </header>
      {backendError ? <div className="backend-alert">{backendError}</div> : null}
      <main className="main-stack">{children}</main>
      <ToastViewport />
    </div>
  );
}
