import type { ReactNode } from 'react';

export type WorkspaceView = 'growth' | 'notes' | 'reflection' | 'system';
export type WorkspaceModal = 'capture' | 'connectors' | 'skillGraph' | 'telemetry' | null;

type SkillGraphSummary = {
  activeDimensions: number;
  overallProgress: number;
  totalDimensions: number;
  weakestCapabilityName: string;
};

type WorkspaceFrameProps = {
  activeModal: WorkspaceModal;
  activeView: WorkspaceView;
  children: ReactNode;
  devSidebar: ReactNode;
  modalContent: ReactNode;
  onCloseModal: () => void;
  onOpenModal: (modal: Exclude<WorkspaceModal, null>) => void;
  onSelectView: (view: WorkspaceView) => void;
  skillGraphSummary: SkillGraphSummary;
};

const navItems: Array<{ id: WorkspaceView; label: string; description: string; icon: string }> = [
  {
    id: 'growth',
    label: 'Growth Map',
    description: 'Capability graph and path',
    icon: 'M9 19V6l12-3v13M9 19c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm12-3c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2z',
  },
  {
    id: 'notes',
    label: 'Evidence Library',
    description: 'Saved evidence and search',
    icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8',
  },
  {
    id: 'reflection',
    label: 'Weekly Review',
    description: 'Generate and export',
    icon: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zM22 6l-10 7L12 17l-7-9',
  },
];

export function WorkspaceFrame({
  activeModal,
  activeView,
  children,
  devSidebar,
  modalContent,
  onCloseModal,
  onOpenModal,
  onSelectView,
  skillGraphSummary,
}: WorkspaceFrameProps) {
  return (
    <div className="workspace-frame">
      <aside className="workspace-sidebar" aria-label="Workspace navigation">
        <div className="sidebar-brand">
          <strong>PM Growth OS</strong>
          <span>Agent workspace</span>
        </div>
        <nav className="workspace-nav">
          {navItems.map((item) => (
            <button
              className={`nav-item ${activeView === item.id ? 'nav-item-active' : ''}`}
              key={item.id}
              onClick={() => onSelectView(item.id)}
            >
              <div className="nav-icon">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={item.icon} />
                </svg>
              </div>
              <div className="nav-text">
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </div>
            </button>
          ))}
        </nav>
        <button
          aria-label="Open the full Growth Map"
          className="skill-graph-mini"
          onClick={() => onOpenModal('skillGraph')}
          type="button"
        >
          <div className="section-inline-header">
            <span className="snapshot-label">Growth Map</span>
            <strong>{skillGraphSummary.overallProgress}%</strong>
          </div>
          <div className="mini-progress-bar">
            <span style={{ width: `${skillGraphSummary.overallProgress}%` }} />
          </div>
          <p>
            {skillGraphSummary.activeDimensions}/{skillGraphSummary.totalDimensions} dimensions
            active
          </p>
          <small>Open full map and start a task</small>
        </button>
        <div className="sidebar-actions">
          <button
            className="solid-button sidebar-create-button"
            onClick={() => onOpenModal('capture')}
          >
            <span className="create-plus">+</span>
            New Evidence
          </button>
        </div>
      </aside>
      <section className="workspace-content">{children}</section>
      <aside className="developer-sidebar" aria-label="Workspace context and developer tools">
        {devSidebar}
      </aside>
      {activeModal ? (
        <div className="modal-backdrop" role="presentation" onClick={onCloseModal}>
          <div
            aria-modal="true"
            className={`modal-panel ${getModalPanelClassName(activeModal)}`}
            role="dialog"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-header">
              <strong>{getModalTitle(activeModal)}</strong>
              <button
                aria-label="Close modal"
                className="icon-button"
                title="Close modal"
                onClick={onCloseModal}
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
            {modalContent}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function getModalPanelClassName(modal: Exclude<WorkspaceModal, null>) {
  if (modal === 'skillGraph') return 'modal-panel-wide';
  if (modal === 'capture') return 'modal-panel-capture';
  return '';
}

function getModalTitle(modal: Exclude<WorkspaceModal, null>) {
  const titles = {
    capture: 'New Evidence',
    connectors: 'Tool Connectors',
    skillGraph: 'Growth Map',
    telemetry: 'Cost Monitor',
  };

  return titles[modal];
}
