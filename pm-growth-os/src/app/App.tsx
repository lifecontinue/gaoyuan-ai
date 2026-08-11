import { useEffect, useState } from 'react';
import { AppShell } from '../components/layout/AppShell';
import {
  WorkspaceFrame,
  type WorkspaceModal,
  type WorkspaceView,
} from '../components/layout/WorkspaceFrame';
import { CoachPanel } from '../features/coach/CoachPanel';
import { LoginScreen } from '../features/auth/LoginScreen';
import { CapturePanel } from '../features/capture/CapturePanel';
import { DevBoardPanel } from '../features/dev/DevBoardPanel';
import { NotesLibraryPanel } from '../features/notes/NotesLibraryPanel';
import { CapabilityDetailPanel } from '../features/outline/CapabilityDetailPanel';
import { GrowthSummaryPanel } from '../features/outline/GrowthSummaryPanel';
import { OutlineOverview } from '../features/outline/OutlineOverview';
import { ProfilePanel } from '../features/profile/ProfilePanel';
import { ReflectionPanel } from '../features/reflection/ReflectionPanel';
import { TelemetryPanel } from '../features/telemetry/TelemetryPanel';
import { ToolConnectorsPanel } from '../features/connectors/ToolConnectorsPanel';
import { clearAuthSession, readAuthSession, type AuthSession } from '../lib/auth-client';
import { useAppStore } from '../store/app-store';

export function App() {
  const [authSession, setAuthSession] = useState<AuthSession | null>(() => readAuthSession());
  const [activeView, setActiveView] = useState<WorkspaceView>('growth');
  const [activeModal, setActiveModal] = useState<WorkspaceModal>(null);
  const capabilities = useAppStore((state) => state.capabilities);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const skillGraphSummary = getSkillGraphSummary(capabilities);

  useEffect(() => {
    if (!authSession) return;
    void loadWorkspace();
  }, [authSession, loadWorkspace]);

  if (!authSession) {
    return <LoginScreen onLogin={setAuthSession} />;
  }

  return (
    <AppShell
      onOpenSystem={() => {
        setActiveModal(null);
        setActiveView('system');
      }}
      onLogout={() => {
        clearAuthSession();
        setActiveModal(null);
        setActiveView('growth');
        setAuthSession(null);
      }}
      userEmail={authSession.email}
    >
      <WorkspaceFrame
        activeModal={activeModal}
        activeView={activeView}
        devSidebar={
          <>
            <GrowthSummaryPanel compact />
            <CapabilityDetailPanel compact />
            <DevBoardPanel compact userId={authSession.email} />
          </>
        }
        modalContent={renderModal(activeModal, () => {
          setActiveView('growth');
          setActiveModal(null);
        })}
        onCloseModal={() => setActiveModal(null)}
        onOpenModal={setActiveModal}
        onSelectView={setActiveView}
        skillGraphSummary={skillGraphSummary}
      >
        {renderView(activeView, {
          openCapture: () => setActiveModal('capture'),
          openReflection: () => setActiveView('reflection'),
        })}
      </WorkspaceFrame>
    </AppShell>
  );
}

function renderView(
  view: WorkspaceView,
  actions: { openCapture: () => void; openReflection: () => void },
) {
  switch (view) {
    case 'growth':
      return (
        <div className="growth-workbench">
          <div className="coach-primary-column">
            <CoachPanel
              onOpenCapture={actions.openCapture}
              onOpenReflection={actions.openReflection}
            />
          </div>
        </div>
      );
    case 'notes':
      return <NotesLibraryPanel />;
    case 'reflection':
      return <ReflectionPanel />;
    case 'system':
      return (
        <div className="view-stack system-stack">
          <ProfilePanel />
          <ToolConnectorsPanel />
          <TelemetryPanel />
        </div>
      );
  }
}

function renderModal(modal: WorkspaceModal, navigateToGrowth: () => void) {
  switch (modal) {
    case 'capture':
      return <CapturePanel />;
    case 'connectors':
      return <ToolConnectorsPanel />;
    case 'skillGraph':
      return <OutlineOverview onNavigateToGrowth={navigateToGrowth} />;
    case 'telemetry':
      return <TelemetryPanel />;
    default:
      return null;
  }
}

function getSkillGraphSummary(capabilities: ReturnType<typeof useAppStore.getState>['capabilities']) {
  const totalDimensions = capabilities.length || 1;
  const overallProgress = Math.round(
    capabilities.reduce((sum, item) => sum + item.progress, 0) / totalDimensions,
  );
  const activeDimensions = capabilities.filter((item) => item.progress > 0).length;
  const weakestCapabilityName =
    capabilities.slice().sort((a, b) => a.progress - b.progress)[0]?.name ?? 'the next skill';

  return {
    activeDimensions,
    overallProgress,
    totalDimensions,
    weakestCapabilityName,
  };
}
