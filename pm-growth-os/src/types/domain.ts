export type Capability = {
  id: string;
  name: string;
  category: string;
  progress: number;
  stageLabel: string;
  summary: string;
  evidenceCount: number;
  updatedAt: string;
};

export type CaptureSuggestions = {
  tags: string[];
  relatedCapabilities: CapabilityMatch[];
  confidence: 'low' | 'medium' | 'high';
  nextPrompt: string;
};

export type CapabilityMatch = {
  id: string;
  name: string;
  reason: string;
};

export type Note = {
  id: string;
  content: string;
  createdAt: string;
  relatedCapabilityIds: string[];
  tags: string[];
};

export type CoachStep = {
  id: string;
  title: string;
  detail: string;
  status: 'todo' | 'active' | 'done';
};

export type LearningResourceType =
  | 'official'
  | 'framework'
  | 'tutorial'
  | 'case-study'
  | 'paper'
  | 'tool';

export type LearningResource = {
  id: string;
  title: string;
  url: string;
  source: string;
  resourceType: LearningResourceType;
  summary: string;
  whyUseful: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  estimatedMinutes: number;
};

export type LearningGuide = {
  capabilityId: string;
  capabilityName: string;
  concept: string;
  whyNow: string;
  learningPath: string[];
  resources: LearningResource[];
  practiceTask: string;
  practiceTasks?: LearningPracticeTask[];
  reflectionPrompt: string;
  captureTemplate: string;
  nextStep: string;
  review?: LearningReview;
};

export type LearningPracticeTask = {
  id: string;
  title: string;
  objective: string;
  tool: string;
  artifact: string;
  steps: string[];
  output: string;
  doneWhen: string;
  estimatedMinutes: number;
};

export type LearningReview = {
  score: number;
  verdict: 'ready' | 'needs_improvement';
  checks: Array<{
    label: string;
    passed: boolean;
    note: string;
  }>;
  recommendations: string[];
};

export type CoachPlan = {
  description: string;
  steps: CoachStep[];
  learningGuide?: LearningGuide;
};

export type WeeklySummary = {
  period: string;
  progress: string[];
  nextActions: string[];
};

export type UserProfile = {
  currentStageLabel: string;
  weeklyGoal: number;
  focusArea: string;
  preferredModel: string;
  longTermGoal: string;
  savedNotes: number;
  lastInsight: string;
};

export type ModelCallTrace = {
  id: string;
  agent:
    | 'Evidence Capture'
    | 'Coach Agent'
    | 'Knowledge Tool'
    | 'Learning Review Agent'
    | 'Reflection Agent'
    | 'Profile Agent'
    | 'Dev Gateway';
  operation: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  latencyMs: number;
  status: 'success' | 'fallback';
  createdAt: string;
  promptPreview: string;
  completionPreview: string;
};

export type TokenCostSummary = {
  totalCalls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

export type UsageLog = {
  id: string;
  user_id: string;
  feature: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  cost: number;
  latency: number;
  created_at: string;
};

export type ToolConnector = {
  id: string;
  name: string;
  category: 'llm' | 'mcp' | 'knowledge' | 'workflow' | 'export' | 'database';
  method: 'env' | 'mcp' | 'account' | 'local';
  status: 'not_connected' | 'needs_account' | 'configured' | 'enabled';
  scope: 'platform' | 'user';
  description: string;
  useCases: string[];
  requiredInputs: string[];
  envKeys?: string[];
  mcpEndpoint?: string;
  accountHint?: string;
  enabled: boolean;
  updatedAt?: string;
};

export type WorkspaceState = {
  capabilities: Capability[];
  captureDraft: string;
  captureSuggestions: CaptureSuggestions;
  coachPlan: CoachPlan;
  modelTraces: ModelCallTrace[];
  notes: Note[];
  reflectionDraft: string;
  selectedCapabilityId: string;
  toolConnectors: ToolConnector[];
  usageLogs: UsageLog[];
  weeklySummary: WeeklySummary;
  userProfile: UserProfile;
  updatedAt?: string;
};
