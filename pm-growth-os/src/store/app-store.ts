import { create } from 'zustand';
import {
  clearModelTracesApi,
  createNoteApi,
  deleteNoteApi,
  fetchWorkspace,
  generateCoachPlanApi,
  generateReflectionDraftApi,
  resetWorkspaceApi,
  selectCapabilityApi,
  sendCapabilityToCaptureApi,
  sendCoachStepToCaptureApi,
  sendLearningResourceToCaptureApi,
  sendNoteToCaptureApi,
  syncBridgeUsageLogsApi,
  updateCaptureCapabilityLinksApi,
  updateCaptureDraftApi,
  updateConnectorApi,
  updateReflectionDraftApi,
  updateUserProfileApi,
} from '../lib/api-client';
import { inferCaptureSuggestions } from '../lib/capture-inference';
import { checkKnowledgeSearchConnection } from '../lib/mcp-integration';
import { notify } from '../lib/notifications';
import { exportNotesToMarkdown } from '../lib/note-export';
import {
  capabilities,
  coachPlan,
  defaultCaptureDraft,
  defaultSuggestions,
  userProfile,
  weeklySummary,
} from '../lib/initial-workspace-data';
import type { ToolConnector, UserProfile, WorkspaceState } from '../types/domain';

type AppState = WorkspaceState & {
  backendError: string | null;
  isBackendReady: boolean;
  checkKnowledgeSearch: () => Promise<void>;
  clearModelTraces: () => void;
  deleteNote: (noteId: string) => void;
  exportModelTraces: () => string;
  exportNotesMarkdown: () => string;
  exportUsageLogs: () => string;
  generateCapabilityCoachPlan: (capabilityId: string) => void;
  generateCoachPlan: () => void;
  generateReflectionDraft: () => void;
  loadWorkspace: (showToast?: boolean) => Promise<void>;
  resetWorkspace: () => void;
  saveCaptureNote: () => void;
  selectCapability: (capabilityId: string) => void;
  sendCapabilityToCapture: (capabilityId: string) => void;
  sendCoachStepToCapture: (stepId: string) => void;
  sendLearningResourceToCapture: (resourceId: string) => void;
  sendNoteToCapture: (noteId: string) => void;
  syncBridgeUsageLogs: (showToast?: boolean) => Promise<void>;
  updateCaptureCapabilityLinks: (capabilityIds: string[]) => void;
  updateCaptureDraft: (draft: string) => void;
  updateConnector: (
    connectorId: string,
    payload: {
      enabled?: boolean;
      status?: ToolConnector['status'];
      mcpEndpoint?: string;
      accountHint?: string;
    },
  ) => void;
  updateReflectionDraft: (draft: string) => void;
  updateUserProfile: (patch: Partial<UserProfile>) => void;
};

const initialState: WorkspaceState = {
  capabilities,
  captureDraft: defaultCaptureDraft,
  captureSuggestions: defaultSuggestions,
  coachPlan,
  modelTraces: [],
  notes: [],
  reflectionDraft: '',
  selectedCapabilityId: capabilities[0]?.id ?? '',
  toolConnectors: [],
  usageLogs: [],
  weeklySummary,
  userProfile,
};

