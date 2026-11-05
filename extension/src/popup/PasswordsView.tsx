import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { credentialMatches, safeUrl } from '../../../src/features/passwords/credentials.model';
import type { CredentialSecret } from '../../../src/features/passwords/credentials.model';
import { matchCredentials, displayHost } from '../shared/matching';
import { ask } from '../shared/messages';
import type {
  AutofillResult,
  CredentialView,
  ExtensionState,
  ProjectOption,
} from '../shared/messages';
import { Button, ErrorText, Icon, IconButton, Notice } from '../shared/ui';
import { copySecret, errorMessage } from '../shared/feedback';
import { CredentialForm } from './CredentialForm';

type Listing = { items: CredentialView[]; projects: ProjectOption[] };
type Screen =
  { kind: 'list' } | { kind: 'detail'; id: string } | { kind: 'edit'; id: string | null };

const APP_URL = 'https://chambapp-tracker.vercel.app';

function Unlock({ onState }: { onState: (state: ExtensionState) => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onState(await ask<ExtensionState>({ type: 'vault-unlock', password }));
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }
  return (
    <form className="stack" onSubmit={submit}>
      <div className="row">
        <span className="avatar">
          <Icon name="lock" size={14} />
        </span>
        <div className="item-text">
          <strong>Bóveda bloqueada</strong>
          <span className="dim">Usa tu clave maestra de Chambapp.</span>
        </div>
      </div>
      <div className="field">
        <label htmlFor="master">Clave maestra</label>
        <input
          id="master"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
          disabled={busy}
        />
        <span className="field__hint">Se descifra en este equipo; la clave nunca sale de él.</span>
      </div>
      <ErrorText>{error}</ErrorText>
      <Button type="submit" variant="primary" icon="unlock" block disabled={busy || !password}>
        {busy ? 'Desbloqueando…' : 'Desbloquear'}
      </Button>
    </form>
  );
}

function initials(name: string) {
  return (name.trim()[0] ?? '?').toUpperCase();
}

function Item({
  item,
  onOpen,
  onFill,
  canFill,
}: {
  item: CredentialView;
  onOpen: () => void;
  onFill: () => void;
  canFill: boolean;
}) {
  const host = item.url ? displayHost(item.url) : null;
  return (
    <li className="row">
      <button type="button" className="list-item list-item--button" onClick={onOpen}>
        <span className="avatar">{initials(item.nombre)}</span>
        <span className="item-text">
          <strong className="truncate">{item.nombre}</strong>
          <span className="dim truncate mono">{host ?? item.proyecto}</span>
        </span>
      </button>
      {canFill && item.readable ? (
        <IconButton icon="arrow" label={`Rellenar con ${item.nombre}`} onClick={onFill} />
      ) : null}
    </li>
  );
}

