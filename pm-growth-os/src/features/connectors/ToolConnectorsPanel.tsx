import { SectionCard } from '../../components/ui/SectionCard';
import { useAppStore } from '../../store/app-store';
import type { ToolConnector } from '../../types/domain';

export function ToolConnectorsPanel() {
  const connectors = useAppStore((state) => state.toolConnectors);
  const checkKnowledgeSearch = useAppStore((state) => state.checkKnowledgeSearch);
  const loadWorkspace = useAppStore((state) => state.loadWorkspace);
  const updateConnector = useAppStore((state) => state.updateConnector);
  const platformConnectors = connectors.filter((connector) => connector.scope === 'platform');
  const userConnectors = connectors.filter((connector) => connector.scope === 'user');
  const connectedCount = connectors.filter(
    (connector) => connector.enabled || connector.status === 'configured',
  ).length;

  return (
    <SectionCard
      title="Tool Connectors"
      subtitle="MCP / account connections"
      actionLabel="Refresh"
      onAction={() => {
        void loadWorkspace(true);
      }}
    >
      <div className="stack-sm">
        <div className="section-inline-header">
          <strong>Platform</strong>
          <span className="muted-text">
            {connectedCount}/{connectors.length} configured
          </span>
        </div>
        <div className="connector-list">
          {platformConnectors.map((connector) => (
            <ConnectorCard
              connector={connector}
              key={connector.id}
              onCheckKnowledgeSearch={checkKnowledgeSearch}
              updateConnector={updateConnector}
            />
          ))}
        </div>
        <div className="section-inline-header">
          <strong>Optional Accounts</strong>
          <span className="muted-text">{userConnectors.length} integrations</span>
        </div>
        <div className="connector-list">
          {userConnectors.map((connector) => (
            <ConnectorCard
              connector={connector}
              key={connector.id}
              onCheckKnowledgeSearch={checkKnowledgeSearch}
              updateConnector={updateConnector}
            />
          ))}
        </div>
      </div>
    </SectionCard>
  );
}

function ConnectorCard({
  connector,
  onCheckKnowledgeSearch,
  updateConnector,
}: {
  connector: ToolConnector;
  onCheckKnowledgeSearch: () => Promise<void>;
  updateConnector: (
    connectorId: string,
    payload: {
      enabled?: boolean;
      status?: ToolConnector['status'];
      mcpEndpoint?: string;
      accountHint?: string;
    },
  ) => void;
}) {
  const isPlatform = connector.scope === 'platform';
  const isKnowledgeSearch = connector.id === 'web-search';

  return (
    <article className="connector-card">
      <div className="connector-main">
        <div>
          <strong>{connector.name}</strong>
          <span className="connector-method">
            {isPlatform ? 'platform managed' : connector.method}
          </span>
        </div>
        <div className="connector-actions">
          <span className={`status-dot status-${getStatusClass(connector)}`}>
            {formatStatus(connector.status)}
          </span>
          {isKnowledgeSearch ? (
          <button
            className="ghost-button"
            onClick={() => {
              void onCheckKnowledgeSearch();
            }}
          >
            Test
          </button>
          ) : null}
          {!isPlatform ? (
            <>
              <button
                className="text-button"
                onClick={() =>
                  updateConnector(connector.id, {
                    enabled: true,
                    status: 'needs_account',
                  })
                }
              >
                Request
              </button>
              <button
                className="text-button danger-text"
                onClick={() =>
                  updateConnector(connector.id, {
                    enabled: false,
                    status: 'needs_account',
                  })
                }
              >
                Pause
              </button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function formatStatus(status: ToolConnector['status']) {
  return status.replace(/_/g, ' ');
}

function getStatusClass(connector: ToolConnector) {
  if (connector.enabled || connector.status === 'configured' || connector.status === 'enabled') {
    return 'done';
  }

  if (connector.status === 'needs_account') {
    return 'active';
  }

  return 'todo';
}
