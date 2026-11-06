import { Copy, Eye, Globe2, KeyRound, Lock, LockOpen, ShieldCheck } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, fadeUp, lerp } from '../components/anim';
import { AppWindow, FeatureScene, Gradient, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

const creds = [
  { site: 'odoo.empresa.com', user: 'ana.garcia', secret: 'Tr4b@jo-2026!' },
  { site: 'gitlab.empresa.com', user: 'agarcia', secret: '' },
  { site: 'vpn.cliente.es', user: 'soporte-norte', secret: '' },
];

const UNLOCK = 40;
const REVEAL = 90;

export const Passwords: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const unlocked = frame >= UNLOCK;
  const unlock = enter(frame, fps, UNLOCK, 14);
  const blur = lerp(frame, [UNLOCK, UNLOCK + 20], [10, 0]);
  const shake = frame < UNLOCK ? Math.sin(frame * 1.4) * lerp(frame, [UNLOCK - 14, UNLOCK], [0, 4]) : 0;
  const revealed = Math.floor(lerp(frame, [REVEAL, REVEAL + 26], [0, creds[0].secret.length]));

  return (
    <FeatureScene
      index="04"
      kicker="USUARIOS Y CONTRASEÑAS"
      icon={KeyRound}
      title={
        <>
          Tus accesos,
          <br />
          <Gradient>bajo llave.</Gradient>
        </>
      }
      description="Una bóveda cifrada con tu clave maestra. Nadie más puede abrirla."
    >
      <AppWindow title="Chambapp / Contraseñas" style={{ width: '100%', opacity: enter(frame, fps, 2) }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 26 }}>
          <div
            style={{
              width: 92,
              height: 92,
              borderRadius: 24,
              display: 'grid',
              placeItems: 'center',
              background: unlocked ? 'rgba(136,203,178,0.12)' : 'rgba(255,46,86,0.12)',
              border: `1px solid ${unlocked ? 'rgba(136,203,178,0.45)' : 'rgba(255,46,86,0.45)'}`,
              translate: `${shake}px 0px`,
              scale: String(1 + 0.12 * Math.sin(unlock * Math.PI)),
            }}
          >
            {unlocked ? <LockOpen size={46} color={colors.success} /> : <Lock size={46} color={colors.accentSoft} />}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 34, color: colors.text }}>
              {unlocked ? 'Bóveda desbloqueada' : 'Introduce tu clave maestra'}
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: 24, color: colors.dim, marginTop: 6, letterSpacing: unlocked ? '0' : '0.2em' }}>
              {unlocked ? 'Se cifra en tu dispositivo' : '•'.repeat(Math.min(12, Math.floor(frame / 3)))}
            </div>
          </div>
          <Pill tone={unlocked ? 'success' : 'muted'}>
            <ShieldCheck size={18} /> AES-GCM
          </Pill>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, filter: `blur(${blur}px)`, opacity: unlocked ? 1 : 0.5 }}>
          {creds.map((c, i) => {
            const shown = i === 0 && frame >= REVEAL;
            const masked = shown ? c.secret.slice(0, revealed) + '•'.repeat(c.secret.length - revealed) : '••••••••••••';
            return (
              <div
                key={c.site}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 20,
                  padding: '18px 22px',
                  borderRadius: 16,
                  background: colors.surfaceRaised,
                  border: `1px solid ${shown ? 'rgba(255,46,86,0.45)' : colors.border}`,
                  ...fadeUp(frame, fps, UNLOCK + i * 6, 20),
                }}
              >
                <div style={{ width: 54, height: 54, borderRadius: 14, background: colors.surfaceLow, display: 'grid', placeItems: 'center' }}>
                  <Globe2 size={28} color={colors.muted} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 26, color: colors.text }}>{c.site}</div>
                  <div style={{ fontFamily: fonts.mono, fontSize: 20, color: colors.dim, marginTop: 4 }}>{c.user}</div>
                </div>
                <span style={{ fontFamily: fonts.mono, fontSize: 26, color: shown ? colors.accentSoft : colors.muted, minWidth: 250, textAlign: 'right' }}>
                  {masked}
                </span>
                <Eye size={26} color={shown ? colors.accentSoft : colors.dim} />
                <Copy size={24} color={colors.dim} />
              </div>
            );
          })}
        </div>
      </AppWindow>
    </FeatureScene>
  );
};
