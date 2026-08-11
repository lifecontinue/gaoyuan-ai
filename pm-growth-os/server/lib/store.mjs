import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInitialWorkspace } from './domain.mjs';

const dataFile = resolve(process.cwd(), 'data', 'workspace.json');

export async function readWorkspace() {
  try {
    const raw = await readFile(dataFile, 'utf-8');
    return normalizeWorkspace(JSON.parse(raw));
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }

    const workspace = createInitialWorkspace();
    await writeWorkspace(workspace);
    return workspace;
  }
}

export async function writeWorkspace(workspace) {
  const nextWorkspace = {
    ...workspace,
    updatedAt: new Date().toISOString(),
  };

  await mkdir(dirname(dataFile), { recursive: true });
  await writeFile(dataFile, `${JSON.stringify(nextWorkspace, null, 2)}\n`, 'utf-8');
  return nextWorkspace;
}

export async function updateWorkspace(updater) {
  const workspace = await readWorkspace();
  const nextWorkspace = await updater(workspace);
  return writeWorkspace(nextWorkspace);
}

export async function resetWorkspace() {
  const workspace = createInitialWorkspace();
  return writeWorkspace(workspace);
}

function normalizeWorkspace(workspace) {
  const initial = createInitialWorkspace();

  return {
    ...initial,
    ...workspace,
    capabilities: mergeCapabilities(workspace.capabilities, initial.capabilities),
    captureSuggestions: workspace.captureSuggestions ?? initial.captureSuggestions,
    coachPlan: workspace.coachPlan ?? initial.coachPlan,
    modelTraces: workspace.modelTraces ?? [],
    notes: workspace.notes ?? [],
    toolConnectors: mergeToolConnectors(workspace.toolConnectors, initial.toolConnectors),
    usageLogs: workspace.usageLogs ?? [],
    weeklySummary: workspace.weeklySummary ?? initial.weeklySummary,
    userProfile: {
      ...initial.userProfile,
      ...(workspace.userProfile ?? {}),
    },
  };
}

function mergeCapabilities(existing = [], latest = []) {
  const existingById = new Map(existing.map((capability) => [capability.id, capability]));

  return latest.map((capability) => ({
    ...capability,
    ...(existingById.get(capability.id) ?? {}),
  }));
}

function mergeToolConnectors(existing = [], latest = []) {
  const existingById = new Map(existing.map((connector) => [connector.id, connector]));

  return latest.map((connector) => {
    const existingConnector = existingById.get(connector.id);

    if (!existingConnector) {
      return connector;
    }

    return {
      ...connector,
      status: existingConnector.status ?? connector.status,
      enabled: existingConnector.enabled ?? connector.enabled,
      mcpEndpoint: existingConnector.mcpEndpoint ?? connector.mcpEndpoint,
      accountHint: existingConnector.accountHint ?? connector.accountHint,
      updatedAt: existingConnector.updatedAt,
    };
  });
}
