import type { ReactNode } from 'react';

/** One setting: what it controls on the left, the control on the right. */
export function SettingRow({
  label,
  description,
  htmlFor,
  modified = false,
  children,
  stacked = false,
}: {
  label: string;
  description?: ReactNode;
  htmlFor?: string;
  modified?: boolean;
  children: ReactNode;
  stacked?: boolean;
}) {
  return (
    <div className={`setting-row ${stacked ? 'setting-row--stacked' : ''}`}>
      <div className="setting-row__text">
        <div className="setting-row__label">
          {htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span>{label}</span>}
          {modified ? <span className="setting-row__modified">Modificado</span> : null}
        </div>
        {description ? <p className="setting-row__description">{description}</p> : null}
      </div>
      <div className="setting-row__control">{children}</div>
    </div>
  );
}

export function SettingsSection({
  id,
  title,
  description,
  hidden,
  badge,
  children,
}: {
  id: string;
  title: string;
  description: string;
  hidden: boolean;
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="settings-section" hidden={hidden} aria-labelledby={`${id}-title`}>
      <header className="settings-section__header">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          <p>{description}</p>
        </div>
        {badge}
      </header>
      {children}
    </section>
  );
}
