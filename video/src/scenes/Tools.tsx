import type { Caption } from '@remotion/captions';
import { Calculator, CodeXml, Dices, Percent, Wrench } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { wordAt } from '../components/Captions';
import { ease, enter } from '../components/anim';
import { FeatureScene, Gradient } from '../components/ui';
import { colors, fonts } from '../theme';

type Props = { captions: Caption[]; audioDelay: number };

// DNI ficticios válidos (letra de control correcta) para la demo.
const dnis = ['48213957T', '70145882E', '12893465X', '39571046Y'];

const Tile: React.FC<{ icon: LucideIcon; title: string; on: number; delay: number; children: React.ReactNode }> = ({
  icon: Icon,
  title,
  on,
  delay,
  children,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pIn = enter(frame, fps, delay, 16);
  const lit = ease(frame, [on, on + 10], [0, 1]);
  return (
    <div
      style={{
        background: colors.surface,
        border: `1px solid ${lit > 0.5 ? 'rgba(255,46,86,0.55)' : colors.border}`,
        borderRadius: 22,
        padding: 30,
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        opacity: pIn,
        scale: String(0.9 + 0.1 * pIn + 0.03 * lit),
        boxShadow: `0 0 ${lit * 50}px rgba(255,46,86,${lit * 0.22}), 0 30px 80px rgba(0,0,0,0.4)`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            display: 'grid',
            placeItems: 'center',
            background: lit > 0.5 ? colors.accent : 'rgba(255,46,86,0.12)',
          }}
        >
          <Icon size={30} color={lit > 0.5 ? '#fff' : colors.accentSoft} />
        </div>
        <span style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 30, color: colors.text }}>{title}</span>
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 30, color: colors.muted }}>{children}</div>
    </div>
  );
};

export const Tools: React.FC<Props> = ({ captions, audioDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = (word: string, fallback: number) => audioDelay + Math.round((wordAt(captions, word, fallback) / 1000) * fps);
  const tCalc = at('calculadora', 2300);
  const tPct = at('porcentajes', 3400);
  const tFake = at('ficticios', 4800);
  const tDev = at('utilidades', 6000);
  const pct = ease(frame, [tPct, tPct + 30], [0, 56]);
  const dni = dnis[Math.max(0, Math.floor((frame - tFake) / 9)) % dnis.length];

  return (
    <FeatureScene
      index="07"
      kicker="HERRAMIENTAS ÚTILES"
      icon={Wrench}
      title={
        <>
          Lo que usas
          <br />
          <Gradient>cada día.</Gradient>
        </>
      }
      description="Pequeñas utilidades que te ahorran abrir otra pestaña."
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 26, width: '100%' }}>
        <Tile icon={Calculator} title="Calculadora de horas" on={tCalc} delay={6}>
          08:30 − 01:15 = <b style={{ color: colors.accentSoft }}>07:15</b>
        </Tile>
        <Tile icon={Percent} title="Porcentajes" on={tPct} delay={12}>
          35 % de 160 h = <b style={{ color: colors.accentSoft }}>{pct.toFixed(0)} h</b>
        </Tile>
        <Tile icon={Dices} title="Datos ficticios" on={tFake} delay={18}>
          DNI <b style={{ color: frame >= tFake ? colors.accentSoft : colors.muted }}>{frame >= tFake ? dni : '—'}</b>
        </Tile>
        <Tile icon={CodeXml} title="Utilidades de desarrollo" on={tDev} delay={24}>
          {frame >= tDev + 6 ? (
            <span>
              {'{ '}
              <span style={{ color: colors.info }}>"ok"</span>: <span style={{ color: colors.success }}>true</span>
              {' }'}
            </span>
          ) : (
            <span>{'{"ok":true}'}</span>
          )}
        </Tile>
      </div>
    </FeatureScene>
  );
};
