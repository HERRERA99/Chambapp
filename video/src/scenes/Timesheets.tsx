import { ArrowRight, Clock3, LogIn, LogOut } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { ease, enter, fadeUp } from '../components/anim';
import { AppWindow, Card, FeatureScene, Gradient, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

const week = [
  { day: 'L', worked: 8.2, imputed: 8.0 },
  { day: 'M', worked: 7.9, imputed: 7.5 },
  { day: 'X', worked: 8.5, imputed: 8.25 },
  { day: 'J', worked: 8.1, imputed: 7.75 },
  { day: 'V', worked: 6.6, imputed: 6.5 },
];
const MAX = 9;

export const Timesheets: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const percent = ease(frame, [60, 150], [0, 96.4]);
  const rounded = frame > 120;

  return (
    <FeatureScene
      index="03"
      kicker="PARTES DE HORAS"
      icon={Clock3}
      title={
        <>
          Tu jornada,
          <br />
          <Gradient>bien imputada.</Gradient>
        </>
      }
      description="Fichajes exactos, partes con tu redondeo y el balance de cada semana."
    >
      <AppWindow title="Chambapp / Mi semana" style={{ width: '100%', opacity: enter(frame, fps, 2) }}>
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { icon: LogIn, label: 'Entrada', value: '08:58:12', tone: colors.success, d: 8 },
            { icon: LogOut, label: 'Salida', value: '17:32:40', tone: colors.accentSoft, d: 16 },
          ].map((it) => {
            const Icon = it.icon;
            return (
              <Card key={it.label} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 18, ...fadeUp(frame, fps, it.d, 24) }}>
                <Icon size={34} color={it.tone} />
                <div>
                  <div style={{ fontFamily: fonts.body, fontSize: 20, color: colors.dim }}>{it.label}</div>
                  <div style={{ fontFamily: fonts.mono, fontSize: 36, fontWeight: 600, color: colors.text }}>{it.value}</div>
                </div>
              </Card>
            );
          })}
          <Card style={{ flex: 1, ...fadeUp(frame, fps, 24, 24) }}>
            <div style={{ fontFamily: fonts.body, fontSize: 20, color: colors.dim }}>% imputado</div>
            <div style={{ fontFamily: fonts.mono, fontSize: 52, fontWeight: 600, color: colors.accent }}>
              {percent.toFixed(1).replace('.', ',')}%
            </div>
          </Card>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 34, height: 260, marginTop: 34, padding: '0 10px' }}>
          {week.map((d, i) => {
            const g = ease(frame, [30 + i * 6, 80 + i * 6], [0, 1]);
            return (
              <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 220 }}>
                  <div style={{ width: 34, height: (d.worked / MAX) * 220 * g, borderRadius: 8, background: '#4a4450' }} />
                  <div
                    style={{
                      width: 34,
                      height: (d.imputed / MAX) * 220 * g,
                      borderRadius: 8,
                      background: `linear-gradient(180deg, ${colors.accent}, ${colors.accentDeep})`,
                    }}
                  />
                </div>
                <span style={{ fontFamily: fonts.mono, fontSize: 22, color: colors.muted }}>{d.day}</span>
              </div>
            );
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 24 }}>
          <div style={{ display: 'flex', gap: 22, fontFamily: fonts.body, fontSize: 20, color: colors.muted }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i style={{ width: 14, height: 14, borderRadius: 4, background: '#4a4450' }} /> Fichado
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <i style={{ width: 14, height: 14, borderRadius: 4, background: colors.accent }} /> Imputado
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...fadeUp(frame, fps, 100, 20) }}>
            <Pill style={{ fontSize: 22 }}>4 h 08 min</Pill>
            <ArrowRight size={24} color={colors.dim} />
            <Pill tone="accent" style={{ fontSize: 22, scale: rounded ? String(1 + 0.08 * (1 - enter(frame, fps, 120))) : '1' }}>
              4 h 15 min
            </Pill>
            <span style={{ fontFamily: fonts.mono, fontSize: 18, color: colors.dim }}>redondeo 15'</span>
          </div>
        </div>
      </AppWindow>
    </FeatureScene>
  );
};
