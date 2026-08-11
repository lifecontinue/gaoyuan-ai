import { useState } from 'react';
import { SectionCard } from '../../components/ui/SectionCard';
import { useAppStore } from '../../store/app-store';

export function CapturePanel() {
  const [isAdjustingCapabilities, setIsAdjustingCapabilities] = useState(false);
  const capabilities = useAppStore((state) => state.capabilities);
  const draft = useAppStore((state) => state.captureDraft);
  const suggestions = useAppStore((state) => state.captureSuggestions);
  const saveCaptureNote = useAppStore((state) => state.saveCaptureNote);
  const updateCaptureCapabilityLinks = useAppStore(
    (state) => state.updateCaptureCapabilityLinks,
  );
  const updateCaptureDraft = useAppStore((state) => state.updateCaptureDraft);
  const selectedCapabilityIds = suggestions.relatedCapabilities.map((capability) => capability.id);

  return (
    <SectionCard
      title="Evidence Capture"
      subtitle="Work evidence"
      actionLabel="Save Evidence"
      actionDisabled={!draft.trim()}
      actionVariant="primary"
      onAction={saveCaptureNote}
    >
      <div className="capture-container">
        <div className="capture-header">
          <div className="capture-prompt-hint">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42z" />
            </svg>
            <span>Record real thoughts, problems, or observations from AI product work.</span>
          </div>
        </div>
        <textarea
          className="capture-input"
          value={draft}
          placeholder="Today I noticed context loss while debugging an agent workflow..."
          onChange={(event) => updateCaptureDraft(event.target.value)}
        />
        {draft.trim() ? (
          <div className="capability-detected capability-detected-compact">
            <div className="detected-header">
              <div>
                <span className="detected-label">Related capabilities</span>
                <p className="detected-summary">
                  {suggestions.relatedCapabilities.length > 0
                    ? suggestions.relatedCapabilities.map((cap) => cap.name).join(', ')
                    : 'No capability selected yet.'}
                </p>
              </div>
              <span className={`confidence-pill confidence-${suggestions.confidence}`}>
                {suggestions.confidence}
              </span>
            </div>
            <button
              className="text-button capture-adjust-toggle"
              onClick={() => setIsAdjustingCapabilities((current) => !current)}
              type="button"
            >
              {isAdjustingCapabilities ? 'Hide capability options' : 'Adjust related capabilities'}
            </button>
            {isAdjustingCapabilities ? (
              <div className="capture-capability-options" aria-label="Adjust related capabilities">
                {capabilities.map((capability) => {
                  const isSelected = selectedCapabilityIds.includes(capability.id);

                  return (
                    <button
                      className={`capability-option-chip ${isSelected ? 'capability-option-chip-active' : ''}`}
                      key={capability.id}
                      onClick={() => {
                        const nextIds = isSelected
                          ? selectedCapabilityIds.filter((id) => id !== capability.id)
                          : [...selectedCapabilityIds, capability.id];

                        updateCaptureCapabilityLinks(nextIds);
                      }}
                      type="button"
                    >
                      {capability.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : null}
        {suggestions.nextPrompt && (
          <div className="ai-suggestion">
            <div className="suggestion-icon">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm1-13h-2v6l5.25 3.15.75-1.23-4-2.42z" />
              </svg>
            </div>
            <p>{suggestions.nextPrompt}</p>
          </div>
        )}
        <div className="capture-footer">
          <div className="tag-row">
            {suggestions.tags.map((tag) => (
              <span className="chip" key={tag}>
                #{tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}
