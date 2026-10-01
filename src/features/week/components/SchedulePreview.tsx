import { useState, useId } from 'react';
import { SegmentedControl } from '../../../shared/ui/SegmentedControl';
import { Icon } from '../../../shared/ui/Icon';

type Preset = 'office' | 'equal' | 'custom';
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'] as const;
const office = [8, 8, 8, 8, 5.5];
const equal = [7.5, 7.5, 7.5, 7.5, 7.5];

function duration(hours: number) {
  return `${Math.floor(hours).toString().padStart(2, '0')}h ${Math.round((hours % 1) * 60).toString().padStart(2, '0')}m`;
}

export function SchedulePreview() {
  const [preset, setPreset] = useState<Preset>('office');
  const [values, setValues] = useState(office);
  const id = useId();
  const total = values.reduce((sum, value) => sum + value, 0);
  function choosePreset(value: Preset) {
    setPreset(value);
    if (value !== 'custom') setValues(value === 'office' ? office : equal);
  }
  return <div className="schedule-preview"><SegmentedControl<Preset> label="Reparto semanal de ejemplo" value={preset} onChange={choosePreset} options={[{ value: 'office', label: 'L–J 8h + V 5h30m' }, { value: 'equal', label: 'Equitativo · 7h30m × 5' }, { value: 'custom', label: 'Personalizado' }]} /><div className="schedule-days">{days.map((day, index) => <div className={`schedule-day ${index === 4 ? 'schedule-day--short' : ''}`} key={day}><label htmlFor={`${id}-${index}`}>{day}</label><output htmlFor={`${id}-${index}`} className="mono">{duration(values[index] ?? 0)}</output><input id={`${id}-${index}`} type="range" min="0" max="10" step="0.25" value={values[index]} aria-label={`Objetivo de ${day}`} aria-valuetext={duration(values[index] ?? 0)} onChange={event => { setPreset('custom'); setValues(current => current.map((value, position) => position === index ? Number(event.target.value) : value)); }} /><div className="split-label dim"><span>0h</span><span>{index === 4 ? 'Intensivo' : 'Estándar'}</span><span>10h</span></div></div>)}</div><div className={`schedule-total ${total === 37.5 ? '' : 'schedule-total--warning'}`}><Icon name={total === 37.5 ? 'verified' : 'info'} /><span>Suma configurada: <strong className="mono">{duration(total)}</strong> / Meta: <strong className="mono">37h 30m</strong></span><span className="field__hint">Simulación local · No modifica tu jornada</span></div></div>;
}
