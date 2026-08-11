import { useEffect, useRef, useState, type ReactNode } from 'react';
import { SectionCard } from '../../components/ui/SectionCard';
import { notify } from '../../lib/notifications';
import { useAppStore } from '../../store/app-store';
import type {
  CoachStep,
  LearningGuide,
  LearningResource,
  LearningResourceType,
  LearningReview,
} from '../../types/domain';

const resourceFilters: Array<LearningResourceType | 'all'> = [
  'all',
  'official',
  'framework',
  'tutorial',
  'case-study',
  'paper',
  'tool',
];

type CoachPanelProps = {
  onOpenCapture?: () => void;
  onOpenReflection?: () => void;
};

export function CoachPanel({ onOpenCapture, onOpenReflection }: CoachPanelProps) {
  const [activeFilter, setActiveFilter] = useState<LearningResourceType | 'all'>('all');
  const [selectedResource, setSelectedResource] = useState<LearningResource | null>(null);
  const [selectedStep, setSelectedStep] = useState<CoachStep | null>(null);
  const coachPlan = useAppStore((state) => state.coachPlan);
  const generateCapabilityCoachPlan = useAppStore(
    (state) => state.generateCapabilityCoachPlan,
  );
  const generateCoachPlan = useAppStore((state) => state.generateCoachPlan);
  const sendLearningResourceToCapture = useAppStore(
    (state) => state.sendLearningResourceToCapture,
  );
  const sendCoachStepToCapture = useAppStore((state) => state.sendCoachStepToCapture);
  const updateCaptureDraft = useAppStore((state) => state.updateCaptureDraft);
  const updateReflectionDraft = useAppStore((state) => state.updateReflectionDraft);
  const learningGuide = coachPlan.learningGuide;
  const hasLiveResources = Boolean(learningGuide?.resources.length);
  const filteredResources =
    activeFilter === 'all'
      ? learningGuide?.resources ?? []
      : learningGuide?.resources.filter((resource) => resource.resourceType === activeFilter) ?? [];
  const practiceSteps = learningGuide
    ? coachPlan.steps.filter((step) => step.id === 'practice' || step.id.startsWith('practice-'))
    : coachPlan.steps;
  const primaryPracticeStep = practiceSteps[0];

  return (
    <>
      <SectionCard
        title="Coach Agent"
        subtitle="Knowledge-guided practice"
        actionLabel="Generate Learning Path"
        actionVariant="primary"
        onAction={generateCoachPlan}
      >
        <div className="coach-agent-workflow">
          <div className="coach-agent-brief">
            <div className="coach-plan-compact">
              <span className="snapshot-label">Current Focus</span>
              <strong>{learningGuide?.capabilityName ?? 'Personal AI PM growth'}</strong>
            </div>
            <InfoDetails title="Plan rationale">
              <p>{coachPlan.description}</p>
            </InfoDetails>
            {learningGuide ? (
              <span className="chip chip-muted">{learningGuide.capabilityName}</span>
            ) : null}
          </div>

          {learningGuide ? (
            <section className="coach-stage-section">
              <StageHeader
                index="01"
                title="Learn"
                subtitle="Pick one resource, then move into practice."
              />
              <div className="learning-guide-card learning-guide-card-compact">
                <div className="section-inline-header">
                  <div>
                    <strong>{learningGuide.capabilityName}</strong>
                    <span className="muted-text">{learningGuide.concept}</span>
                  </div>
                  <span className="chip chip-muted">Knowledge Tool</span>
                </div>
                <InfoDetails title="Why this path?">
                  <p>{learningGuide.whyNow}</p>
                  <div className="learning-path-list">
                    {learningGuide.learningPath.map((item, index) => (
                      <span key={item}>
                        <strong>{index + 1}</strong>
                        {item}
                      </span>
                    ))}
                  </div>
                </InfoDetails>
              </div>
              <div className="learning-resources">
                <div className="section-inline-header">
                  <div>
                    <strong>Learning Resources</strong>
                    <span className="muted-text">
                      Scan cards here. Open details when a resource looks useful.
                    </span>
                  </div>
                  <span className="muted-text">{filteredResources.length} shown</span>
                </div>
                <div className="resource-filter-row">
                  {resourceFilters.map((filter) => (
                    <button
                      className={`filter-chip ${activeFilter === filter ? 'filter-chip-active' : ''}`}
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      type="button"
                    >
                      {formatResourceType(filter)}
                    </button>
                  ))}
                </div>
                <div className="resource-grid">
                  {filteredResources.length > 0 ? (
                    filteredResources.map((resource) => (
                      <article className="resource-card" key={resource.id}>
                        <div className="resource-card-top">
                          <div>
                            <span className="chip chip-muted">
                              {formatResourceType(resource.resourceType)}
                            </span>
                            <span className="resource-source">{resource.source}</span>
                          </div>
                          <span className="resource-time">{resource.estimatedMinutes} min</span>
                        </div>
                        <div className="resource-card-body">
                          <h3>{resource.title}</h3>
                          <p>{resource.summary}</p>
                        </div>
                        <div className="resource-meta">
                          <span>{resource.difficulty}</span>
                          <span>{formatResourceType(resource.resourceType)}</span>
                        </div>
                        <div className="resource-card-actions">
                          <button
                            className="solid-button"
                            onClick={() => setSelectedResource(resource)}
                            type="button"
                          >
                            View Details
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state resource-empty-state">
                      <div className="empty-state-icon">K</div>
                      <h3>{hasLiveResources ? 'No resources in this filter' : 'Live resources unavailable'}</h3>
                      {hasLiveResources ? (
                        <p>Try another resource type or switch back to All.</p>
                      ) : (
                        <>
                          <p>
                            This plan was generated before live web resources were available. Start
                            the Knowledge Search API, then reload resources for this capability.
                          </p>
                          <button
                            className="solid-button"
                            onClick={() => generateCapabilityCoachPlan(learningGuide.capabilityId)}
                            type="button"
                          >
                            Reload Live Resources
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </section>
          ) : null}

          <section className="coach-stage-section">
            <StageHeader
              index={learningGuide ? '02' : '01'}
              title="Practice"
              subtitle="Turn the plan into concrete weekly work."
            />
            <div className="practice-card-list">
              {practiceSteps.map((step, index) => (
                <article className="practice-card" key={step.id}>
                  <div className="agenda-item-head">
                    <div>
                      <span className="snapshot-label">Task {index + 1}</span>
                      <strong>{step.title}</strong>
                    </div>
                    <span className={`status-dot status-${step.status}`}>{step.status}</span>
                  </div>
                  <p>{step.detail}</p>
                  <button className="text-button" onClick={() => setSelectedStep(step)} type="button">
                    View Practice Details
                  </button>
                </article>
              ))}
            </div>
          </section>

          {learningGuide ? (
            <>
              <section className="coach-stage-section coach-stage-split">
                <StageHeader
                  index="03"
                  title="Evidence"
                  subtitle="Save structured evidence from the practice."
                />
                <div className="coach-prompt-card">
                  <strong>Evidence Template</strong>
                  <p>{learningGuide.captureTemplate}</p>
                  <div className="coach-card-actions">
                    <button
                      className="solid-button"
                      onClick={() => {
                        updateCaptureDraft(buildEvidenceDraft(learningGuide.captureTemplate, primaryPracticeStep));
                        notify('Evidence Draft prepared.', 'success');
                        onOpenCapture?.();
                      }}
                      type="button"
                    >
                      Draft Evidence
                    </button>
                    {primaryPracticeStep ? (
                      <button
                        className="ghost-button"
                        onClick={() => {
                          sendCoachStepToCapture(primaryPracticeStep.id);
                          onOpenCapture?.();
                        }}
                        type="button"
                      >
                        Use Top Task
                      </button>
                    ) : null}
                  </div>
                </div>
                {learningGuide.review ? <LearningReviewCard review={learningGuide.review} /> : null}
              </section>

              <section className="coach-stage-section coach-stage-split">
                <StageHeader
                  index="04"
                  title="Reflect"
                  subtitle="Close the loop and decide the next step."
                />
                <div className="coach-prompt-card">
                  <strong>Reflection Prompt</strong>
                  <p>{learningGuide.reflectionPrompt}</p>
                  <div className="coach-card-actions">
                    <button
                      className="solid-button"
                      onClick={() => {
                        updateReflectionDraft(buildReflectionDraft(learningGuide));
                        notify('Reflection Draft prepared.', 'success');
                        onOpenReflection?.();
                      }}
                      type="button"
                    >
                      Draft Reflection
                    </button>
                  </div>
                </div>
                <div className="coach-prompt-card coach-next-step">
                  <strong>Next Step</strong>
                  <p>{learningGuide.nextStep}</p>
                </div>
              </section>
            </>
          ) : null}
        </div>
      </SectionCard>
      {selectedResource ? (
        <ResourceDetailModal
          onClose={() => setSelectedResource(null)}
          onSendToCapture={() => {
            sendLearningResourceToCapture(selectedResource.id);
            setSelectedResource(null);
          }}
          resource={selectedResource}
        />
      ) : null}
      {selectedStep ? (
        <PracticeDetailModal
          onClose={() => setSelectedStep(null)}
          onSendToCapture={() => {
            sendCoachStepToCapture(selectedStep.id);
            setSelectedStep(null);
          }}
          step={selectedStep}
        />
      ) : null}
    </>
  );
}

function LearningReviewCard({
  review,
}: {
  review: LearningReview;
}) {
  return (
    <div className="coach-prompt-card learning-review-card">
      <div className="section-inline-header">
        <div>
          <strong>Learning Review Agent</strong>
          <span className="muted-text">Checks task quality and learning fit.</span>
        </div>
        <span className={`review-score review-score-${review.verdict}`}>
          {review.score}
        </span>
      </div>
      <div className="review-check-list">
        {review.checks.map((check) => (
          <span className={check.passed ? 'review-check-passed' : 'review-check-warning'} key={check.label}>
            <strong>{check.passed ? 'Pass' : 'Check'}</strong>
            {check.label}
          </span>
        ))}
      </div>
      <div className="review-recommendations">
        <strong>{review.verdict === 'ready' ? 'Recommended next move' : 'Improve before practice'}</strong>
        <p>{review.recommendations[0]}</p>
      </div>
    </div>
  );
}

function buildEvidenceDraft(template: string, primaryPracticeStep?: CoachStep) {
  return [
    template,
    '',
    '### Practice Completed',
    primaryPracticeStep
      ? `${primaryPracticeStep.title}\n\n${primaryPracticeStep.detail}`
      : '[Paste the practice task you completed]',
    '',
    '### Validation',
    '[What proof shows this improved quality, speed, confidence, or reliability?]',
    '',
    '### Submission Status',
    'Ready to save as evidence after filling in the result.',
  ].join('\n');
}

function buildReflectionDraft(guide: LearningGuide) {
  return [
    `# ${guide.capabilityName} Reflection`,
    '',
    '## Prompt',
    guide.reflectionPrompt,
    '',
    '## What became clearer',
    '- ',
    '',
    '## What still feels uncertain',
    '- ',
    '',
    '## Evidence to review',
    '- Link this reflection to the evidence record created from the practice.',
    '',
    '## Next experiment',
    `- ${guide.nextStep}`,
  ].join('\n');
}

function InfoDetails({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="info-details" ref={popoverRef}>
      <button
        aria-expanded={isOpen}
        className="info-trigger"
        onClick={() => setIsOpen((current) => !current)}
        onFocus={() => setIsOpen(true)}
        type="button"
      >
        <span className="info-dot">?</span>
        {title}
      </button>
      {isOpen ? (
        <div className="info-details-body" role="dialog">
          <div className="info-popover-head">
            <strong>{title}</strong>
            <button
              aria-label={`Close ${title}`}
              className="info-close-button"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              <svg
                width="14"
                height="14"
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
          <div className="info-popover-content">{children}</div>
        </div>
      ) : null}
    </div>
  );
}

function ResourceDetailModal({
  onClose,
  onSendToCapture,
  resource,
}: {
  onClose: () => void;
  onSendToCapture: () => void;
  resource: LearningResource;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-modal="true"
        className="modal-panel coach-detail-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader onClose={onClose} title="Resource Details" />
        <div className="coach-detail-stack">
          <div className="resource-card-top">
            <div>
              <span className="chip chip-muted">{formatResourceType(resource.resourceType)}</span>
              <span className="resource-source">{resource.source}</span>
            </div>
            <span className="resource-time">{resource.estimatedMinutes} min</span>
          </div>
          <h2>{resource.title}</h2>
          <div className="coach-detail-block">
            <strong>Summary</strong>
            <p>{resource.summary}</p>
          </div>
          <div className="coach-detail-block why-resource">
            <strong>Why this resource?</strong>
            <p>{resource.whyUseful}</p>
          </div>
          <div className="resource-meta">
            <span>{resource.difficulty}</span>
            <span>{formatResourceType(resource.resourceType)}</span>
          </div>
          <div className="detail-actions">
            <a
              className="solid-button resource-link"
              href={resource.url}
              rel="noreferrer"
              target="_blank"
            >
              Start Learning
            </a>
            <button className="ghost-button" onClick={onSendToCapture} type="button">
              Use as Evidence Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PracticeDetailModal({
  onClose,
  onSendToCapture,
  step,
}: {
  onClose: () => void;
  onSendToCapture: () => void;
  step: CoachStep;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        aria-modal="true"
        className="modal-panel coach-detail-modal"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <ModalHeader onClose={onClose} title="Practice Details" />
        <div className="coach-detail-stack">
          <div className="section-inline-header">
            <h2>{step.title}</h2>
            <span className={`status-dot status-${step.status}`}>{step.status}</span>
          </div>
          <div className="coach-detail-block">
            <strong>Task Detail</strong>
            <p>{step.detail}</p>
          </div>
          <div className="detail-actions">
            <button className="solid-button" onClick={onSendToCapture} type="button">
              Use as Evidence Draft
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalHeader({ onClose, title }: { onClose: () => void; title: string }) {
  return (
    <div className="modal-header">
      <strong>{title}</strong>
      <button
        aria-label="Close modal"
        className="icon-button"
        onClick={onClose}
        title="Close modal"
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
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function StageHeader({
  index,
  title,
  subtitle,
}: {
  index: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="coach-stage-header">
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <p>{subtitle}</p>
      </div>
    </div>
  );
}

function formatResourceType(type: LearningResourceType | 'all') {
  const labelMap: Record<LearningResourceType | 'all', string> = {
    all: 'All',
    official: 'Official',
    framework: 'Framework',
    tutorial: 'Tutorial',
    'case-study': 'Case Study',
    paper: 'Paper',
    tool: 'Tool',
  };

  return labelMap[type];
}
