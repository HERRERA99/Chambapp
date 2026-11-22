import type { DayTimelineModel } from './dayTimeline.model';

export function DayTimeline({ timeline }: { timeline: DayTimelineModel }) {
  return (
    <div className="day-timeline">
      <div className="day-timeline__legend" aria-hidden="true">
        <span>
          <i className="day-timeline__swatch day-timeline__swatch--attendance" />
          Fichado
        </span>
        <span>
          <i className="day-timeline__swatch day-timeline__swatch--entry" />
          Partes
        </span>
        {timeline.unimputedSeconds >= 60 ? (
          <span>
            <i className="day-timeline__swatch day-timeline__swatch--gap" />
            Sin imputar
          </span>
        ) : null}
      </div>
      <div className="day-timeline__chart" role="img" aria-label={timeline.ariaLabel}>
        <div className="day-timeline__track">
          {timeline.ticks.map((tick) => (
            <span
              key={tick.ms}
              className="day-timeline__gridline"
              style={{ left: `${tick.leftPercent}%` }}
              aria-hidden="true"
            />
          ))}
          {timeline.attendance.map((block) => (
            <span
              key={block.id}
              className={`day-timeline__attendance ${block.open ? 'day-timeline__attendance--open' : ''}`}
              style={{ left: `${block.leftPercent}%`, width: `${block.widthPercent}%` }}
              title={block.title}
            />
          ))}
          {timeline.gaps.map((gap) => (
            <span
              key={`${gap.startMs}-${gap.endMs}`}
              className="day-timeline__gap"
              style={{ left: `${gap.leftPercent}%`, width: `${gap.widthPercent}%` }}
              title={gap.title}
            />
          ))}
          {timeline.entries.map((entry) => (
            <span
              key={entry.id}
              className={`day-timeline__entry ${entry.running ? 'day-timeline__entry--running' : ''}`}
              style={{ left: `${entry.leftPercent}%`, width: `${entry.widthPercent}%` }}
              title={entry.title}
            />
          ))}
        </div>
        <div className="day-timeline__axis" aria-hidden="true">
          {timeline.ticks.map((tick) => {
            const align =
              tick.leftPercent <= 0.1
                ? 'start'
                : tick.leftPercent >= 99.9
                  ? 'end'
                  : 'center';
            return (
              <span
                key={tick.ms}
                className={`day-timeline__tick day-timeline__tick--${align} mono`}
                style={{ left: `${tick.leftPercent}%` }}
              >
                {tick.label}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
