import { ReactNode } from 'react';

type SectionCardProps = {
  title: string;
  subtitle: string;
  actionLabel?: string;
  actionDisabled?: boolean;
  actionVariant?: 'primary' | 'secondary' | 'danger';
  onAction?: () => void;
  children: ReactNode;
};

export function SectionCard({
  title,
  subtitle,
  actionLabel,
  actionDisabled,
  actionVariant = 'secondary',
  onAction,
  children,
}: SectionCardProps) {
  const actionClassName =
    actionVariant === 'primary'
      ? 'solid-button section-action-button'
      : actionVariant === 'danger'
        ? 'danger-button section-action-button'
        : 'ghost-button section-action-button';

  return (
    <section className="section-card">
      <div className="section-card-header">
        <div>
          <p className="section-eyebrow">{subtitle}</p>
          <h2>{title}</h2>
        </div>
        {actionLabel ? (
          <button
            className={actionClassName}
            disabled={actionDisabled || !onAction}
            onClick={onAction}
            type="button"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}
