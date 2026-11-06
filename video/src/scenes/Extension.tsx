import type { Caption } from '@remotion/captions';
import { Check, Download, KeyRound, Puzzle, Send } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { wordAt } from '../components/Captions';
import { enter, fadeUp } from '../components/anim';
import { FeatureScene, Gradient, LogoMark, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

type Props = { captions: Caption[]; audioDelay: number };

export const Extension: React.FC<Props> = ({ captions, audioDelay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const at = (word: string, fallback: number) => audioDelay + Math.round((wordAt(captions, word, fallback) / 1000) * fps);

  const actions = [
    { icon: Download, label: 'Importar tarea T443212', done: 'Tarea importada', at: at('importas', 2800) },
    { icon: Send, label: 'Enviar parte semanal · 5 partes', done: 'Enviado a Odoo', at: at('envías', 4200) },
    { icon: KeyRound, label: 'Rellenar acceso', done: 'Acceso rellenado', at: at('rellenas', 6300) },
  ];
  const popup = enter(frame, fps, 14, 16);
  const filled = frame >= actions[2].at + 8;

  return (
    <FeatureScene
      index="06"
      kicker="EXTENSIÓN DE NAVEGADOR"
      icon={Puzzle}
      title={
        <>
          Tu navegador,
          <br />
          <Gradient>a un clic.</Gradient>
        </>
      }
      description="Importa tareas de Odoo, envía tus partes y rellena tus accesos."
    >
      <div style={{ position: 'relative', width: '100%', height: 640 }}>
        {/* Navegador con una tarea de Odoo */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 22,
            background: '#f4f2f5',
            overflow: 'hidden',
            boxShadow: '0 40px 120px rgba(0,0,0,0.55)',
            ...fadeUp(frame, fps, 0, 30),
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 20px', background: '#e3e0e6' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
                <i key={c} style={{ width: 13, height: 13, borderRadius: '50%', background: c }} />
              ))}
            </div>
            <div
              style={{
                flex: 1,
                background: '#fff',
                borderRadius: 20,
                padding: '8px 18px',
                fontFamily: fonts.mono,
                fontSize: 18,
                color: '#55505a',
              }}
            >
              odoo.empresa.com/odoo/project/tasks/443212
            </div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                display: 'grid',
                placeItems: 'center',
                background: popup > 0.1 ? '#d2cdd6' : 'transparent',
              }}
            >
              <LogoMark size={30} />
            </div>
          </div>
          <div style={{ padding: 34, fontFamily: fonts.body, color: '#2a262d' }}>
            <div style={{ fontSize: 18, color: '#7c6f80', letterSpacing: '0.08em' }}>PROYECTO · ESTUDIO NORTE</div>
            <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 38, marginTop: 8 }}>Preparar la propuesta de diseño</div>
            <div style={{ display: 'flex', gap: 12, marginTop: 18 }}>
              {['En curso', 'Prioridad alta', 'T443212'].map((t) => (
                <span key={t} style={{ fontSize: 18, padding: '6px 14px', borderRadius: 20, background: '#e9e2ec', color: '#714b67' }}>
                  {t}
                </span>
              ))}
            </div>
            <div style={{ marginTop: 34, display: 'flex', flexDirection: 'column', gap: 14, width: 470 }}>
              {['Usuario', 'Contraseña'].map((f, i) => (
                <div key={f}>
                  <div style={{ fontSize: 17, color: '#7c6f80', marginBottom: 6 }}>{f}</div>
                  <div
                    style={{
                      height: 52,
                      borderRadius: 10,
                      background: filled ? '#fff7d6' : '#fff',
                      border: '1px solid #d8d2dc',
                      padding: '0 16px',
                      display: 'flex',
                      alignItems: 'center',
                      fontFamily: fonts.mono,
                      fontSize: 20,
                      color: '#2a262d',
                    }}
                  >
                    {filled ? (i === 0 ? 'ana.garcia' : '•••••••••••') : ''}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Ventana emergente de la extensión */}
        <div
          style={{
            position: 'absolute',
            right: 26,
            top: 70,
            width: 470,
            borderRadius: 20,
            background: colors.surface,
            border: `1px solid ${colors.border}`,
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
            padding: 24,
            opacity: popup,
            translate: `0px ${(1 - popup) * -30}px`,
            scale: String(0.92 + 0.08 * popup),
            transformOrigin: 'top right',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <LogoMark size={40} />
            <span style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 26, color: colors.text }}>Chambapp</span>
            <Pill tone="success" style={{ marginLeft: 'auto', fontSize: 15 }}>
              ● Conectada
            </Pill>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {actions.map((a) => {
              const Icon = a.icon;
              const done = frame >= a.at + 8;
              const press = frame >= a.at && frame < a.at + 8;
              return (
                <div
                  key={a.label}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 14,
                    padding: '16px 18px',
                    borderRadius: 14,
                    background: done ? 'rgba(136,203,178,0.1)' : press ? 'rgba(255,46,86,0.25)' : colors.surfaceRaised,
                    border: `1px solid ${done ? 'rgba(136,203,178,0.45)' : press ? colors.accent : colors.border}`,
                    scale: press ? '0.97' : '1',
                    fontFamily: fonts.body,
                    fontSize: 22,
                    fontWeight: 500,
                    color: done ? colors.success : colors.text,
                  }}
                >
                  {done ? <Check size={24} strokeWidth={3} /> : <Icon size={24} color={colors.accentSoft} />}
                  {done ? a.done : a.label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ position: 'absolute', left: 0, bottom: -64, display: 'flex', gap: 12 }}>
          {['Chrome', 'Edge', 'Firefox'].map((b, i) => (
            <Pill key={b} style={{ fontSize: 20, ...fadeUp(frame, fps, 30 + i * 5, 12) }}>
              {b}
            </Pill>
          ))}
        </div>
      </div>
    </FeatureScene>
  );
};
