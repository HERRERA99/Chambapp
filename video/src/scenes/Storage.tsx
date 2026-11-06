import type { Caption } from '@remotion/captions';
import { ArrowLeftRight, Cloud, HardDrive, Laptop, Lock, Smartphone, Tablet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { wordAt } from '../components/Captions';
import { ease, enter, fadeUp, lerp } from '../components/anim';
import { Gradient, Kicker, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

type Props = { captions: Caption[]; audioDelay: number };

const Option: React.FC<{
  icon: LucideIcon;
  label: string;
  tagline: string;
  points: string[];
  on: number;
  tone: string;
  children: React.ReactNode;
}> = ({ icon: Icon, label, tagline, points, on, tone, children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pIn = enter(frame, fps, 10, 18);
  const lit = enter(frame, fps, on, 15);
  const active = frame >= on;
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 28,
        padding: 40,
        background: active ? 'linear-gradient(170deg, rgba(255,46,86,0.13), rgba(27,27,30,0.95) 55%)' : 'rgba(27,27,30,0.85)',
        border: `1.5px solid ${active ? 'rgba(255,46,86,0.6)' : colors.border}`,
        boxShadow: active ? `0 0 ${70 * lit}px rgba(255,46,86,0.25), 0 40px 100px rgba(0,0,0,0.5)` : '0 30px 80px rgba(0,0,0,0.4)',
        opacity: pIn * (0.45 + 0.55 * lit),
        translate: `0px ${(1 - pIn) * 60 - lit * 14}px`,
        display: 'flex',
        flexDirection: 'column',
        gap: 24,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <div
          style={{
            width: 96,
            height: 96,
            borderRadius: 26,
            display: 'grid',
            placeItems: 'center',
            background: active ? colors.accent : 'rgba(255,255,255,0.05)',
            scale: String(1 + 0.15 * Math.sin(lit * Math.PI)),
          }}
        >
          <Icon size={52} color={active ? '#fff' : tone} strokeWidth={1.8} />
        </div>
        <div>
          <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 56, letterSpacing: '-0.03em', color: colors.text }}>{label}</div>
          <div style={{ fontFamily: fonts.body, fontSize: 26, color: active ? colors.accentSoft : colors.dim }}>{tagline}</div>
        </div>
      </div>
      <div style={{ height: 150, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {points.map((p, i) => (
          <div
            key={p}
            style={{
              fontFamily: fonts.body,
              fontSize: 27,
              color: colors.muted,
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              ...fadeUp(frame, fps, on + 6 + i * 5, 14),
            }}
          >
            <span style={{ color: colors.accent }}>●</span> {p}
          </div>
        ))}
      </div>
    </div>
  );
};

export const Storage: React.FC<Props> = ({ captions, audioDelay }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const at = (word: string, fallback: number) => audioDelay + Math.round((wordAt(captions, word, fallback) / 1000) * fps);
  const tCloud = at('nube,', 3600);
  const tLocal = at('local,', 7600);
  const tMix = at('combinado:', 11800);
  const tMove = at('moviendo', 14500);
  const out = lerp(frame, [durationInFrames - 12, durationInFrames], [1, 0]);

  // Un proyecto que viaja entre nube y navegador en la opción combinada.
  const swing = frame < tMove ? 0 : (1 - Math.cos(((frame - tMove) / 40) * Math.PI)) / 2;
  const device = Math.floor(lerp(frame, [tCloud, tCloud + 60], [0, 2.99]));
  const devices = [Laptop, Smartphone, Tablet];

  return (
    <AbsoluteFill style={{ padding: '90px 110px 230px', gap: 44, opacity: out }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={fadeUp(frame, fps, 0, 20)}>
            <Kicker>08 · TÚ DECIDES DÓNDE VIVEN TUS DATOS</Kicker>
          </div>
          <h1
            style={{
              margin: 0,
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 96,
              lineHeight: 1,
              letterSpacing: '-0.04em',
              color: colors.text,
              ...fadeUp(frame, fps, 4, 40),
            }}
          >
            Nube, local <Gradient>o las dos.</Gradient>
          </h1>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 34, flex: 1 }}>
        <Option
          icon={Cloud}
          label="En la nube"
          tagline="Siempre contigo"
          points={['En cualquier dispositivo', 'Sincronizado al momento']}
          on={tCloud}
          tone={colors.success}
        >
          <div style={{ display: 'flex', gap: 30 }}>
            {devices.map((D, i) => (
              <D
                key={i}
                size={78}
                strokeWidth={1.5}
                color={frame >= tCloud && i <= device ? colors.accentSoft : colors.border}
              />
            ))}
          </div>
        </Option>

        <Option
          icon={HardDrive}
          label="En local"
          tagline="Nunca sale de tu equipo"
          points={['Cifrado en tu navegador', 'Ideal si tu empresa lo exige']}
          on={tLocal}
          tone={colors.info}
        >
          <div style={{ position: 'relative' }}>
            <Laptop size={130} strokeWidth={1.3} color={frame >= tLocal ? colors.accentSoft : colors.border} />
            <div
              style={{
                position: 'absolute',
                left: 44,
                top: 26,
                scale: String(enter(frame, fps, tLocal + 8, 12)),
              }}
            >
              <Lock size={42} color={colors.accent} strokeWidth={2.4} />
            </div>
          </div>
        </Option>

        <Option
          icon={ArrowLeftRight}
          label="Combinado"
          tagline="Lo mejor de los dos"
          points={['Cada proyecto, donde quieras', 'Muévelo cuando lo necesites']}
          on={tMix}
          tone={colors.warning}
        >
          <div style={{ position: 'relative', width: 400, height: 140 }}>
            <Cloud size={84} strokeWidth={1.5} color={frame >= tMix ? colors.success : colors.border} style={{ position: 'absolute', left: 0, top: 0 }} />
            <HardDrive size={84} strokeWidth={1.5} color={frame >= tMix ? colors.info : colors.border} style={{ position: 'absolute', right: 0, top: 0 }} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                top: 32,
                height: 2,
                margin: '0 100px',
                background: `repeating-linear-gradient(90deg, ${colors.border} 0 10px, transparent 10px 18px)`,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: 100,
                left: lerp(swing, [0, 1], [0, 220]),
                opacity: ease(frame, [tMix, tMix + 10], [0, 1]),
              }}
            >
              <Pill tone={swing > 0.5 ? 'info' : 'success'} style={{ fontSize: 20 }}>
                Estudio Norte · {swing > 0.5 ? 'Local' : 'Nube'}
              </Pill>
            </div>
          </div>
        </Option>
      </div>
    </AbsoluteFill>
  );
};
