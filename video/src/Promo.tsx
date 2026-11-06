import type { Caption } from '@remotion/captions';
import { Audio } from '@remotion/media';
import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import React from 'react';
import { AbsoluteFill, interpolate, Sequence, staticFile, useVideoConfig } from 'remotion';
import { Captions } from './components/Captions';
import { Background } from './components/ui';
import captionsJson from './data/captions.json';
import durationsJson from './data/durations.json';
import { Extension } from './scenes/Extension';
import { Intro } from './scenes/Intro';
import { Notes } from './scenes/Notes';
import { Outro } from './scenes/Outro';
import { Passwords } from './scenes/Passwords';
import { Projects } from './scenes/Projects';
import { Storage } from './scenes/Storage';
import { Tasks } from './scenes/Tasks';
import { Timesheets } from './scenes/Timesheets';
import { Tools } from './scenes/Tools';

const captions = captionsJson as Record<string, Caption[]>;
const durations = durationsJson as Record<string, number>;

export const FPS = 30;
/** La voz entra cuando ya ha terminado la transición de entrada. */
export const AUDIO_DELAY = 14;
export const TRANSITION = 16;
const TAIL = 22;

export const sceneIds = [
  '01-intro',
  '02-proyectos',
  '03-tareas',
  '04-partes',
  '05-contrasenas',
  '06-notas',
  '07-extension',
  '08-herramientas',
  '09-almacenamiento',
  '10-cierre',
] as const;
type SceneId = (typeof sceneIds)[number];

const extraTail: Partial<Record<SceneId, number>> = { '09-almacenamiento': 20, '10-cierre': 60 };

export const sceneFrames = (id: SceneId) =>
  AUDIO_DELAY + Math.ceil(durations[id] * FPS) + TAIL + (extraTail[id] ?? 0);

export const totalFrames = sceneIds.reduce((sum, id) => sum + sceneFrames(id), 0) - TRANSITION * (sceneIds.length - 1);

// Tramos (en frames globales) en los que suena la voz, para bajar la música.
const voiceSpans = (() => {
  let start = 0;
  return sceneIds.map((id) => {
    const span = [start + AUDIO_DELAY, start + AUDIO_DELAY + Math.ceil(durations[id] * FPS)] as const;
    start += sceneFrames(id) - TRANSITION;
    return span;
  });
})();

const MUSIC_FULL = 0.32;
const MUSIC_UNDER_VOICE = 0.11;
const DUCK_FRAMES = 10;

/** Volumen de la música: entra suave, baja bajo la voz y se apaga al final. */
const musicVolume = (frame: number) => {
  const duck = Math.max(
    0,
    ...voiceSpans.map(([a, b]) =>
      interpolate(frame, [a - DUCK_FRAMES, a, b, b + DUCK_FRAMES], [0, 1, 1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
      }),
    ),
  );
  const level = MUSIC_FULL + (MUSIC_UNDER_VOICE - MUSIC_FULL) * duck;
  const fades = interpolate(frame, [0, 12, totalFrames - 75, totalFrames - 1], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  return level * fades;
};

/** Voz en off y subtítulos de una escena, con el mismo desfase. */
const Narration: React.FC<{ id: SceneId }> = ({ id }) => (
  <Sequence name={`Voz ${id}`} from={AUDIO_DELAY} layout="none">
    <Audio src={staticFile(`voice/${id}.mp3`)} />
    <Captions captions={captions[id]} />
  </Sequence>
);

const Scene: React.FC<{ id: SceneId; children: React.ReactNode }> = ({ id, children }) => (
  <AbsoluteFill>
    {children}
    <Narration id={id} />
  </AbsoluteFill>
);

const timing = linearTiming({ durationInFrames: TRANSITION });

export const Promo: React.FC = () => {
  const { width, height } = useVideoConfig();
  return (
    <AbsoluteFill style={{ width, height }}>
      <Background />
      <Audio name="Música" src={staticFile('music/push-it.mp3')} volume={musicVolume} />
      <TransitionSeries>
        <TransitionSeries.Sequence name="Intro" durationInFrames={sceneFrames('01-intro')}>
          <Scene id="01-intro">
            <Intro />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence name="Proyectos" durationInFrames={sceneFrames('02-proyectos')}>
          <Scene id="02-proyectos">
            <Projects />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Tareas" durationInFrames={sceneFrames('03-tareas')}>
          <Scene id="03-tareas">
            <Tasks />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Partes de horas" durationInFrames={sceneFrames('04-partes')}>
          <Scene id="04-partes">
            <Timesheets />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Contraseñas" durationInFrames={sceneFrames('05-contrasenas')}>
          <Scene id="05-contrasenas">
            <Passwords />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Notas" durationInFrames={sceneFrames('06-notas')}>
          <Scene id="06-notas">
            <Notes />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Extensión" durationInFrames={sceneFrames('07-extension')}>
          <Scene id="07-extension">
            <Extension captions={captions['07-extension']} audioDelay={AUDIO_DELAY} />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
        <TransitionSeries.Sequence name="Herramientas" durationInFrames={sceneFrames('08-herramientas')}>
          <Scene id="08-herramientas">
            <Tools captions={captions['08-herramientas']} audioDelay={AUDIO_DELAY} />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence name="Nube, local o combinado" durationInFrames={sceneFrames('09-almacenamiento')}>
          <Scene id="09-almacenamiento">
            <Storage captions={captions['09-almacenamiento']} audioDelay={AUDIO_DELAY} />
          </Scene>
        </TransitionSeries.Sequence>
        <TransitionSeries.Transition presentation={fade()} timing={timing} />
        <TransitionSeries.Sequence name="Cierre" durationInFrames={sceneFrames('10-cierre')}>
          <Scene id="10-cierre">
            <Outro />
          </Scene>
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};
