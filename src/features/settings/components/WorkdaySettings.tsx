import { useState } from 'react';
import { Panel, Badge, Notice } from '../../../shared/ui/Panel';
import { SchedulePreview } from '../../week/components/SchedulePreview';
import { Toggle } from '../../../shared/ui/FormField';

export function WorkdaySettings() {
  const [mode, setMode] = useState('37.5');
  const [flexible, setFlexible] = useState(true);
  return <Panel id="jornada" title="Jornada Base y Reparto Semanal" icon="calendar" action={<Badge tone="success">Convenio flexible</Badge>}><p className="muted section-intro">Configuración visual del cómputo y los balances semanales.</p><fieldset className="choice-fieldset"><legend>Convenio / Modalidad base</legend><div className="choice-grid">{[{ value: '37.5', title: '37,5 Horas', detail: 'Convenio flexible · Viernes intensivo' }, { value: '40', title: '40,0 Horas', detail: 'Estándar · 5 × 8h' }, { value: '35', title: '35,0 Horas', detail: 'Jornada reducida' }, { value: 'manual', title: 'Manual…', detail: 'Definición día a día' }].map(option => <label className={`choice-card ${mode === option.value ? 'choice-card--selected' : ''}`} key={option.value}><input type="radio" name="workday-mode" value={option.value} checked={mode === option.value} onChange={() => setMode(option.value)} /><strong>{option.title}</strong><span className="muted">{option.detail}</span></label>)}</div></fieldset>{mode === '37.5' || mode === 'manual' ? <SchedulePreview /> : <Notice title="Convenio de ejemplo seleccionado">La distribución detallada puede previsualizarse en el convenio de 37,5 horas o en modo manual.</Notice>}<Toggle checked={flexible} onChange={setFlexible} label="Colchón de horas flexible" description="Margen visual de ±3 horas semanales para conciliación. Sin cambios persistentes." /></Panel>;
}
