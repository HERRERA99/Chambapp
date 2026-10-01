import { Icon } from '../../../shared/ui/Icon';
import { Badge, Notice } from '../../../shared/ui/Panel';

export function RoundingPreview({ interval = '15', compact = false }: { interval?: string; compact?: boolean }) {
  const examples: Record<string, { start: string; end: string; total: string; delta: string }> = {
    '0': { start: '09:07', end: '09:38', total: '31 min', delta: '0 min' },
    '5': { start: '09:10', end: '09:40', total: '30 min', delta: '−1 min' },
    '10': { start: '09:10', end: '09:40', total: '30 min', delta: '−1 min' },
    '15': { start: '09:15', end: '09:45', total: '30 min', delta: '−1 min' },
  };
  const example = examples[interval] ?? examples['15']!;
  return <div className={`rounding-preview ${compact ? 'rounding-preview--compact' : ''}`}><div className="rounding-preview__heading"><span className="eyebrow">Ejemplo ilustrativo de cómputo</span><Badge tone="accent">{interval === '0' ? 'Sin redondeo' : `R${interval.padStart(2, '0')}`}</Badge></div><div className="rounding-flow"><div><span className="eyebrow">Intervalo real</span><strong className="mono">09:07 <span className="dim">→</span> 09:38</strong><span className="muted">31 minutos cronometrados</span></div><Icon name="arrow" /><div className="rounding-flow__result"><span className="eyebrow">Intervalo imputado</span><strong className="mono">{example.start} <span className="dim">→</span> {example.end}</strong><span className="accent">{example.total} · Diferencia: {example.delta}</span></div></div>{compact ? null : <Notice title="El tiempo real siempre se conserva" icon="lock">Ambos intervalos se muestran por separado. Esta simulación visual no aplica ningún cálculo a los partes.</Notice>}</div>;
}
