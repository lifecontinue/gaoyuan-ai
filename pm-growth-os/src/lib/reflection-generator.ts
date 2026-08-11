import type { Capability, Note, UserProfile, WeeklySummary } from '../types/domain';

export function generateWeeklyMarkdown({
  capabilities,
  notes,
  userProfile,
  weeklySummary,
}: {
  capabilities: Capability[];
  notes: Note[];
  userProfile: UserProfile;
  weeklySummary: WeeklySummary;
}) {
  const period = getCurrentWeekLabel();
  const recentNotes = notes.slice(0, 5);
  const activeCapabilities = capabilities
    .filter((capability) =>
      recentNotes.some((note) => note.relatedCapabilityIds.includes(capability.id)),
    )
    .sort((a, b) => b.progress - a.progress);

  const progressItems =
    recentNotes.length > 0
      ? recentNotes.map((note) => summarizeNote(note.content))
      : weeklySummary.progress;

  const capabilityItems =
    activeCapabilities.length > 0
      ? activeCapabilities.map(
          (capability) =>
            `${capability.name}: ${capability.progress}% progress, ${capability.evidenceCount} evidence records`,
        )
      : capabilities
          .slice()
          .sort((a, b) => b.progress - a.progress)
          .slice(0, 3)
          .map((capability) => `${capability.name}: ${capability.stageLabel}`);

  const nextActions =
    recentNotes.length > 0
      ? [
          userProfile.lastInsight,
          `Add two more real work evidence records around ${userProfile.focusArea}.`,
          'Turn the most valuable evidence record this week into a reusable case study.',
        ]
      : weeklySummary.nextActions;

  return [
    `# ${period} Weekly Reflection`,
    '',
    '## Progress This Week',
    ...progressItems.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Capability Changes',
    ...capabilityItems.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Plan for Next Week',
    ...nextActions.map((item, index) => `${index + 1}. ${item}`),
    '',
    '## Reflection',
    `This week centered on ${userProfile.focusArea}. Next, convert scattered evidence into clear capability signals and reusable methods.`,
  ].join('\n');
}

function summarizeNote(content: string) {
  const normalized = content.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 52) {
    return normalized;
  }

  return `${normalized.slice(0, 52)}...`;
}

function getCurrentWeekLabel() {
  const now = new Date();
  const month = now.toLocaleString('en-US', { month: 'long' });
  const weekOfMonth = Math.ceil(now.getDate() / 7);

  return `${month} ${now.getFullYear()}, Week ${weekOfMonth}`;
}
