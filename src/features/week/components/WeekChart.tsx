import { weekDays } from '../data/week.fixtures';

export function WeekChart() {
  return <div className="week-chart" role="img" aria-label="Horas imputadas: lunes 8 horas 15 minutos; martes 8 horas; miércoles 8 horas 30 minutos; jueves 6 horas 45 minutos; viernes 0 horas. Objetivos: 8 horas de lunes a jueves y 5 horas 30 minutos el viernes.">{weekDays.map(day => <div className={`week-chart__day ${day.state === 'active' ? 'week-chart__day--active' : ''}`} key={day.name}>{day.state === 'active' ? <span className="week-chart__today">Hoy</span> : null}<div className="week-chart__bars"><span className="week-chart__target" style={{ height: `${day.target * 10}%` }} /><span className="week-chart__logged" style={{ height: `${day.logged * 10}%` }} /></div><strong className="mono">{day.short} {day.date}</strong><span className="week-chart__balance">{day.balance}</span><span className="mono muted">{day.duration}</span></div>)}</div>;
}
