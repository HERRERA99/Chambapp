import type { CSSProperties, ReactNode } from 'react';
import { LazyMotion, MotionConfig, domAnimation, m } from 'motion/react';
import './bar-chart.css';

export type BarTone = 'neutral' | 'accent';

export type BarSeries = {
  key: string;
  label: string;
  tone: BarTone;
};

export type BarChartColumn = {
  key: string;
  label: ReactNode;
  /** Value per series key. */
  values: Readonly<Record<string, number>>;
  /** Part of a series value shown striped (for example, time still in progress). */
  provisional?: Readonly<Record<string, number>>;
  active?: boolean;
  badge?: string;
  title?: string;
  header?: ReactNode;
  footer?: ReactNode;
};

/**
 * Grouped bar chart with the landing page look: gradient bars over a soft grid
 * that grow from the bottom, staggered per day, the first time they scroll into view.
 */
export function BarChart({
  series,
  columns,
  ariaLabel,
  legendAside,
  showProvisionalLegend = false,
  minColumnWidth = 0,
  height = 200,
}: {
  series: readonly BarSeries[];
  columns: readonly BarChartColumn[];
  ariaLabel: string;
  legendAside?: ReactNode;
  showProvisionalLegend?: boolean;
  minColumnWidth?: number;
  height?: number;
}) {
  const maximum = Math.max(
    3600,
    ...columns.flatMap((column) => series.map((item) => column.values[item.key] ?? 0)),
  );
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">
        <div className="bar-chart">
          <div className="bar-chart__legend" aria-hidden="true">
            {series.map((item) => (
              <span key={item.key}>
                <i className={`bar-chart__swatch bar-chart__swatch--${item.tone}`} /> {item.label}
              </span>
            ))}
            {showProvisionalLegend ? (
              <span>
                <i className="bar-chart__swatch bar-chart__swatch--provisional" /> En curso
              </span>
            ) : null}
            {legendAside ? <small>{legendAside}</small> : null}
          </div>
          <div
            className="bar-chart__plot"
            role="img"
            tabIndex={0}
            aria-label={ariaLabel}
            style={
              {
                '--bar-chart-min': `${minColumnWidth}px`,
                '--bar-chart-height': `${height}px`,
              } as CSSProperties
            }
          >
            {columns.map((column, columnIndex) => (
              <div
                key={column.key}
                className={`bar-chart__day ${column.active ? 'bar-chart__day--active' : ''}`}
                title={column.title}
              >
                {column.badge ? <span className="bar-chart__badge">{column.badge}</span> : null}
                {column.header ? <div className="bar-chart__header">{column.header}</div> : null}
                <span className="bar-chart__columns" aria-hidden="true">
                  {series.map((item, seriesIndex) => {
                    const value = column.values[item.key] ?? 0;
                    const provisional = Math.min(value, column.provisional?.[item.key] ?? 0);
                    return (
                      <m.span
                        key={item.key}
                        className={`bar-chart__bar bar-chart__bar--${item.tone}`}
                        style={{ height: `${(value / maximum) * 100}%` }}
                        initial={{ scaleY: 0 }}
                        whileInView={{ scaleY: 1 }}
                        viewport={{ once: true }}
                        transition={{
                          duration: 0.75,
                          delay: columnIndex * 0.08 + seriesIndex * 0.15,
                        }}
                      >
                        {provisional > 0 ? (
                          <span
                            className="bar-chart__provisional"
                            style={{ height: `${(provisional / value) * 100}%` }}
                          />
                        ) : null}
                      </m.span>
                    );
                  })}
                </span>
                <span className="bar-chart__label">{column.label}</span>
                {column.footer ? <div className="bar-chart__footer">{column.footer}</div> : null}
              </div>
            ))}
          </div>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
