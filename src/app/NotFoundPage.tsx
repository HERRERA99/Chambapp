import { Brand } from '../shared/brand/Brand';
import { ButtonLink } from '../shared/ui/Button';

export default function NotFoundPage() {
  return (
    <main className="not-found">
      <Brand />
      <p className="eyebrow">Error 404</p>
      <h1>Esta página se ha quedado fuera de la jornada.</h1>
      <p className="muted">Puedes volver al inicio o explorar el workspace.</p>
      <div className="actions">
        <ButtonLink to="/" variant="primary">
          Volver al inicio
        </ButtonLink>
        <ButtonLink to="/resumen">Abrir workspace</ButtonLink>
      </div>
    </main>
  );
}
