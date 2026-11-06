import { Cloud, FolderKanban, HardDrive } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, enter } from '../components/anim';
import { AppWindow, Card, FeatureScene, Gradient, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

const projects = [
  { name: 'Estudio Norte', client: 'Diseño de marca', color: '#ff2e56', hours: 42.5, progress: 0.72, tasks: 12, local: false },
  { name: 'Neobank App', client: 'Finanzas · Móvil', color: '#8fb8ff', hours: 31.25, progress: 0.48, tasks: 9, local: true },
  { name: 'Aero Portal', client: 'Intranet', color: '#88cbb2', hours: 18, progress: 0.35, tasks: 6, local: false },
  { name: 'Mercury CRM', client: 'Consultoría', color: '#ecb67c', hours: 56.75, progress: 0.9, tasks: 21, local: true },
];

export const Projects: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <FeatureScene
      index="01"
      kicker="PROYECTOS"
      icon={FolderKanban}
      title={
        <>
          Cada proyecto,
          <br />
          <Gradient>su contexto.</Gradient>
        </>
      }
      description="Proyectos y clientes con su color, sus tareas y todas sus horas."
    >
      <AppWindow
        title="Chambapp / Proyectos & clientes"
        style={{ width: '100%', rotate: `${(1 - enter(frame, fps, 6)) * 4}deg`, opacity: enter(frame, fps, 4) }}
        bodyStyle={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 22 }}
      >
        {projects.map((p, i) => {
          const pIn = enter(frame, fps, 14 + i * 7, 16);
          const bar = ease(frame, [30 + i * 7, 80 + i * 7], [0, p.progress]);
          return (
            <Card
              key={p.name}
              style={{
                position: 'relative',
                overflow: 'hidden',
                opacity: Math.min(1, pIn * 1.4),
                scale: String(0.85 + 0.15 * pIn),
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
              }}
            >
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: p.color }} />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 32, color: colors.text }}>{p.name}</div>
                  <div style={{ fontFamily: fonts.body, fontSize: 22, color: colors.dim, marginTop: 4 }}>{p.client}</div>
                </div>
                <Pill tone={p.local ? 'info' : 'success'}>
                  {p.local ? <HardDrive size={16} /> : <Cloud size={16} />} {p.local ? 'Local' : 'Nube'}
                </Pill>
              </div>
              <div style={{ display: 'flex', gap: 28, fontFamily: fonts.mono, fontSize: 22, color: colors.muted }}>
                <span>
                  <b style={{ color: colors.text }}>{(p.hours * ease(frame, [24, 90], [0, 1])).toFixed(1)}</b> h
                </span>
                <span>
                  <b style={{ color: colors.text }}>{p.tasks}</b> tareas
                </span>
              </div>
              <div style={{ height: 10, borderRadius: 10, background: colors.surfaceLow }}>
                <div style={{ height: '100%', width: `${bar * 100}%`, borderRadius: 10, background: p.color }} />
              </div>
            </Card>
          );
        })}
      </AppWindow>
    </FeatureScene>
  );
};
