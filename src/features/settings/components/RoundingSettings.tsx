import { useState } from 'react';
import { Panel, Badge } from '../../../shared/ui/Panel';
import { Toggle, InputField } from '../../../shared/ui/FormField';
import { RoundingPreview } from '../../time-entries/components/RoundingPreview';

export function RoundingSettings() {
  const [interval, setInterval] = useState('15');
  const [aligned, setAligned] = useState(true);
  return <Panel id="redondeo" title="Motor y Algoritmo de Redondeo" icon="settings" action={<Badge>Simulación visual</Badge>}><p className="muted section-intro">Tiempo real e imputado por separado, con granularidad de ejemplo.</p><fieldset className="choice-fieldset"><legend>Intervalo de imputación oficial</legend><div className="choice-grid">{[{ value: '0', title: 'Minuto bruto', detail: 'Sin redondeo' }, { value: '5', title: '5 Minutos (R05)', detail: 'Granularidad fina' }, { value: '10', title: '10 Minutos (R10)', detail: 'Balance intermedio' }, { value: '15', title: '15 Minutos (R15)', detail: 'Estándar Chambapp' }].map(option => <label className={`choice-card ${interval === option.value ? 'choice-card--selected' : ''}`} key={option.value}><input type="radio" name="rounding-interval" value={option.value} checked={interval === option.value} onChange={() => setInterval(option.value)} /><strong>{option.title}</strong><span className="muted">{option.detail}</span></label>)}</div></fieldset><div className="two-columns"><div><Toggle checked={aligned} onChange={setAligned} label="Alineación a límites del reloj" description="Preferencia visual. La simulación muestra valores fijos de ejemplo." /><Toggle checked disabled label="Preservar intervalo real" description="El diseño mantiene ambas columnas independientes." /><InputField label="Umbral de gracia para tramos cortos" type="number" min="0" max="15" defaultValue="3" hint="Minutos · Valor de ejemplo, sin aplicación a los partes." /></div><RoundingPreview interval={interval} compact /></div></Panel>;
}
