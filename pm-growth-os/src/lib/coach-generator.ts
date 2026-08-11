import type { Capability, CoachPlan, Note, UserProfile } from '../types/domain';

export function generateCoachPlan({
  capabilities,
  notes,
  targetCapabilityId,
  userProfile,
}: {
  capabilities: Capability[];
  notes: Note[];
  targetCapabilityId?: string;
  userProfile: UserProfile;
}): CoachPlan {
  const defaultCapability = capabilities
    .slice()
    .sort((a, b) => a.progress - b.progress)[0];
  const targetCapability =
    capabilities.find((capability) => capability.id === targetCapabilityId) ?? defaultCapability;
  const strongestCapability = capabilities
    .slice()
    .sort((a, b) => b.progress - a.progress)[0];
  const recentTopic = notes[0]?.tags[0] ?? userProfile.focusArea;

  return {
    description: `Coach Agent recommends a small task around ${targetCapability.name}, using your existing strength in ${strongestCapability.name} to reduce startup friction.`,
    steps: [
      {
        id: 'inspect-gap',
        title: 'Step 1: Define the capability gap',
        detail: `Write down one uncertainty you currently have about ${targetCapability.name}, plus one real work scenario.`,
        status: 'active',
      },
      {
        id: 'run-micro-practice',
        title: 'Step 2: Run a micro-practice',
        detail: `Design a 20-minute exercise based on ${recentTopic}. Record the input, output, and judgment criteria.`,
        status: 'todo',
      },
      {
        id: 'capture-evidence',
        title: 'Step 3: Save capability evidence',
        detail: `Turn the practice result into an evidence record, link it to ${targetCapability.name}, and explain how it changed your judgment.`,
        status: 'todo',
      },
    ],
  };
}
