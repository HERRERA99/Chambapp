import { Icon } from './Icon';
import type { IconName } from './Icon';
import { Progress } from './Panel';

export interface Stat {
  label: string;
  value: string;
  detail: string;
  icon: IconName;
  accent?: boolean;
  progress?: number;
}

export function StatGrid({ stats }: { stats: readonly Stat[] }) {
  return (
    <div className="stat-grid">
      {stats.map((stat) => (
        <section key={stat.label} className={`stat ${stat.accent ? 'stat--accent' : ''}`}>
          <div className="stat__label">
            <span>{stat.label}</span>
            <Icon name={stat.icon} size={17} />
          </div>
          <p className="stat__value">{stat.value}</p>
          <p className="stat__detail">{stat.detail}</p>
          {stat.progress !== undefined ? (
            <Progress value={stat.progress} label={stat.label} />
          ) : null}
        </section>
      ))}
    </div>
  );
}
