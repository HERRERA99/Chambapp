import { useState } from 'react';
import { Badge } from '../../shared/ui/Panel';
import { Button, IconButton } from '../../shared/ui/Button';
import { usePreviewNotice } from '../../shared/preview/PreviewContext';

// The elapsed time is deliberately fixed. Only the visual pause state is local.
export function TimerDisplay({ compact = false }: { compact?: boolean }) {
  const [paused, setPaused] = useState(false);
  const notify = usePreviewNotice();
  return <div className={`timer-display ${compact ? 'timer-display--compact' : ''}`}><div className="timer-display__context">{compact ? <><span className="eyebrow">Registro de ejemplo</span><strong>Mercury API — Pasarela Stripe</strong></> : <Badge tone="accent"><span className={`status-dot ${paused ? 'status-dot--paused' : ''}`} />{paused ? 'Pausado · Ejemplo' : 'En curso · Ejemplo'}</Badge>}</div><div className="timer-display__clock"><span className="eyebrow">{compact ? null : 'Duración de sesión'}</span><span className="timer-digits">02:44:19</span></div><div className="timer-display__controls">{compact ? <IconButton icon={paused ? 'play' : 'pause'} label={paused ? 'Previsualizar reanudación' : 'Previsualizar pausa'} onClick={() => setPaused(value => !value)} /> : <Button icon={paused ? 'play' : 'pause'} onClick={() => setPaused(value => !value)}>{paused ? 'Reanudar' : 'Pausar'}</Button>}<Button variant="primary" icon={compact ? undefined : 'stop'} onClick={() => notify('Vista previa: el cronómetro es ilustrativo. No se ha creado ningún parte.')}>{compact ? 'Detener' : 'Detener y guardar parte'}</Button></div></div>;
}
