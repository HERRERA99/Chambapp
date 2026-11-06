import { ArrowUpRight, ListChecks, Pause, Play } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, fadeUp, formatClock, lerp } from '../components/anim';
import { AppWindow, FeatureScene, Gradient, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

const tasks = [
  { title: 'Preparar la propuesta de diseño', project: 'Estudio Norte', color: '#ff2e56', odoo: 'T443212' },
  { title: 'Revisar flujo de pagos', project: 'Neobank App', color: '#8fb8ff', odoo: 'T443287' },
  { title: 'Migrar formulario de acceso', project: 'Aero Portal', color: '#88cbb2', odoo: 'T443301' },
  { title: 'Informe mensual de soporte', project: 'Mercury CRM', color: '#ecb67c', odoo: null },
];

const CLICK = 70;

export const Tasks: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const running = frame >= CLICK;
  const press = lerp(frame, [CLICK - 4, CLICK, CLICK + 6], [1, 0.86, 1]);
  // El cronómetro avanza deprisa para que se note en pantalla.
  const seconds = 3600 + 24 * 60 + 13 + Math.max(0, frame - CLICK) * 7;
  const glow = running ? 0.5 + 0.5 * Math.sin(frame / 6) : 0;

  return (
    <FeatureScene
      index="02"
      kicker="TAREAS"
      icon={ListChecks}
      title={
        <>
          Un clic y
          <br />
          <Gradient>a trabajar.</Gradient>
        </>
      }
      description="Tareas enlazadas con Odoo y un cronómetro que nunca pierde un segundo."
    >
      <AppWindow title="Chambapp / Tareas" style={{ width: '100%', opacity: enter(frame, fps, 2) }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {tasks.map((t, i) => {
            const active = i === 0;
            return (
              <div
                key={t.title}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 22,
                  padding: '20px 24px',
                  borderRadius: 16,
                  background: active && running ? 'rgba(255,46,86,0.09)' : colors.surfaceRaised,
                  border: `1px solid ${active && running ? 'rgba(255,46,86,0.5)' : colors.border}`,
                  boxShadow: active && running ? `0 0 ${30 + glow * 30}px rgba(255,46,86,${0.15 + glow * 0.15})` : 'none',
                  ...fadeUp(frame, fps, 10 + i * 6, 30),
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    background: active ? colors.accent : colors.surfaceLow,
                    border: `1px solid ${active ? colors.accent : colors.border}`,
                    scale: active ? String(press) : '1',
                    flexShrink: 0,
                  }}
                >
                  {active && running ? (
                    <Pause size={28} color="#fff" fill="#fff" />
                  ) : (
                    <Play size={28} color={active ? '#fff' : colors.dim} fill={active ? '#fff' : 'none'} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 28, color: colors.text }}>{t.title}</div>
                  <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: fonts.body, fontSize: 21, color: colors.muted }}>
                      <i style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} /> {t.project}
                    </span>
                    {t.odoo ? (
                      <Pill tone="accent" style={{ fontSize: 17, padding: '3px 12px' }}>
                        {t.odoo} <ArrowUpRight size={15} />
                      </Pill>
                    ) : null}
                  </div>
                </div>
                {active ? (
                  <div style={{ textAlign: 'right' }}>
                    <div
                      style={{
                        fontFamily: fonts.mono,
                        fontSize: 40,
                        fontWeight: 600,
                        color: running ? colors.accentSoft : colors.dim,
                      }}
                    >
                      {formatClock(seconds)}
                    </div>
                    <div style={{ fontFamily: fonts.mono, fontSize: 17, color: running ? colors.accent : colors.dim, letterSpacing: '0.12em' }}>
                      {running ? '● EN CURSO' : 'EN PAUSA'}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </AppWindow>
    </FeatureScene>
  );
};
