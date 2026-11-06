# Vídeo promocional de Chambapp

Vídeo horizontal (1920×1080, 30 fps, ~1:31) hecho con [Remotion](https://www.remotion.dev) para el landing. Usa los colores y tipografías de la app (`src/theme.ts`).

## Flujo

```bash
npm i
npm run dev          # Remotion Studio con la vista previa
```

Para cambiar el guion, edita `scripts/voiceover.json` y regenera:

```bash
pip install edge-tts   # una vez
npm run voice          # voz en off por escena (Edge TTS, es-ES-AlvaroNeural) → public/voice + src/data/durations.json
npm run captions       # Whisper (local, GPU) + alineado con el guion → src/data/captions.json
npm run render         # out/chambapp-promo.mp4 y el póster
npm run to-landing      # copia ambos a ../public/video para el landing
```

- **Voz**: Edge TTS (voces neuronales de Microsoft, sin clave de API). La duración de cada escena se ajusta sola a su audio.
- **Música**: `public/music/push-it.mp3`, recortada desde 2,45 s para quitar la marca de agua hablada del principio. Baja automáticamente mientras suena la voz (`musicVolume` en `src/Promo.tsx`).
- **Subtítulos**: `@remotion/whisper-webgpu` con el modelo `small` en español da los tiempos de cada palabra; `scripts/align.mjs` corrige la ortografía con el guion (Whisper no conoce «Chambapp», «Odoo» o «Markdown»).
- **Escenas**: `src/scenes/`, una por funcionalidad. Las escenas de extensión, herramientas y almacenamiento sincronizan sus animaciones con el momento en que la voz dice cada palabra.
