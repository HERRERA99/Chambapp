import { Check, FolderKanban, ListChecks, NotebookPen } from 'lucide-react';
import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { enter, fadeUp, lerp } from '../components/anim';
import { AppWindow, FeatureScene, Gradient, Pill } from '../components/ui';
import { colors, fonts } from '../theme';

const source = `# Reunión con Estudio Norte

- [x] Revisar la propuesta
- [ ] Enviar presupuesto
- [ ] Preparar **demo**

> Entrega el viernes`;

type Line = { kind: 'h1' | 'done' | 'todo' | 'quote' | 'blank'; text: string };
const parse = (md: string): Line[] =>
  md.split('\n').map((l) => {
    if (l.startsWith('# ')) return { kind: 'h1', text: l.slice(2) };
    if (l.startsWith('- [x] ')) return { kind: 'done', text: l.slice(6) };
    if (l.startsWith('- [ ] ')) return { kind: 'todo', text: l.slice(6) };
    if (l.startsWith('> ')) return { kind: 'quote', text: l.slice(2) };
    return { kind: 'blank', text: l };
  });

const Rich: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\*\*[^*]*\*\*?)/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <b key={i} style={{ color: colors.accentSoft }}>
            {p.replace(/\*/g, '')}
          </b>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
};

export const Notes: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chars = Math.floor(lerp(frame, [10, 110], [0, source.length]));
  const typed = source.slice(0, chars);
  const caret = Math.floor(frame / 8) % 2 === 0;

  return (
    <FeatureScene
      index="05"
      kicker="NOTAS"
      icon={NotebookPen}
      title={
        <>
          Ideas claras,
          <br />
          <Gradient>en Markdown.</Gradient>
        </>
      }
      description="Edición y vista previa a la vez, asociadas a proyectos y tareas."
    >
      <AppWindow
        title="Chambapp / Notas"
        style={{ width: '100%', opacity: enter(frame, fps, 2) }}
        bodyStyle={{ display: 'flex', flexDirection: 'column', gap: 22 }}
      >
        <div style={{ display: 'flex', gap: 22, height: 420 }}>
          <div
            style={{
              flex: 1,
              background: colors.surfaceLow,
              borderRadius: 16,
              border: `1px solid ${colors.border}`,
              padding: 26,
              fontFamily: fonts.mono,
              fontSize: 23,
              lineHeight: 1.6,
              color: colors.muted,
              whiteSpace: 'pre-wrap',
            }}
          >
            {typed}
            <span style={{ color: colors.accent, opacity: caret ? 1 : 0 }}>▍</span>
          </div>
          <div
            style={{
              flex: 1,
              background: colors.surfaceRaised,
              borderRadius: 16,
              border: `1px solid ${colors.border}`,
              padding: 26,
              fontFamily: fonts.body,
              color: colors.text,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            {parse(typed).map((l, i) => {
              if (l.kind === 'h1')
                return (
                  <div key={i} style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 32, lineHeight: 1.15 }}>
                    {l.text}
                  </div>
                );
              if (l.kind === 'done' || l.kind === 'todo')
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 25 }}>
                    <span
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        display: 'grid',
                        placeItems: 'center',
                        background: l.kind === 'done' ? colors.accent : 'transparent',
                        border: `2px solid ${l.kind === 'done' ? colors.accent : colors.border}`,
                      }}
                    >
                      {l.kind === 'done' ? <Check size={18} color="#fff" strokeWidth={3} /> : null}
                    </span>
                    <span style={{ textDecoration: l.kind === 'done' ? 'line-through' : 'none', color: l.kind === 'done' ? colors.dim : colors.text }}>
                      <Rich text={l.text} />
                    </span>
                  </div>
                );
              if (l.kind === 'quote')
                return (
                  <div key={i} style={{ borderLeft: `4px solid ${colors.accent}`, paddingLeft: 16, fontSize: 24, color: colors.muted, fontStyle: 'italic' }}>
                    {l.text}
                  </div>
                );
              return null;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontFamily: fonts.body, fontSize: 21, color: colors.dim }}>Asociada a</span>
          <Pill tone="accent" style={fadeUp(frame, fps, 110, 16)}>
            <FolderKanban size={17} /> Estudio Norte
          </Pill>
          <Pill tone="info" style={fadeUp(frame, fps, 118, 16)}>
            <ListChecks size={17} /> T443212 · Propuesta de diseño
          </Pill>
        </div>
      </AppWindow>
    </FeatureScene>
  );
};
