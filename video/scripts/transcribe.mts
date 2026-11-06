// Transcribe cada voz en off con Whisper (WebGPU, local) y guarda los subtítulos
// en src/data/captions.whisper.json, con tiempos relativos al inicio de cada audio.
// Después, scripts/align.mjs corrige el texto con el guion.
// Uso: node scripts/transcribe.mts
import { registerMediabunnyServer } from '@mediabunny/server';
import {
  WHISPER_WEBGPU_SAMPLE_RATE,
  canUseWhisperWebGpu,
  downloadWhisperModel,
  loadWhisperModel,
  toCaptions,
  transcribe,
} from '@remotion/whisper-webgpu';
import type { Caption } from '@remotion/captions';
import { ALL_FORMATS, Conversion, FilePathSource, Input, NullTarget, Output, WavOutputFormat } from 'mediabunny';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

registerMediabunnyServer();

const root = join(import.meta.dirname, '..');
const config = JSON.parse(readFileSync(join(root, 'scripts/voiceover.json'), 'utf8')) as {
  scenes: { id: string; text: string }[];
};

const support = await canUseWhisperWebGpu();
if (!support.supported) throw new Error(support.detailedReason);

const decode = async (file: string) => {
  const chunks: { startFrame: number; waveform: Float32Array }[] = [];
  using input = new Input({ formats: ALL_FORMATS, source: new FilePathSource(file) });
  const audioTrack = await input.getPrimaryAudioTrack();
  if (audioTrack === null) throw new Error(`Sin audio: ${file}`);
  const conversion = await Conversion.init({
    input,
    output: new Output({ format: new WavOutputFormat(), target: new NullTarget() }),
    video: { discard: true },
    audio: (track) => {
      if (track.id !== audioTrack.id) return { discard: true };
      return {
        codec: 'pcm-f32',
        forceTranscode: true,
        numberOfChannels: 1,
        sampleFormat: 'f32',
        sampleRate: WHISPER_WEBGPU_SAMPLE_RATE,
        process: (sample) => {
          const waveform = new Float32Array(
            sample.allocationSize({ format: 'f32', planeIndex: 0 }) / Float32Array.BYTES_PER_ELEMENT,
          );
          sample.copyTo(waveform, { format: 'f32', planeIndex: 0 });
          chunks.push({ startFrame: Math.round(sample.timestamp * WHISPER_WEBGPU_SAMPLE_RATE), waveform });
          return sample;
        },
      };
    },
  });
  if (!conversion.isValid) throw new Error(`No se puede decodificar: ${file}`);
  await conversion.execute();
  const length = chunks.reduce((max, c) => Math.max(max, c.startFrame + c.waveform.length), 0);
  const out = new Float32Array(length);
  for (const c of chunks) out.set(c.waveform.subarray(0, Math.min(c.waveform.length, length - c.startFrame)), Math.max(0, c.startFrame));
  return out;
};

const model = 'small';
await downloadWhisperModel({ model });
await using _handle = await loadWhisperModel({ model });

const result: Record<string, Caption[]> = {};
for (const scene of config.scenes) {
  const channelWaveform = await decode(join(root, 'public/voice', `${scene.id}.mp3`));
  const transcription = await transcribe({ channelWaveform, model, language: 'es' });
  const { captions } = toCaptions({ whisperWebGpuOutput: transcription });
  result[scene.id] = captions;
  console.log(scene.id, '→', result[scene.id].map((c) => c.text).join(''));
}

writeFileSync(join(root, 'src/data/captions.whisper.json'), JSON.stringify(result, null, 2) + '\n');
