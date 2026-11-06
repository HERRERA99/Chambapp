import { CalendarRange, Clock3, FolderKanban, KeyRound, ListChecks, NotebookPen } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, enter, fadeUp, lerp } from '../components/anim';
import { Gradient, LogoMark, Pill, Wordmark } from '../components/ui';
import { colors, fonts } from '../theme';

const chips = [
  { icon: FolderKanban, label: 'Proyectos' },
  { icon: ListChecks, label: 'Tareas' },
  { icon: Clock3, label: 'Partes de horas' },
  { icon: CalendarRange, label: 'Tu semana' },
  { icon: NotebookPen, label: 'Notas' },
  { icon: KeyRound, label: 'Contraseñas' },
];

export const Intro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const draw = ease(frame, [0, 34], [0, 1]);
  const logoScale = enter(frame, fps, 0, 14);
  const lift = ease(frame, [30, 60], [0, 1]);
  const out = lerp(frame, [durationInFrames - 12, durationInFrames], [1, 0]);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 140, opacity: out }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 30,
          translate: `0px ${-lift * 30}px`,
          scale: String(0.7 + 0.3 * logoScale),
        }}
      >
        <LogoMark size={150} progress={draw} spin={lerp(frame, [0, 40], [-200, 0])} />
        <div style={{ overflow: 'hidden' }}>
          <div style={{ translate: `${(1 - ease(frame, [14, 44], [0, 1])) * -110}% 0px` }}>
            <Wordmark size={130} />
          </div>
        </div>
      </div>

      <h1
        style={{
          margin: '46px 0 0',
          fontFamily: fonts.heading,
          fontSize: 110,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          color: colors.text,
          textAlign: 'center',
          display: 'flex',
          gap: 32,
        }}
      >
        <span style={fadeUp(frame, fps, 44, 50)}>Cada minuto.</span>
        <span style={fadeUp(frame, fps, 54, 50)}>
          <Gradient>En su sitio.</Gradient>
        </span>
      </h1>

      <div style={{ display: 'flex', gap: 18, marginTop: 60 }}>
        {chips.map((chip, i) => {
          const Icon = chip.icon;
          return (
            <Pill key={chip.label} style={{ fontSize: 24, padding: '12px 22px', ...fadeUp(frame, fps, 70 + i * 6, 24) }}>
              <Icon size={24} color={colors.accentSoft} /> {chip.label}
            </Pill>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