export const useAppStore = create<AppState>((set, get) => ({
  ...initialState,
  backendError: null,
  isBackendReady: false,
  checkKnowledgeSearch: async () => {
    try {
      const diagnostic = await checkKnowledgeSearchConnection();
      const status: ToolConnector['status'] =
        diagnostic.ok && diagnostic.configured ? 'enabled' : 'not_connected';
      const connectorPatch = {
        enabled: diagnostic.ok && diagnostic.configured,
        status,
        mcpEndpoint: diagnostic.endpoint,
        accountHint: diagnostic.message,
      };

      set((state) => ({
        toolConnectors: state.toolConnectors.map((connector) =>
          connector.id === 'web-search'
            ? {
                ...connector,
                ...connectorPatch,
                mcpEndpoint: connectorPatch.mcpEndpoint ?? connector.mcpEndpoint,
                updatedAt: new Date().toISOString(),
              }
            : connector,
        ),
      }));
      void updateConnectorApi('web-search', connectorPatch).catch(() => {
        // Connector diagnostics remain useful even if localStorage is unavailable.
      });

      notify(
        diagnostic.message,
        diagnostic.ok && diagnostic.configured ? 'success' : 'error',
      );
    } catch (error) {
      notify(formatError(error), 'error');
    }
  },
  clearModelTraces: () => {
    runWorkspaceAction(set, clearModelTracesApi, 'Trace history cleared.');
  },
  deleteNote: (noteId: string) => {
    runWorkspaceAction(set, () => deleteNoteApi(noteId), 'Evidence deleted.');
  },
  exportModelTraces: () => JSON.stringify(get().modelTraces, null, 2),
  exportNotesMarkdown: () => exportNotesToMarkdown(get().notes, get().capabilities),
  exportUsageLogs: () => JSON.stringify(get().usageLogs, null, 2),
  generateCapabilityCoachPlan: (capabilityId: string) => {
    runWorkspaceAction(
      set,
      () => generateCoachPlanApi(capabilityId),
      'Focus task generated.',
      'Generating a focus task...',
    );
  },
  generateCoachPlan: () => {
    runWorkspaceAction(
      set,
      () => generateCoachPlanApi(),
      'Learning path generated.',
      'Generating a learning path...',
    );
  },
  generateReflectionDraft: () => {
    runWorkspaceAction(
      set,
      generateReflectionDraftApi,
      'Weekly review generated.',
      'Generating weekly review...',
    );
  },
  loadWorkspace: async (showToast = false) => {
    try {
      const workspace = await fetchWorkspace();
      setWorkspace(set, workspace);
      if (showToast) {
        notify('Workspace refreshed.', 'success');
      }
    } catch (error) {
      set({
        backendError: formatError(error),
        isBackendReady: false,
      });
      if (showToast) {
        notify(formatError(error), 'error');
      }
    }
  },
  resetWorkspace: () => {
    runWorkspaceAction(set, resetWorkspaceApi, 'Workspace reset.', 'Resetting workspace...');
  },
  saveCaptureNote: () => {
    const content = get().captureDraft.trim();
    if (!content) return;

    const selectedCapabilityIds = get().captureSuggestions.relatedCapabilities.map((item) => item.id);
    runWorkspaceAction(
      set,
      () => createNoteApi(content, selectedCapabilityIds),
      'Evidence saved.',
      'Saving evidence...',
    );
  },
  selectCapability: (capabilityId: string) => {
    set({
      selectedCapabilityId: capabilityId,
    });
    runWorkspaceAction(set, () => selectCapabilityApi(capabilityId));
  },
  sendCapabilityToCapture: (capabilityId: string) => {
    runWorkspaceAction(set, () => sendCapabilityToCaptureApi(capabilityId), 'Evidence draft created.');
  },
  sendCoachStepToCapture: (stepId: string) => {
    runWorkspaceAction(set, () => sendCoachStepToCaptureApi(stepId), 'Practice task added to Evidence Draft.');
  },
  sendLearningResourceToCapture: (resourceId: string) => {
    runWorkspaceAction(set, () => sendLearningResourceToCaptureApi(resourceId), 'Learning resource added to Evidence Draft.');
  },
  sendNoteToCapture: (noteId: string) => {
    runWorkspaceAction(set, () => sendNoteToCaptureApi(noteId), 'Evidence loaded as draft.');
  },
  syncBridgeUsageLogs: async (showToast = false) => {
    try {
      const workspace = await syncBridgeUsageLogsApi();
      setWorkspace(set, workspace);
      if (showToast) {
        notify('Usage Bridge synced.', 'success');
      }
    } catch (error) {
      if (showToast) {
        notify(formatError(error), 'error');
      }
    }
  },
  updateCaptureCapabilityLinks: (capabilityIds: string[]) => {
    set((state) => ({
      captureSuggestions: {
        ...state.captureSuggestions,
        relatedCapabilities: state.capabilities
          .filter((capability) => capabilityIds.includes(capability.id))
          .map((capability) => {
            const existing = state.captureSuggestions.relatedCapabilities.find(
              (item) => item.id === capability.id,
            );

            return {
              id: capability.id,
              name: capability.name,
              reason: existing?.reason ?? 'Manually linked by the user.',
            };
          }),
        confidence:
          capabilityIds.length === 0 ? 'low' : capabilityIds.length === 1 ? 'medium' : 'high',
      },
    }));
    runWorkspaceAction(set, () => updateCaptureCapabilityLinksApi(capabilityIds));
  },
  updateCaptureDraft: (draft: string) =>
    set((state) => {
      void updateCaptureDraftApi(draft).catch((error) => {
        set({
          backendError: formatError(error),
          isBackendReady: false,
        });
      });

      return {
        captureDraft: draft,
        captureSuggestions: inferCaptureSuggestions(draft, state.capabilities),
      };
    }),
  updateConnector: (connectorId, payload) => {
    set((state) => ({
      toolConnectors: state.toolConnectors.map((connector) =>
        connector.id === connectorId
          ? {
              ...connector,
              ...payload,
              updatedAt: new Date().toISOString(),
            }
          : connector,
      ),
    }));
    runWorkspaceAction(set, () => updateConnectorApi(connectorId, payload), 'Connector settings updated.');
  },
  updateReflectionDraft: (draft: string) => {
    set({ reflectionDraft: draft });
    runWorkspaceAction(set, () => updateReflectionDraftApi(draft));
  },
  updateUserProfile: (patch: Partial<UserProfile>) => {
    set((state) => ({
      userProfile: {
        ...state.userProfile,
        ...patch,
      },
    }));
    runWorkspaceAction(set, () => updateUserProfileApi(patch));
  },
}));

function setWorkspace(
  set: (partial: Partial<AppState>) => void,
  workspace: WorkspaceState,
) {
  set({
    ...workspace,
    backendError: null,
    isBackendReady: true,
  });
}

async function runWorkspaceAction(
  set: (partial: Partial<AppState>) => void,
  action: () => Promise<WorkspaceState>,
  successMessage?: string,
  pendingMessage?: string,
) {
  try {
    if (pendingMessage) {
      notify(pendingMessage, 'info');
    }
    const workspace = await action();
    setWorkspace(set, workspace);
    if (successMessage) {
      notify(successMessage, 'success');
    }
  } catch (error) {
    set({
      backendError: formatError(error),
      isBackendReady: false,
    });
    notify(formatError(error), 'error');
  }
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
