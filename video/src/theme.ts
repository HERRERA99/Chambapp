import { loadFont as loadGeist } from '@remotion/google-fonts/Geist';
import { loadFont as loadMono } from '@remotion/google-fonts/JetBrainsMono';
import { loadFont as loadGrotesk } from '@remotion/google-fonts/SpaceGrotesk';

// Mismos tokens que la app (src/styles/tokens.css).
export const colors = {
  bg: '#131316',
  surface: '#1b1b1e',
  surfaceRaised: '#252529',
  surfaceLow: '#0e0e11',
  text: '#e4e1e6',
  muted: '#aaa3aa',
  dim: '#8b858e',
  border: '#353038',
  borderSubtle: '#28252c',
  accent: '#ff2e56',
  accentSoft: '#ffb3b6',
  accentDeep: '#cc003c',
  success: '#88cbb2',
  warning: '#ecb67c',
  info: '#8fb8ff',
} as const;

export const fonts = {
  heading: loadGrotesk('normal', { weights: ['500', '700'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  body: loadGeist('normal', { weights: ['400', '500', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily,
  mono: loadMono('normal', { weights: ['400', '600'], subsets: ['latin', 'latin-ext'] }).fontFamily,
};

export const gradientText = {
  background: 'linear-gradient(100deg, #ff557d 5%, #ffb2c8 90%)',
  backgroundClip: 'text',
  WebkitBackgroundClip: 'text',
  color: 'transparent',
} as const;
