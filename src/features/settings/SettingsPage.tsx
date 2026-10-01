import { useState } from 'react';
import { PageHeader } from '../../shared/ui/PageHeader';
import { Button } from '../../shared/ui/Button';
import { Panel, Notice } from '../../shared/ui/Panel';
import { Toggle } from '../../shared/ui/FormField';
import { usePreviewNotice } from '../../shared/preview/PreviewContext';
import { WorkdaySettings } from './components/WorkdaySettings';
import { RoundingSettings } from './components/RoundingSettings';
import { RegionalSettings } from './components/RegionalSettings';
import { BillingSettings } from './components/BillingSettings';

export default function SettingsPage() {
  const [reminders, setReminders] = useState(true);
  const [budgetAlerts, setBudgetAlerts] = useState(true);
  const notify = usePreviewNotice();
  return <div className="page-stack"><PageHeader eyebrow="Operaciones / Sistema & Cuenta / Preferencias globales" title="Ajustes y Preferencias" description="Jornada laboral, redondeo, zona horaria y datos de facturación en una consola común." actions={<><Button icon="settings" onClick={() => notify('Vista previa: no se ha restaurado ni cambiado ninguna configuración.')}>Restaurar</Button><Button variant="primary" icon="check" onClick={() => notify('Vista previa: las preferencias no se han guardado.')}>Guardar cambios</Button></>} /><nav className="section-nav" aria-label="Secciones de ajustes">{[{ id: 'jornada', label: 'Jornada & Convenio', tag: '37,5h' }, { id: 'redondeo', label: 'Reglas de redondeo', tag: 'R15' }, { id: 'regional', label: 'Zona horaria', tag: 'UTC+2' }, { id: 'facturacion', label: 'Facturación', tag: 'EUR' }, { id: 'notificaciones', label: 'Notificaciones', tag: 'UI' }, { id: 'seguridad', label: 'Seguridad', tag: 'Pendiente' }].map(section => <a key={section.id} href={`#${section.id}`}>{section.label}<span className="mono dim">{section.tag}</span></a>)}</nav><WorkdaySettings /><RoundingSettings /><RegionalSettings /><BillingSettings /><Panel id="notificaciones" title="Notificaciones & Telemetría" icon="bell"><Toggle checked={reminders} onChange={setReminders} label="Recordatorios de jornada" description="Avisos de inicio y cierre de la jornada prevista." /><Toggle checked={budgetAlerts} onChange={setBudgetAlerts} label="Avisos de presupuesto" description="Alerta visual cuando se alcance el 90% de la estimación." /><p className="field__hint">Los interruptores muestran su estado local. No se envían notificaciones.</p></Panel><Panel id="seguridad" title="Seguridad & Accesos" icon="lock"><Notice title="Autenticación pendiente de integración" icon="lock">Esta interfaz no realiza autenticación, almacena contraseñas ni genera claves API.</Notice><Button icon="shield" disabled>Gestión de accesos · Próximamente</Button></Panel><div className="settings-footer"><Notice title="Histórico independiente de las preferencias" icon="shield">La futura integración deberá aplicar cambios a las nuevas jornadas y preservar los partes históricos.</Notice><Button variant="primary" icon="check" onClick={() => notify('Vista previa: no se han guardado ni sincronizado cambios.')}>Aplicar cambios</Button></div></div>;
}
