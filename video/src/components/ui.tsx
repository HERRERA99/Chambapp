import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts, gradientText } from '../theme';
import { enter, fadeUp, lerp } from './anim';

/** Fondo vivo: rejilla tenue y dos halos de acento que derivan despacio. */
export const Background: React.FC = () => {
  const frame = useCurrentFrame();
  const t = frame / 30;
  return (
    <AbsoluteFill style={{ backgroundColor: colors.bg, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage: `linear-gradient(${colors.borderSubtle} 1px, transparent 1px), linear-gradient(90deg, ${colors.borderSubtle} 1px, transparent 1px)`,
          backgroundSize: '80px 80px',
          backgroundPosition: `${-t * 6}px ${-t * 6}px`,
          opacity: 0.35,
          maskImage: 'radial-gradient(ellipse at 50% 40%, black 20%, transparent 75%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1100,
          height: 1100,
          borderRadius: '50%',
          left: 1100 + Math.sin(t / 5) * 120,
          top: -420 + Math.cos(t / 6) * 80,
          background: 'radial-gradient(circle, rgba(255,46,86,0.22) 0%, rgba(255,46,86,0) 65%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          borderRadius: '50%',
          left: -380 + Math.cos(t / 7) * 100,
          top: 520 + Math.sin(t / 4) * 60,
          background: 'radial-gradient(circle, rgba(204,0,60,0.16) 0%, rgba(204,0,60,0) 65%)',
        }}
      />
    </AbsoluteFill>
  );
};

/** Logo de Chambapp: el anillo del reloj se dibuja y la aguja gira. */
export const LogoMark: React.FC<{ size: number; progress?: number; spin?: number }> = ({
  size,
  progress = 1,
  spin = 0,
}) => (
  <svg width={size} height={size} viewBox="2 4 32 32" fill="none">
    <rect x="2.75" y="4.75" width="30.5" height="30.5" rx="8" fill="#18181b" stroke="#27272a" strokeWidth="1.5" />
    <circle
      cx="18"
      cy="20"
      r="10"
      stroke={colors.accent}
      strokeWidth="2.5"
      strokeDasharray={`${45 * progress} ${15 + 45 * (1 - progress)}`}
    />
    <circle cx="18" cy="20" r={4 * progress} fill={colors.accent} />
    <path
      d="M18 13V20L22 22"
      stroke="#ffffff"
      strokeWidth="2"
      strokeLinecap="round"
      transform={`rotate(${spin} 18 20)`}
      opacity={progress}
    />
  </svg>
);

export const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <span
    style={{
      fontFamily: fonts.heading,
      fontWeight: 700,
      fontSize: size,
      letterSpacing: '-0.025em',
      color: '#ffffff',
    }}
  >
    Chambapp
  </span>
);

export const Kicker: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 14,
      border: '1px solid rgba(255, 153, 181, 0.22)',
      background: 'rgba(255, 46, 86, 0.07)',
      borderRadius: 40,
      padding: '12px 22px',
      fontFamily: fonts.mono,
      fontSize: 22,
      letterSpacing: '0.14em',
      color: colors.accentSoft,
      ...style,
    }}
  >
    <span
      style={{
        width: 10,
        height: 10,
        borderRadius: '50%',
        background: colors.accent,
        boxShadow: `0 0 14px ${colors.accent}`,
      }}
    />
    {children}
  </div>
);

export const Gradient: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={gradientText}>{children}</span>
);

export const Pill: React.FC<{
  children: React.ReactNode;
  tone?: 'accent' | 'success' | 'info' | 'warning' | 'muted';
  style?: React.CSSProperties;
}> = ({ children, tone = 'muted', style }) => {
  const tones = {
    accent: [colors.accentSoft, 'rgba(255,46,86,0.12)', 'rgba(255,46,86,0.35)'],
    success: [colors.success, 'rgba(136,203,178,0.1)', 'rgba(136,203,178,0.35)'],
    info: [colors.info, 'rgba(143,184,255,0.1)', 'rgba(143,184,255,0.35)'],
    warning: [colors.warning, 'rgba(236,182,124,0.1)', 'rgba(236,182,124,0.35)'],
    muted: [colors.muted, 'rgba(255,255,255,0.04)', colors.border],
  } as const;
  const [fg, bg, border] = tones[tone];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        borderRadius: 30,
        fontFamily: fonts.mono,
        fontSize: 18,
        color: fg,
        background: bg,
        border: `1px solid ${border}`,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

/** Ventana de la app con barra superior, como la vista previa del landing. */
export const AppWindow: React.FC<{
  title: string;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bodyStyle?: React.CSSProperties;
}> = ({ title, children, style, bodyStyle }) => (
  <div
    style={{
      background: 'rgba(27, 27, 30, 0.92)',
      border: `1px solid ${colors.border}`,
      borderRadius: 22,
      boxShadow: '0 40px 120px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.02) inset',
      overflow: 'hidden',
      ...style,
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 18,
        padding: '18px 24px',
        borderBottom: `1px solid ${colors.borderSubtle}`,
        background: colors.surfaceLow,
      }}
    >
      <div style={{ display: 'flex', gap: 9 }}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <i key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c, opacity: 0.8 }} />
        ))}
      </div>
      <span style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.dim }}>{title}</span>
    </div>
    <div style={{ padding: 30, ...bodyStyle }}>{children}</div>
  </div>
);

export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      background: colors.surfaceRaised,
      border: `1px solid ${colors.border}`,
      borderRadius: 16,
      padding: 22,
      ...style,
    }}
  >
    {children}
  </div>
);

/**
 * Plantilla de las escenas de funcionalidad: texto a la izquierda y la
 * maqueta animada de la app a la derecha. Deja libre la franja inferior
 * para los subtítulos.
 */
export const FeatureScene: React.FC<{
  index: string;
  kicker: string;
  icon: LucideIcon;
  title: React.ReactNode;
  description: string;
  children: React.ReactNode;
  textWidth?: number;
}> = ({ index, kicker, icon: IconCmp, title, description, children, textWidth = 640 }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const out = lerp(frame, [durationInFrames - 12, durationInFrames], [1, 0.0]);
  const iconIn = enter(frame, fps, 4);
  return (
    <AbsoluteFill style={{ padding: '120px 120px 230px', flexDirection: 'row', gap: 80, alignItems: 'center' }}>
      <div style={{ width: textWidth, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 34, opacity: out }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, ...fadeUp(frame, fps, 0, 20) }}>
          <div
            style={{
              width: 76,
              height: 76,
              borderRadius: 20,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(140deg, rgba(255,46,86,0.25), rgba(255,46,86,0.05))',
              border: '1px solid rgba(255,46,86,0.35)',
              scale: String(0.6 + 0.4 * iconIn),
              rotate: `${(1 - iconIn) * -25}deg`,
            }}
          >
            <IconCmp size={38} color={colors.accentSoft} strokeWidth={1.8} />
          </div>
          <Kicker>
            {index} · {kicker}
          </Kicker>
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 92,
            lineHeight: 1.0,
            letterSpacing: '-0.035em',
            color: colors.text,
            ...fadeUp(frame, fps, 6, 50),
          }}
        >
          {title}
        </h1>
        <p
          style={{
            margin: 0,
            fontFamily: fonts.body,
            fontSize: 34,
            lineHeight: 1.4,
            color: colors.muted,
            ...fadeUp(frame, fps, 12, 30),
          }}
        >
          {description}
        </p>
      </div>
      <div style={{ flex: 1, height: '100%', position: 'relative', display: 'flex', alignItems: 'center' }}>
        {children}
      </div>
    </AbsoluteFill>
  );
};