function Detail({
  item,
  onBack,
  onEdit,
  onFill,
  canFill,
}: {
  item: CredentialView;
  onBack: () => void;
  onEdit: () => void;
  onFill: () => void;
  canFill: boolean;
}) {
  const [shown, setShown] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const link = item.url ? safeUrl(item.url) : null;

  async function secretValue(fieldId: string) {
    return shown[fieldId] ?? ask<string>({ type: 'credential-value', id: item.id, fieldId });
  }
  async function toggle(fieldId: string) {
    setError('');
    if (shown[fieldId] !== undefined) {
      const next = { ...shown };
      delete next[fieldId];
      setShown(next);
      return;
    }
    try {
      const value = await secretValue(fieldId);
      setShown({ ...shown, [fieldId]: value });
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }
  async function copy(fieldId: string, value: string | null, label: string) {
    setError('');
    try {
      await copySecret(value ?? (await secretValue(fieldId)));
      setNotice(
        `${label} copiado.${value === null ? ' Se borrará del portapapeles en 30 s.' : ''}`,
      );
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  return (
    <div className="stack">
      <div className="row">
        <IconButton icon="left" label="Volver" onClick={onBack} />
        <span className="avatar">{initials(item.nombre)}</span>
        <div className="item-text">
          <strong className="truncate">{item.nombre}</strong>
          <span className="dim truncate">{item.proyecto}</span>
        </div>
        {item.readable ? <IconButton icon="edit" label="Editar" onClick={onEdit} /> : null}
      </div>
      {!item.readable ? (
        <Notice title="No se puede leer">
          <p>Esta entrada se guardó con otra clave maestra. Ábrela en la app.</p>
        </Notice>
      ) : null}
      {item.url ? (
        <div className="secret-field">
          <span className="secret-field__value mono">{item.url}</span>
          {link ? (
            <IconButton
              icon="external"
              label="Abrir web"
              onClick={() => void chrome.tabs.create({ url: link })}
            />
          ) : null}
        </div>
      ) : null}
      {item.campos.map((field) => (
        <div key={field.id} className="stack stack--tight">
          <span className="label">{field.etiqueta}</span>
          <div className="secret-field">
            <span className="secret-field__value mono">
              {field.secreto ? (shown[field.id] ?? '••••••••••') : field.valor || '—'}
            </span>
            {field.secreto ? (
              <IconButton
                icon={shown[field.id] !== undefined ? 'eyeOff' : 'eye'}
                label={shown[field.id] !== undefined ? 'Ocultar' : 'Mostrar'}
                onClick={() => void toggle(field.id)}
              />
            ) : null}
            <IconButton
              icon="copy"
              label={`Copiar ${field.etiqueta}`}
              onClick={() =>
                void copy(field.id, field.secreto ? null : field.valor, field.etiqueta)
              }
            />
          </div>
        </div>
      ))}
      <ErrorText>{error}</ErrorText>
      {notice ? (
        <p className="form-ok" role="status">
          {notice}
        </p>
      ) : null}
      {canFill && item.readable ? (
        <Button variant="primary" icon="arrow" block onClick={onFill}>
          Rellenar en esta web
        </Button>
      ) : null}
    </div>
  );
}

export function PasswordsView({
  state,
  tab,
  onState,
}: {
  state: ExtensionState;
  tab: chrome.tabs.Tab | null;
  onState: (state: ExtensionState) => void;
}) {
  const [listing, setListing] = useState<Listing | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: 'list' });
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState<{
    id: string;
    pageHost: string;
    pageOrigin: string;
    insecure: boolean;
    credentialHost: string | null;
  } | null>(null);
  const tabUrl = tab?.url ?? '';
  const canFill = /^https?:/i.test(tabUrl) && tab?.id !== undefined;

  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (state.vault !== 'unlocked') return;
    let cancelled = false;
    ask<Listing>({ type: 'credentials-list' }).then(
      (value) => {
        if (!cancelled) setListing(value);
      },
      (cause: unknown) => {
        if (!cancelled) setError(errorMessage(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [state.vault, version]);

  const matches = useMemo(
    () => matchCredentials(listing?.items.filter((item) => item.readable) ?? [], tabUrl),
    [listing, tabUrl],
  );
  const filtered = useMemo(() => {
    const items = listing?.items ?? [];
    if (!search.trim()) return items;
    return items.filter((item) =>
      credentialMatches(
        {
          nombre: item.nombre,
          url: item.url,
          campos: item.campos.map((field) => ({ ...field, valor: field.valor ?? '' })),
        } as CredentialSecret,
        search,
      ),
    );
  }, [listing, search]);

  async function fill(id: string, confirmedOrigin: string | null = null) {
    if (tab?.id === undefined) return;
    setError('');
    setMessage('');
    try {
      const result = await ask<AutofillResult>({
        type: 'autofill',
        tabId: tab.id,
        credentialId: id,
        confirmedOrigin,
      });
      if (result.kind === 'confirm') setConfirm({ id, ...result });
      else if (result.kind === 'not-found')
        setError('No se encontró un formulario de acceso visible en esta página.');
      else {
        setConfirm(null);
        setMessage(
          `${[result.username && 'usuario', result.password && 'contraseña'].filter(Boolean).join(' y ')} rellenado${result.username && result.password ? 's' : ''}.`,
        );
      }
    } catch (cause) {
      setError(errorMessage(cause));
    }
  }

  if (state.vault === 'none')
    return (
      <Notice icon="key" title="Crea tu clave maestra">
        <p>Para usar el gestor de contraseñas, crea primero la clave maestra en Chambapp.</p>
        <Button
          style={{ marginTop: 8 }}
          onClick={() => void chrome.tabs.create({ url: `${APP_URL}/contrasenas` })}
        >
          Abrir Chambapp
        </Button>
      </Notice>
    );
  if (state.vault !== 'unlocked') return <Unlock onState={onState} />;
  if (!listing) return error ? <ErrorText>{error}</ErrorText> : <p className="dim">Descifrando…</p>;

  const current =
    screen.kind !== 'list' && screen.id
      ? listing.items.find((item) => item.id === screen.id)
      : null;

  if (screen.kind === 'edit')
    return (
      <CredentialForm
        id={screen.id}
        projects={listing.projects}
        defaults={{
          url: canFill ? new URL(tabUrl).origin : '',
          name: canFill ? (displayHost(tabUrl) ?? '') : '',
        }}
        onCancel={() => setScreen(screen.id ? { kind: 'detail', id: screen.id } : { kind: 'list' })}
        onSaved={(id) => {
          setVersion((value) => value + 1);
          setScreen({ kind: 'detail', id });
        }}
      />
    );

  const confirmation = confirm ? (
    <div className="notice" role="alertdialog" aria-label="Confirmar autocompletado">
      <Icon name="shield" size={16} />
      <div className="stack stack--tight">
        <strong>
          {confirm.insecure ? '¿Rellenar en una página sin HTTPS?' : '¿Rellenar en otra web?'}
        </strong>
        <p>
          Esta página es <span className="mono">{confirm.pageOrigin}</span>
          {confirm.credentialHost ? (
            <>
              {' '}
              y la entrada es de <span className="mono">{confirm.credentialHost}</span>
            </>
          ) : (
            ' y la entrada no tiene dirección'
          )}
          .{' '}
          {confirm.insecure
            ? 'La conexión no está cifrada: la contraseña podría verse en la red.'
            : 'Hazlo solo si confías en esta página.'}
        </p>
        <div className="row">
          <Button variant="primary" onClick={() => void fill(confirm.id, confirm.pageOrigin)}>
            Rellenar igualmente
          </Button>
          <Button variant="ghost" onClick={() => setConfirm(null)}>
            Cancelar
          </Button>
        </div>
      </div>
    </div>
  ) : null;

  if (screen.kind === 'detail' && current)
    return (
      <div className="stack">
        {confirmation}
        {message ? (
          <p className="form-ok" role="status">
            {message}
          </p>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <Detail
          item={current}
          canFill={canFill}
          onBack={() => setScreen({ kind: 'list' })}
          onEdit={() => setScreen({ kind: 'edit', id: current.id })}
          onFill={() => void fill(current.id)}
        />
      </div>
    );

  const byProject = new Map<string, CredentialView[]>();
  for (const item of filtered)
    byProject.set(item.proyecto, [...(byProject.get(item.proyecto) ?? []), item]);

  return (
    <div className="stack">
      <div className="row">
        <input
          type="search"
          placeholder="Buscar por nombre, web o campo"
          aria-label="Buscar contraseñas"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <IconButton
          icon="plus"
          label="Nueva entrada"
          onClick={() => setScreen({ kind: 'edit', id: null })}
        />
      </div>
      {confirmation}
      {message ? (
        <p className="form-ok" role="status">
          {message}
        </p>
      ) : null}
      <ErrorText>{error}</ErrorText>
      {!search.trim() && canFill ? (
        <section className="stack stack--tight">
          <p className="eyebrow">Esta web · {displayHost(tabUrl)}</p>
          {matches.exact.length || matches.related.length ? (
            <ul className="list">
              {[...matches.exact, ...matches.related].map((item) => (
                <Item
                  key={item.id}
                  item={item}
                  canFill
                  onOpen={() => setScreen({ kind: 'detail', id: item.id })}
                  onFill={() => void fill(item.id)}
                />
              ))}
            </ul>
          ) : (
            <p className="dim">No hay entradas para esta web.</p>
          )}
          {matches.related.length ? (
            <p className="field__hint">
              Las de subdominios relacionados piden confirmación al rellenar.
            </p>
          ) : null}
        </section>
      ) : null}
      {[...byProject.entries()].map(([project, items]) => (
        <section key={project} className="stack stack--tight">
          <p className="eyebrow">{project}</p>
          <ul className="list">
            {items.map((item) => (
              <Item
                key={item.id}
                item={item}
                canFill={canFill}
                onOpen={() => setScreen({ kind: 'detail', id: item.id })}
                onFill={() => void fill(item.id)}
              />
            ))}
          </ul>
        </section>
      ))}
      {!filtered.length ? (
        <p className="dim">
          {search.trim() ? 'Sin resultados.' : 'Todavía no tienes contraseñas guardadas.'}
        </p>
      ) : null}
    </div>
  );
}
