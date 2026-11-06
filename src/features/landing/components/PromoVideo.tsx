// Vídeo promocional generado con Remotion (carpeta video/ del repositorio).
// Los subtítulos van incrustados en la imagen.
export function PromoVideo() {
  return (
    <div className="landing-video">
      <div className="landing-video__glow" aria-hidden="true" />
      <div className="landing-video__frame">
        <video
          controls
          playsInline
          preload="metadata"
          poster="/video/chambapp-promo-poster.jpg"
          aria-label="Vídeo de presentación de Chambapp, con voz y subtítulos"
        >
          <source src="/video/chambapp-promo.mp4" type="video/mp4" />
        </video>
      </div>
    </div>
  );
}
