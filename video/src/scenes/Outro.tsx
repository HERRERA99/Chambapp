import { ArrowRight, Cloud, HardDrive, Puzzle } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, enter, fadeUp } from '../components/anim';
import { Gradient, LogoMark, Pill, Wordmark } from '../components/ui';
import { colors, fonts } from '../theme';

export const Outro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = enter(frame, fps, 0, 14);
  const pulse = 1 + 0.025 * Math.sin(frame / 7);

  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', paddingBottom: 150 }}>
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,46,86,0.28), rgba(255,46,86,0) 65%)',
          opacity: ease(frame, [0, 40], [0, 1]),
          top: -40,
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 26, scale: String(0.6 + 0.4 * logo) }}>
        <LogoMark size={120} progress={ease(frame, [0, 30], [0, 1])} spin={ease(frame, [0, 40], [-360, 0])} />
        <Wordmark size={110} />
      </div>
      <h1
        style={{
          margin: '40px 0 0',
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: 104,
          letterSpacing: '-0.04em',
          color: colors.text,
          ...fadeUp(frame, fps, 30, 40),
        }}
      >
        Cada minuto, <Gradient>en su sitio.</Gradient>
      </h1>
      <div style={{ display: 'flex', gap: 16, marginTop: 34, ...fadeUp(frame, fps, 50, 20) }}>
        <Pill style={{ fontSize: 22, padding: '10px 20px' }}>
          <Cloud size={20} /> Nube
        </Pill>
        <Pill style={{ fontSize: 22, padding: '10px 20px' }}>
          <HardDrive size={20} /> Local
        </Pill>
        <Pill style={{ fontSize: 22, padding: '10px 20px' }}>
          <Puzzle size={20} /> Extensión
        </Pill>
      </div>
      <div
        style={{
          marginTop: 54,
          display: 'flex',
          alignItems: 'center',
          gap: 18,
          padding: '26px 48px',
          borderRadius: 18,
          background: `linear-gradient(135deg, ${colors.accent}, ${colors.accentDeep})`,
          boxShadow: '0 20px 60px rgba(255,46,86,0.45)',
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: 40,
          color: '#fff',
          scale: String(enter(frame, fps, 120, 12) * pulse),
          opacity: enter(frame, fps, 120),
        }}
      >
        Crea tu cuenta <ArrowRight size={40} />
      </div>
    </AbsoluteFill>
  );
};
