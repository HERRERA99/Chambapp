import type { Caption } from '@remotion/captions';
import React, { useMemo } from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { colors, fonts } from '../theme';

type Page = { tokens: Caption[]; startMs: number; endMs: number };

const MAX_WORDS = 7;

// Agrupa las palabras en frases cortas: corta en puntos siempre y en comas
// o dos puntos cuando la frase ya tiene cierta longitud.
const toPages = (captions: Caption[]): Page[] => {
  const pages: Page[] = [];
  let current: Caption[] = [];
  const flush = () => {
    if (!current.length) return;
    pages.push({ tokens: current, startMs: current[0].startMs, endMs: current[current.length - 1].endMs });
    current = [];
  };
  for (const token of captions) {
    current.push(token);
    const t = token.text.trim();
    if (/[.!?]$/.test(t) || (/[,:;]$/.test(t) && current.length >= 3) || current.length >= MAX_WORDS) flush();
  }
  flush();
  return pages;
};

/** Subtítulos con la palabra que suena resaltada en el acento de la app. */
export const Captions: React.FC<{ captions: Caption[]; bottom?: number }> = ({ captions, bottom = 64 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pages = useMemo(() => toPages(captions), [captions]);
  const nowMs = (frame / fps) * 1000;

  const index = pages.findIndex((p, i) => {
    const next = pages[i + 1];
    const until = next ? next.startMs : p.endMs + 700;
    return nowMs >= p.startMs - 80 && nowMs < until;
  });
  const page = pages[index];
  if (!page) return null;

  const sinceStart = nowMs - page.startMs;
  const pop = Math.min(1, Math.max(0, (sinceStart + 80) / 160));

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom,
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: 1380,
          padding: '16px 30px',
          borderRadius: 16,
          background: 'rgba(14, 14, 17, 0.78)',
          border: `1px solid ${colors.border}`,
          boxShadow: '0 20px 60px rgba(0,0,0,0.45)',
          fontFamily: fonts.body,
          fontSize: 46,
          fontWeight: 500,
          lineHeight: 1.25,
          color: colors.text,
          textAlign: 'center',
          whiteSpace: 'pre-wrap',
          opacity: pop,
          translate: `0px ${(1 - pop) * 10}px`,
        }}
      >
        {page.tokens.map((token, i) => {
          const active = nowMs >= token.startMs && nowMs < token.endMs + 60;
          const spoken = nowMs >= token.startMs;
          return (
            <span
              key={`${token.startMs}-${i}`}
              style={{
                color: active ? colors.accentSoft : spoken ? colors.text : colors.dim,
                textShadow: active ? '0 0 24px rgba(255, 46, 86, 0.55)' : undefined,
              }}
            >
              {i === 0 ? token.text.trimStart() : token.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** Momento (ms) en que se pronuncia por primera vez una palabra del guion. */
export const wordAt = (captions: Caption[], word: string, fallbackMs = 0) => {
  const norm = (w: string) =>
    w
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/g, '');
  const hit = captions.find((c) => norm(c.text) === norm(word));
  return hit ? hit.startMs : fallbackMs;
};
