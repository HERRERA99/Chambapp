import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { DateTime } from "luxon";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Coffee,
  ExternalLink,
  FolderKanban,
  LayoutDashboard,
  Link2,
  ListTodo,
  LogOut,
  Menu,
  MoreHorizontal,
  Pause,
  Play,
  Plus,
  Search,
  Settings2,
  Square,
  Timer,
  Utensils,
  X,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import {
  configured,
  dateLabel,
  decimalHours,
  duration,
  errorText,
  localInput,
  rounded,
  seconds,
  supabase,
  toInstant,
  today,
  unwrap,
} from "./lib";

// Forms and Supabase rows share a dynamic shape across the data model.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
type Data = {
  profile: Row | null;
  preferences: Row | null;
  projects: Row[];
  tasks: Row[];
  notes: Row[];
  links: Row[];
  schedules: Row[];
  scheduleDays: Row[];
  days: Row[];
  periods: Row[];
  entries: Row[];
  types: Row[];
  events: Row[];
  revisions: Row[];
};
const empty: Data = {
  profile: null,
  preferences: null,
  projects: [],
  tasks: [],
  notes: [],
  links: [],
  schedules: [],
  scheduleDays: [],
  days: [],
  periods: [],
  entries: [],
  types: [],
  events: [],
  revisions: [],
};
type Page =
  | "dashboard"
  | "timer"
  | "tasks"
  | "projects"
  | "calendar"
  | "reports"
  | "calculator"
  | "settings";
type Modal =
  | "project"
  | "task"
  | "entry"
  | "period"
  | "event"
  | "type"
  | "schedule"
  | "target"
  | null;
const nav: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "dashboard", label: "Resumen", icon: LayoutDashboard },
  { id: "timer", label: "Control horario", icon: Timer },
  { id: "tasks", label: "Tareas", icon: ListTodo },
  { id: "projects", label: "Proyectos", icon: FolderKanban },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "reports", label: "Informes", icon: BarChart3 },
  { id: "calculator", label: "Calculadora", icon: Clock3 },
  { id: "settings", label: "Ajustes", icon: Settings2 },
];
const taskStatus: Record<string, string> = {
  todo: "Por hacer",
  in_progress: "En curso",
  blocked: "Bloqueada",
  done: "Terminada",
  cancelled: "Cancelada",
};
const projectStatus: Record<string, string> = {
  active: "Activo",
  paused: "Pausado",
  completed: "Completado",
};
const kindNames: Record<string, string> = {
  task: "Tarea",
  break: "Descanso",
  meal: "Comida",
  custom: "Personalizado",
};
const weekdays = ["L", "M", "X", "J", "V", "S", "D"];
const canonicalUrl = (url: string) => url.trim().toLowerCase().replace(/\/+$/, "");

function IconButton({
  children,
  onClick,
  title,
  className = "",
}: {
  children: ReactNode;
  onClick: () => void;
  title: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${className}`}
      onClick={onClick}
      title={title}
      aria-label={title}
    >
      {children}
    </button>
  );
}
function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
function Empty({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Activity size={26} />
      </div>
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
function ModalShell({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span className="eyebrow">CHAMBAPP / EDITAR</span>
            <h2>{title}</h2>
          </div>
          <IconButton title="Cerrar" onClick={onClose}>
            <X size={20} />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function Select({
  value,
  onChange,
  children,
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  required?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      required={required}
    >
      {children}
    </select>
  );
}
function LiveDuration({ start, end }: { start: string; end?: string | null }) {
  // A timer needs the wall clock as its initial snapshot.
  // eslint-disable-next-line react-hooks/purity
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (end) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [end]);
  return <>{duration(seconds(start, end, now), true)}</>;
}
function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [data, setData] = useState<Data>(empty);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [page, setPage] = useState<Page>("dashboard");
  const [modal, setModal] = useState<Modal>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  // Editor fields differ by entity and are validated before persistence.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [selectedTask, setSelectedTask] = useState<string | null>(null);
  const [taskQuery, setTaskQuery] = useState("");
  const [taskFilter, setTaskFilter] = useState("active");
  const [taskProjectFilter, setTaskProjectFilter] = useState("");
  const [taskSort, setTaskSort] = useState("updated");
  const [selectedDate, setSelectedDate] = useState(today());
  const [calendarMonth, setCalendarMonth] = useState(
    DateTime.now().startOf("month"),
  );
  const generationInProgress = useRef(new Set<string>());
  const [mobileNav, setMobileNav] = useState(false);
  const tick = Date.now();
  const userId = session?.user.id;
  const zone = data.profile?.timezone || "Europe/Madrid";
  const currentDate = today(zone);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: result }) => {
      setSession(result.session);
      setAuthReady(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        setSession(next);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
      },
    );
    return () => listener.subscription.unsubscribe();
  }, []);
  const load = useCallback(async () => {
    if (!userId) {
      setData(empty);
      return;
    }
    setBusy(true);
    try {
      const tables = [
        "profiles",
        "time_preferences",
        "projects",
        "tasks",
        "task_notes",
        "task_links",
        "work_schedules",
        "work_schedule_days",
        "work_days",
        "work_periods",
        "time_entries",
        "activity_types",
        "calendar_events",
        "time_entry_revisions",
      ] as const;
      const fetchAll = async (table: (typeof tables)[number]) => {
        const rows: Row[] = [];
        for (let offset = 0; ; offset += 1000) {
          const page = (await unwrap(
            supabase
              .from(table)
              .select("*")
              .eq("user_id", userId)
              .range(offset, offset + 999),
          )) as Row[];
          rows.push(...page);
          if (page.length < 1000) return rows;
        }
      };
      const results = await Promise.all(tables.map(fetchAll));
      setData({
        profile: results[0][0] || null,
        preferences: results[1][0] || null,
        projects: results[2],
        tasks: results[3],
        notes: results[4],
        links: results[5],
        schedules: results[6],
        scheduleDays: results[7],
        days: results[8],
        periods: results[9],
        entries: results[10],
        types: results[11],
        events: results[12],
        revisions: results[13],
      } as Data);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!userId || !data.profile) return;
    const first =
      page === "calendar"
        ? calendarMonth.startOf("month").startOf("week")
        : DateTime.fromISO(today(data.profile.timezone));
    const dates =
      page === "calendar"
        ? Array.from(
            { length: 42 },
            (_, i) => first.plus({ days: i }).toISODate()!,
          )
        : [first.toISODate()!];
    const missing = dates.filter(
      (date) =>
        !data.days.some((day) => day.work_date === date) &&
        !generationInProgress.current.has(date),
    );
    if (!missing.length) return;
    missing.forEach((date) => generationInProgress.current.add(date));
    void Promise.all(
      missing.map((date) =>
        unwrap(supabase.rpc("ensure_work_day", { p_date: date })),
      ),
    )
      .then(() => {
        void load();
      })
      .catch((error) => setMessage(errorText(error)))
      .finally(() =>
        missing.forEach((date) => generationInProgress.current.delete(date)),
      );
  }, [userId, data.profile, data.days, page, calendarMonth, load]);
  const run = async (action: () => Promise<unknown>, success?: string) => {
    setBusy(true);
    setMessage("");
    try {
      await action();
      await load();
      if (success) setMessage(success);
      setModal(null);
      setEditing(null);
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setBusy(false);
    }
  };
  const open = (kind: Modal, record?: Row | null) => {
    const item = record || {};
    setEditForm({
      name: item.name || "",
      description: item.description || "",
      color: item.color || "#ef4444",
      status: item.status || (kind === "task" ? "todo" : "active"),
      project_id: item.project_id || "",
      title: item.title || "",
      priority: item.priority || "",
      estimate_minutes: item.estimate_minutes ?? "",
      due_date: item.due_date || "",
      link_url: "",
      link_label: "",
      kind: item.kind || (kind === "event" ? "event" : "task"),
      task_id: item.task_id || "",
      activity_type_id: item.activity_type_id || "",
      work_period_id: item.work_period_id || "",
      started_at:
        localInput(item.started_at, zone) ||
        `${item.selectedDate || selectedDate}T09:00`,
      ended_at:
        localInput(item.ended_at, zone) ||
        `${item.selectedDate || selectedDate}T10:00`,
      note: item.note || "",
      reason: "",
      work_date: item.selectedDate || item.work_date || selectedDate,
      all_day: item.all_day ?? true,
      starts_on: item.starts_on || selectedDate,
      ends_on:
        item.ends_on ||
        DateTime.fromISO(selectedDate).plus({ days: 1 }).toISODate(),
      starts_at: localInput(item.starts_at, zone) || `${selectedDate}T09:00`,
      ends_at: localInput(item.ends_at, zone) || `${selectedDate}T10:00`,
      affects_work_target: item.affects_work_target || false,
      default_counts_as_work: item.default_counts_as_work ?? true,
      effective_from: DateTime.fromISO(currentDate)
        .plus({ days: 1 })
        .toISODate(),
      weekly_target_minutes: 2250,
      target_minutes: item.target_minutes ?? 0,
      weekdays: [1, 2, 3, 4, 5],
    });
    setEditing(record || null);
    setModal(kind);
    setMessage("");
  };
  const ensureDay = async (date: string) =>
    unwrap(supabase.rpc("ensure_work_day", { p_date: date })) as Promise<Row>;
  const day = data.days.find((item) => item.work_date === selectedDate);
  const dayPeriods = data.periods
    .filter((item) => item.work_day_id === day?.id)
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const dayEntries = data.entries
    .filter((item) => dayPeriods.some((p) => p.id === item.work_period_id))
    .sort((a, b) => a.started_at.localeCompare(b.started_at));
  const openPeriod = data.periods.find((p) => !p.ended_at);
  const openEntry = data.entries.find((e) => !e.ended_at);
  const activeEntryName =
    openEntry?.kind === "task"
      ? data.tasks.find((t) => t.id === openEntry.task_id)?.title
      : openEntry?.kind === "custom"
        ? data.types.find((t) => t.id === openEntry.activity_type_id)?.name
        : kindNames[openEntry?.kind || ""];
  const projectName = (id: string) =>
    data.projects.find((p) => p.id === id)?.name || "Sin proyecto";
  const entryName = (entry: Row) =>
    entry.kind === "task"
      ? `${entry.task_id} · ${data.tasks.find((t) => t.id === entry.task_id)?.title || "Tarea archivada"}`
      : entry.kind === "custom"
        ? data.types.find((t) => t.id === entry.activity_type_id)?.name ||
          "Personalizado"
        : kindNames[entry.kind];
  const actual = (entry: Row) =>
    seconds(entry.started_at, entry.ended_at, tick);
  const dayPresence = dayPeriods.reduce(
    (sum, p) => sum + seconds(p.started_at, p.ended_at, tick),
    0,
  );
  const dayRegistered = dayEntries.reduce((sum, e) => sum + actual(e), 0);
  const dayNet = dayEntries
    .filter((e) => e.counts_as_work)
    .reduce((sum, e) => sum + actual(e), 0);
  const reviewed = (item: Row) =>
    Boolean(
      item.reviewed_at &&
        (!item.review_dirty_at || item.reviewed_at >= item.review_dirty_at),
    );
  const displayName =
    data.profile?.display_name?.trim() ||
    session?.user.email?.split("@")[0] ||
    "Tu espacio";

  if (!configured)
    return (
      <div className="setup-screen">
        <div className="brand big">
          <span className="brand-symbol">
            C<span>.</span>
          </span>
          <span>chambapp</span>
        </div>
        <h1>
          Conecta tu proyecto
          <br />
          <em>Supabase.</em>
        </h1>
        <p>
          Configura las variables de <code>.env.example</code> en un archivo{" "}
          <code>.env.local</code> y ejecuta la migración incluida. Después
          vuelve a cargar la página.
        </p>
        <div className="setup-code">
          VITE_SUPABASE_URL
          <br />
          VITE_SUPABASE_PUBLISHABLE_KEY
        </div>
      </div>
    );
  if (!authReady)
    return (
      <div className="loading-screen">
        <div className="brand big">
          <span className="brand-symbol">
            C<span>.</span>
          </span>
          <span>chambapp</span>
        </div>
        <p>Cargando tu espacio…</p>
      </div>
    );
  if (!session) return <Auth />;
  if (recovery) return <PasswordRecovery onDone={() => setRecovery(false)} />;

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "show" : ""}`}>
        <div className="brand">
          <span className="brand-symbol">
            C<span>.</span>
          </span>
          <span>chambapp</span>
        </div>
        <div className="sidebar-section">ESPACIO DE TRABAJO</div>
        <nav>
          {nav.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => {
                setPage(item.id);
                setMobileNav(false);
              }}
            >
              <item.icon size={19} strokeWidth={1.9} />
              <span>{item.label}</span>
              {page === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <div className="sidebar-help-icon">
              <Clock3 size={20} />
            </div>
            <strong>Cada minuto cuenta.</strong>
            <span>Tu trabajo, con claridad.</span>
          </div>
          <button
            className="profile-switch"
            onClick={() => setPage("settings")}
          >
            <span className="avatar">
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <span>
              <strong>{displayName}</strong>
              <small>Mi cuenta</small>
            </span>
            <MoreHorizontal size={19} />
          </button>
        </div>
      </aside>
      {mobileNav && (
        <div className="nav-shade" onClick={() => setMobileNav(false)} />
      )}
      <main className="main-content">
        <header className="topbar">
          <div className="topbar-left">
            <IconButton
              title="Abrir menú"
              className="mobile-menu"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={22} />
            </IconButton>
            <span className="top-crumb">MI ESPACIO</span>
            <ChevronRight size={14} />
            <span>{nav.find((n) => n.id === page)?.label}</span>
          </div>
          <div className="topbar-right">
            <span className="today-label">
              <span className="live-dot" />{" "}
              {new Intl.DateTimeFormat("es-ES", {
                timeZone: zone,
                weekday: "long",
                day: "numeric",
                month: "long",
              }).format(new Date(tick))}
            </span>
            <IconButton
              title="Cerrar sesión"
              onClick={() => {
                void supabase.auth.signOut();
              }}
            >
              <LogOut size={19} />
            </IconButton>
          </div>
        </header>
        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <IconButton title="Cerrar aviso" onClick={() => setMessage("")}>
              <X size={16} />
            </IconButton>
          </div>
        )}
        <div className="page-wrap">
          {page === "dashboard" && Dashboard()}
          {page === "timer" && TimerPage()}
          {page === "tasks" && TasksPage()}
          {page === "projects" && ProjectsPage()}
          {page === "calendar" && CalendarPage()}
          {page === "reports" && <ReportsPage />}
          {page === "calculator" && <CalculatorPage />}
          {page === "settings" && <SettingsPage />}
        </div>
      </main>
      {modal && Editor()}
    </div>
  );

  function PageHead({
    eyebrow,
    title,
    subtitle,
    action,
  }: {
    eyebrow: string;
    title: string;
    subtitle: string;
    action?: ReactNode;
  }) {
    return (
      <div className="page-head">
        <div>
          <span className="eyebrow">{eyebrow}</span>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {action && <div className="head-actions">{action}</div>}
      </div>
    );
  }
  function Metric({
    label,
    value,
    sub,
    icon: Icon,
    accent = false,
  }: {
    label: string;
    value: string;
    sub: string;
    icon: typeof Clock3;
    accent?: boolean;
  }) {
    return (
      <article className={`metric-card ${accent ? "accent" : ""}`}>
        <div className="metric-top">
          <span>{label}</span>
          <Icon size={18} />
        </div>
        <strong>{value}</strong>
        <small>{sub}</small>
      </article>
    );
  }
  function Dashboard() {
    const dates = data.days.filter(
      (d) =>
        d.work_date >=
          DateTime.fromISO(currentDate).startOf("week").toISODate()! &&
        d.work_date <= currentDate,
    );
    const weekPeriods = data.periods.filter((p) =>
      dates.some((d) => d.id === p.work_day_id),
    );
    const weekEntries = data.entries.filter((e) =>
      weekPeriods.some((p) => p.id === e.work_period_id),
    );
    const weekNet = weekEntries
      .filter((e) => e.counts_as_work)
      .reduce((n, e) => n + actual(e), 0);
    const weekTarget = dates.reduce((n, d) => n + d.target_minutes * 60, 0);
    const recent = [...data.entries]
      .sort((a, b) => b.started_at.localeCompare(a.started_at))
      .slice(0, 5);
    const overdue = data.tasks.filter(
      (t) =>
        !t.archived_at &&
        t.due_date &&
        t.due_date < currentDate &&
        !["done", "cancelled"].includes(t.status),
    );
    return (
      <>
        <PageHead
          eyebrow="TU PANEL / HOY"
          title={`Hola, ${displayName}.`}
          subtitle="Aquí tienes una vista clara de tu jornada y tus proyectos."
          action={
            <button
              className="btn primary"
              onClick={() => {
                setPage("timer");
                setSelectedDate(currentDate);
              }}
            >
              <Play size={16} fill="currentColor" /> Ir al control horario
            </button>
          }
        />
        <div className="metrics-grid">
          <Metric
            label="Presencia hoy"
            value={duration(dayPresence)}
            sub="Tiempo en jornada"
            icon={Clock3}
            accent
          />
          <Metric
            label="Trabajo neto"
            value={duration(dayNet)}
            sub={`Objetivo: ${duration((day?.target_minutes || 0) * 60)}`}
            icon={Activity}
          />
          <Metric
            label="Esta semana"
            value={duration(weekNet)}
            sub={`Objetivo registrado: ${duration(weekTarget)}`}
            icon={BarChart3}
          />
          <Metric
            label="Tareas pendientes"
            value={String(
              data.tasks.filter(
                (t) =>
                  !t.archived_at && !["done", "cancelled"].includes(t.status),
              ).length,
            )}
            sub={`${overdue.length} vencidas`}
            icon={ListTodo}
          />
        </div>
        <div className="dashboard-grid">
          <section className="panel focus-panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">EN DIRECTO</span>
                <h2>Tu jornada de hoy</h2>
              </div>
              <span className={`status-pill ${openPeriod ? "live" : ""}`}>
                {openPeriod
                  ? "En curso"
                  : reviewed(day || {})
                    ? "Revisada"
                    : "Pendiente"}
              </span>
            </div>
            <div className="focus-time">
              {openEntry ? (
                <LiveDuration start={openEntry.started_at} />
              ) : (
                duration(dayPresence, true)
              )}
              <span>
                {openEntry
                  ? activeEntryName
                  : openPeriod
                    ? "Jornada abierta"
                    : "Sin cronómetro activo"}
              </span>
            </div>
            <div className="progress-line">
              <span
                style={{
                  width: `${Math.min(100, day?.target_minutes ? (dayNet / (day.target_minutes * 60)) * 100 : 0)}%`,
                }}
              />
            </div>
            <div className="focus-meta">
              <span>{duration(dayNet)} de trabajo neto</span>
              <span>
                {day?.target_minutes
                  ? Math.round((dayNet / (day.target_minutes * 60)) * 100)
                  : 0}
                % del objetivo
              </span>
            </div>
            <button
              className="text-link"
              onClick={() => {
                setPage("timer");
                setSelectedDate(currentDate);
              }}
            >
              Gestionar jornada <ArrowRight size={16} />
            </button>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">ACTIVIDAD</span>
                <h2>Últimos registros</h2>
              </div>
              <button className="text-link" onClick={() => setPage("timer")}>
                Ver todos <ArrowRight size={15} />
              </button>
            </div>
            {recent.length ? (
              <div className="activity-list">
                {recent.map((e) => (
                  <div className="activity-row" key={e.id}>
                    <span className={`activity-icon ${e.kind}`}>
                      {e.kind === "task" ? (
                        <ListTodo size={17} />
                      ) : e.kind === "meal" ? (
                        <Utensils size={17} />
                      ) : (
                        <Coffee size={17} />
                      )}
                    </span>
                    <div>
                      <strong>{entryName(e)}</strong>
                      <small>
                        {new Intl.DateTimeFormat("es-ES", {
                          timeZone: zone,
                          day: "numeric",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(e.started_at))}
                      </small>
                    </div>
                    <b>{duration(actual(e))}</b>
                  </div>
                ))}
              </div>
            ) : (
              <Empty
                title="Aún no hay registros"
                description="Inicia tu jornada para ver tu actividad aquí."
              />
            )}
          </section>
        </div>
        <div className="section-title">
          <div>
            <span className="eyebrow">EN FOCO</span>
            <h2>Tareas por completar</h2>
          </div>
          <button className="text-link" onClick={() => setPage("tasks")}>
            Todas las tareas <ArrowRight size={15} />
          </button>
        </div>
        <div className="task-card-grid">
          {data.tasks
            .filter(
              (t) =>
                !t.archived_at && !["done", "cancelled"].includes(t.status),
            )
            .slice(0, 3)
            .map((t) => (
              <button
                className="task-preview"
                key={t.id}
                onClick={() => {
                  setSelectedTask(t.id);
                  setPage("tasks");
                }}
              >
                <div>
                  <span className="task-id">{t.id}</span>
                  <span className={`priority ${t.priority || "none"}`}>
                    {t.priority === "urgent"
                      ? "Urgente"
                      : t.priority === "high"
                        ? "Alta"
                        : t.priority === "medium"
                          ? "Media"
                          : "Normal"}
                  </span>
                </div>
                <strong>{t.title}</strong>
                <small>{projectName(t.project_id)}</small>
                <span className="preview-bottom">
                  {t.due_date
                    ? `Vence ${dateLabel(t.due_date)}`
                    : taskStatus[t.status]}
                  <ArrowUpRight size={17} />
                </span>
              </button>
            ))}
          {!data.tasks.length && (
            <Empty
              title="Crea tu primera tarea"
              description="Organiza el trabajo por proyectos y registra el tiempo dedicado."
              action={
                <button className="btn primary" onClick={() => open("project")}>
                  <Plus size={16} /> Nuevo proyecto
                </button>
              }
            />
          )}
        </div>
      </>
    );
  }
  function TimerPage() {
    const gaps = Math.max(0, dayPresence - dayRegistered);
    const forDay = data.events.filter((e) =>
      e.all_day
        ? selectedDate >= e.starts_on && selectedDate < e.ends_on
        : selectedDate ===
          DateTime.fromISO(e.starts_at).setZone(zone).toISODate(),
    );
    return (
      <>
        <PageHead
          eyebrow="TIEMPO / JORNADA"
          title="Control horario"
          subtitle="Registra presencia, tareas y pausas. Cada tramo queda asociado a su jornada."
          action={
            <div className="date-controls">
              <IconButton
                title="Día anterior"
                onClick={() =>
                  setSelectedDate(
                    DateTime.fromISO(selectedDate)
                      .minus({ days: 1 })
                      .toISODate()!,
                  )
                }
              >
                <ChevronLeft size={19} />
              </IconButton>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
              />
              <IconButton
                title="Día siguiente"
                onClick={() =>
                  setSelectedDate(
                    DateTime.fromISO(selectedDate)
                      .plus({ days: 1 })
                      .toISODate()!,
                  )
                }
              >
                <ChevronRight size={19} />
              </IconButton>
            </div>
          }
        />
        <div className="timer-layout">
          <div>
            <section className="panel timer-hero">
              <div className="timer-hero-top">
                <span className="eyebrow">
                  {openEntry
                    ? "CRONÓMETRO EN MARCHA"
                    : openPeriod
                      ? "JORNADA EN CURSO"
                      : "LISTO PARA EMPEZAR"}
                </span>
                <span className={`status-pill ${openPeriod ? "live" : ""}`}>
                  {openPeriod ? "Activo" : "Inactivo"}
                </span>
              </div>
              <div className="timer-digits">
                {openEntry ? (
                  <LiveDuration start={openEntry.started_at} />
                ) : openPeriod ? (
                  <LiveDuration start={openPeriod.started_at} />
                ) : (
                  "0:00:00"
                )}
              </div>
              <p>
                {openEntry
                  ? activeEntryName
                  : openPeriod
                    ? "Selecciona una actividad para empezar a imputar tiempo."
                    : "Inicia tu jornada para comenzar el seguimiento."}
              </p>
              <div className="timer-actions">
                {!openPeriod ? (
                  <button
                    className="btn primary large"
                    onClick={() =>
                      void run(async () => {
                        await unwrap(
                          supabase.rpc("start_period", { p_date: currentDate }),
                        );
                        setSelectedDate(currentDate);
                      }, "Jornada iniciada.")
                    }
                  >
                    <Play size={18} fill="currentColor" /> Iniciar jornada
                  </button>
                ) : (
                  <>
                    {openEntry ? (
                      <button
                        className="btn primary large"
                        onClick={() =>
                          void run(
                            () =>
                              unwrap(
                                supabase.rpc("stop_entry", {
                                  p_id: openEntry.id,
                                }),
                              ),
                            "Actividad detenida.",
                          )
                        }
                      >
                        <Square size={17} fill="currentColor" /> Detener
                        actividad
                      </button>
                    ) : (
                      <button
                        className="btn primary large"
                        onClick={() =>
                          open("entry", {
                            work_period_id: openPeriod.id,
                            timer: true,
                          })
                        }
                      >
                        <Play size={18} fill="currentColor" /> Iniciar actividad
                      </button>
                    )}
                    <button
                      className="btn secondary large"
                      onClick={() =>
                        void run(
                          () =>
                            unwrap(
                              supabase.rpc("stop_period", {
                                p_id: openPeriod.id,
                              }),
                            ),
                          "Jornada cerrada.",
                        )
                      }
                      disabled={!!openEntry}
                    >
                      <Pause size={17} /> Cerrar tramo
                    </button>
                  </>
                )}
              </div>
            </section>
            <section className="panel timeline-panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">REGISTROS DEL DÍA</span>
                  <h2>
                    {dateLabel(selectedDate, zone, {
                      weekday: "long",
                      day: "numeric",
                      month: "long",
                    })}
                  </h2>
                </div>
                <div className="inline-actions">
                  <button
                    className="btn subtle"
                    onClick={() =>
                      open("period", { work_day_id: day?.id, selectedDate })
                    }
                  >
                    <Plus size={16} /> Tramo
                  </button>
                  <button
                    className="btn subtle"
                    onClick={() => open("entry", { selectedDate })}
                  >
                    <Plus size={16} /> Parte
                  </button>
                </div>
              </div>
              {dayPeriods.length ? (
                <div className="timeline">
                  {dayPeriods.map((p) => (
                    <div className="period-block" key={p.id}>
                      <div className="period-header">
                        <span className="period-dot" />
                        <strong>
                          {new Intl.DateTimeFormat("es-ES", {
                            timeZone: zone,
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(p.started_at))}{" "}
                          —{" "}
                          {p.ended_at
                            ? new Intl.DateTimeFormat("es-ES", {
                                timeZone: zone,
                                hour: "2-digit",
                                minute: "2-digit",
                              }).format(new Date(p.ended_at))
                            : "En curso"}
                        </strong>
                        <span>
                          {duration(seconds(p.started_at, p.ended_at, tick))}
                        </span>
                        <IconButton
                          title="Editar tramo"
                          onClick={() => open("period", p)}
                        >
                          <MoreHorizontal size={18} />
                        </IconButton>
                      </div>
                      {dayEntries
                        .filter((e) => e.work_period_id === p.id)
                        .map((e) => (
                          <button
                            key={e.id}
                            className="entry-row"
                            onClick={() => open("entry", e)}
                          >
                            <span className={`entry-kind ${e.kind}`}>
                              {e.kind === "task" ? (
                                <ListTodo size={16} />
                              ) : e.kind === "meal" ? (
                                <Utensils size={16} />
                              ) : (
                                <Coffee size={16} />
                              )}
                            </span>
                            <span className="entry-detail">
                              <strong>{entryName(e)}</strong>
                              <small>
                                {new Intl.DateTimeFormat("es-ES", {
                                  timeZone: zone,
                                  hour: "2-digit",
                                  minute: "2-digit",
                                }).format(new Date(e.started_at))}{" "}
                                —{" "}
                                {e.ended_at
                                  ? new Intl.DateTimeFormat("es-ES", {
                                      timeZone: zone,
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    }).format(new Date(e.ended_at))
                                  : "Activo"}
                                {e.note ? ` · ${e.note}` : ""}
                              </small>
                            </span>
                            <span className="entry-duration">
                              {duration(actual(e))}
                            </span>
                            <MoreHorizontal size={18} />
                          </button>
                        ))}
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="Día sin tramos"
                  description="Inicia la jornada o añade un tramo de presencia histórico."
                />
              )}
            </section>
          </div>
          <div className="side-stack">
            <section className="panel day-summary">
              <span className="eyebrow">BALANCE DIARIO</span>
              <h2>Tiempo de hoy</h2>
              <div className="summary-number">
                {duration(dayNet)}
                <small>trabajo neto</small>
              </div>
              <div className="summary-rows">
                <div>
                  <span>Objetivo</span>
                  <strong>{duration((day?.target_minutes || 0) * 60)}</strong>
                </div>
                <div>
                  <span>Presencia</span>
                  <strong>{duration(dayPresence)}</strong>
                </div>
                <div>
                  <span>Registrado</span>
                  <strong>{duration(dayRegistered)}</strong>
                </div>
                <div className={gaps ? "warning" : ""}>
                  <span>Sin clasificar</span>
                  <strong>{duration(gaps)}</strong>
                </div>
              </div>
              <button
                className="text-link"
                onClick={() =>
                  open("target", day || { work_date: selectedDate })
                }
              >
                Ajustar objetivo diario <ArrowRight size={15} />
              </button>
              <div className="progress-line" style={{ marginTop: 17 }}>
                <span
                  style={{
                    width: `${Math.min(100, day?.target_minutes ? (dayNet / (day.target_minutes * 60)) * 100 : 0)}%`,
                  }}
                />
              </div>
              <button
                className="btn secondary full"
                onClick={() =>
                  void run(async () => {
                    const d = day || (await ensureDay(selectedDate));
                    await unwrap(
                      supabase.rpc("review_work_day", {
                        p_id: d.id,
                        p_note: null,
                      }),
                    );
                  }, "Jornada marcada como revisada.")
                }
                disabled={
                  dayPeriods.some((p) => !p.ended_at) ||
                  dayEntries.some((e) => !e.ended_at)
                }
              >
                <Check size={16} />{" "}
                {reviewed(day || {}) ? "Revisada" : "Marcar como revisada"}
              </button>
              {gaps > 0 && (
                <p className="side-note">
                  Quedan {duration(gaps)} de presencia sin clasificar.
                </p>
              )}
            </section>
            {forDay.length > 0 && (
              <section className="panel">
                <span className="eyebrow">CALENDARIO</span>
                <h2>Eventos del día</h2>
                {forDay.map((e) => (
                  <div className="simple-row" key={e.id}>
                    <span className={`event-dot ${e.kind}`} />
                    {e.title}
                  </div>
                ))}
              </section>
            )}
          </div>
        </div>
      </>
    );
  }
  function TasksPage() {
    const filtered = data.tasks
      .filter(
        (t) =>
          (taskFilter === "all" ||
            (taskFilter === "archived"
              ? !!t.archived_at
              : taskFilter === "active"
                ? !t.archived_at
                : t.status === taskFilter)) &&
          (!taskProjectFilter || t.project_id === taskProjectFilter) &&
          `${t.id} ${t.title} ${t.description || ""} ${data.notes
            .filter((n) => n.task_id === t.id)
            .map((n) => n.body)
            .join(" ")}`
            .toLowerCase()
            .includes(taskQuery.toLowerCase()),
      )
      .sort((a, b) =>
        taskSort === "name"
          ? a.title.localeCompare(b.title)
          : taskSort === "due"
            ? (a.due_date || "9999").localeCompare(b.due_date || "9999")
            : taskSort === "time"
              ? taskSeconds(b.id) - taskSeconds(a.id)
              : b.updated_at.localeCompare(a.updated_at),
      );
    function taskSeconds(id: string) {
      return data.entries
        .filter((e) => e.task_id === id)
        .reduce((n, e) => n + actual(e), 0);
    }
    const task = data.tasks.find((t) => t.id === selectedTask);
    return (
      <>
        <PageHead
          eyebrow="ORGANIZACIÓN / TRABAJO"
          title="Tareas"
          subtitle="Todas tus tareas y el tiempo invertido en cada una."
          action={
            <button
              className="btn primary"
              onClick={() => open("task")}
              disabled={!data.projects.some((p) => !p.archived_at)}
            >
              <Plus size={17} /> Nueva tarea
            </button>
          }
        />
        {!data.projects.some((p) => !p.archived_at) && (
          <div className="inline-info">
            Para crear una tarea, crea primero un proyecto.{" "}
            <button onClick={() => open("project")}>
              Crear proyecto <ArrowRight size={14} />
            </button>
          </div>
        )}
        <div className="toolbar">
          <div className="searchbox">
            <Search size={18} />
            <input
              placeholder="Buscar por código, título o notas..."
              value={taskQuery}
              onChange={(e) => setTaskQuery(e.target.value)}
            />
          </div>
          <select
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="active">No archivadas</option>
            <option value="all">Todas</option>
            <option value="todo">Por hacer</option>
            <option value="in_progress">En curso</option>
            <option value="blocked">Bloqueadas</option>
            <option value="done">Terminadas</option>
            <option value="archived">Archivadas</option>
          </select>
          <select
            value={taskProjectFilter}
            onChange={(e) => setTaskProjectFilter(e.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={taskSort}
            onChange={(e) => setTaskSort(e.target.value)}
          >
            <option value="updated">Más recientes</option>
            <option value="name">Nombre</option>
            <option value="due">Vencimiento</option>
            <option value="time">Más tiempo</option>
          </select>
        </div>
        {filtered.length ? (
          <div className="table-panel">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>TAREA</th>
                    <th>PROYECTO</th>
                    <th>ESTADO</th>
                    <th>VENCIMIENTO</th>
                    <th>TIEMPO REAL</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr
                      key={t.id}
                      onClick={() => setSelectedTask(t.id)}
                      className={selectedTask === t.id ? "selected" : ""}
                    >
                      <td>
                        <span className="task-id">{t.id}</span>
                        <strong>{t.title}</strong>
                        {t.archived_at && <small>Archivada</small>}
                      </td>
                      <td>{projectName(t.project_id)}</td>
                      <td>
                        <span className={`state-tag ${t.status}`}>
                          {taskStatus[t.status]}
                        </span>
                      </td>
                      <td>{t.due_date ? dateLabel(t.due_date) : "—"}</td>
                      <td className="mono">{duration(taskSeconds(t.id))}</td>
                      <td>
                        <ArrowRight size={17} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <Empty
            title="No hay tareas para esta vista"
            description="Cambia los filtros o crea una tarea nueva."
          />
        )}
        {task && (
          <div
            className="detail-backdrop"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setSelectedTask(null);
            }}
          >
            <aside className="detail-drawer">
              <div className="drawer-top">
                <span className="task-id">{task.id}</span>
                <IconButton
                  title="Cerrar detalle"
                  onClick={() => setSelectedTask(null)}
                >
                  <X size={20} />
                </IconButton>
              </div>
              <h2>{task.title}</h2>
              <span className={`state-tag ${task.status}`}>
                {taskStatus[task.status]}
              </span>
              <p className="drawer-description">
                {task.description || "Sin descripción."}
              </p>
              <div className="drawer-stats">
                <div>
                  <span>Proyecto</span>
                  <strong>{projectName(task.project_id)}</strong>
                </div>
                <div>
                  <span>Estimación</span>
                  <strong>
                    {task.estimate_minutes != null
                      ? duration(task.estimate_minutes * 60)
                      : "—"}
                  </strong>
                </div>
                <div>
                  <span>Tiempo real</span>
                  <strong>{duration(taskSeconds(task.id))}</strong>
                </div>
                <div>
                  <span>Partes</span>
                  <strong>
                    {data.entries.filter((e) => e.task_id === task.id).length}
                  </strong>
                </div>
              </div>
              <div className="drawer-actions">
                <button
                  className="btn primary"
                  onClick={() => open("task", task)}
                >
                  Editar tarea
                </button>
                <button
                  className="btn secondary"
                  onClick={() =>
                    void run(
                      () =>
                        unwrap(
                          supabase
                            .from("tasks")
                            .update({
                              archived_at: task.archived_at
                                ? null
                                : new Date().toISOString(),
                            })
                            .eq("user_id", userId!)
                            .eq("id", task.id),
                        ),
                      task.archived_at
                        ? "Tarea restaurada."
                        : "Tarea archivada.",
                    )
                  }
                >
                  {task.archived_at ? "Restaurar" : "Archivar"}
                </button>
              </div>
              <h3>Notas</h3>
              <div className="notes-list">
                {data.notes
                  .filter((n) => n.task_id === task.id)
                  .sort((a, b) => b.created_at.localeCompare(a.created_at))
                  .map((n) => (
                    <div className="note" key={n.id}>
                      <p>{n.body}</p>
                      <small>
                        {dateLabel(n.created_at, zone, { year: "numeric" })}
                      </small>
                    </div>
                  ))}
              </div>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const body = (
                    new FormData(form).get("body") as string
                  ).trim();
                  if (body)
                    void run(async () => {
                      await unwrap(
                        supabase
                          .from("task_notes")
                          .insert({ user_id: userId, task_id: task.id, body }),
                      );
                      form.reset();
                    });
                }}
              >
                <input name="body" placeholder="Añadir una nota..." required />
                <button className="btn subtle" title="Guardar nota">
                  <Plus size={17} />
                </button>
              </form>
              <h3>Enlaces</h3>
              {data.links
                .filter((l) => l.task_id === task.id)
                .map((l) => (
                  <a
                    className="link-row"
                    key={l.id}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Link2 size={16} />
                    {l.label || l.url}
                    <ExternalLink size={14} />
                  </a>
                ))}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const url = (new FormData(form).get("url") as string).trim();
                  const existing = data.links.find(
                    (link) => link.normalized_url === canonicalUrl(url),
                  );
                  if (existing?.task_id === task.id) {
                    setMessage("Ese enlace ya está guardado en esta tarea.");
                    form.reset();
                    return;
                  }
                  if (existing) {
                    setMessage("Ese enlace ya pertenece a otra tarea.");
                    return;
                  }
                  if (url)
                    void run(async () => {
                      await unwrap(
                        supabase
                          .from("task_links")
                          .insert({
                            user_id: userId,
                            task_id: task.id,
                            url,
                            normalized_url: url,
                          }),
                      );
                      form.reset();
                    });
                }}
              >
                <input
                  name="url"
                  type="url"
                  placeholder="Pegar URL de Odoo u otra..."
                  required
                />
                <button className="btn subtle" title="Guardar enlace">
                  <Plus size={17} />
                </button>
              </form>
              <h3>Partes de horas</h3>
              {data.entries
                .filter((e) => e.task_id === task.id)
                .sort((a, b) => b.started_at.localeCompare(a.started_at))
                .map((e) => (
                  <button
                    className="history-row"
                    key={e.id}
                    onClick={() => {
                      setSelectedTask(null);
                      open("entry", e);
                    }}
                  >
                    <span>
                      {dateLabel(e.started_at, zone, { year: "numeric" })}
                    </span>
                    <strong>{duration(actual(e))}</strong>
                    <small>
                      {e.rounded_seconds != null
                        ? `${duration(e.rounded_seconds)} redondeado`
                        : "En curso"}
                    </small>
                  </button>
                ))}
              <h3>Historial de correcciones</h3>
              {data.revisions
                .filter((r) =>
                  data.entries.some(
                    (e) => e.id === r.time_entry_id && e.task_id === task.id,
                  ),
                )
                .sort((a, b) => b.changed_at.localeCompare(a.changed_at))
                .map((r) => (
                  <div className="note" key={r.id}>
                    <small>
                      {dateLabel(r.changed_at, zone, { year: "numeric" })} ·{" "}
                      {r.reason || "Parte corregido"}
                    </small>
                  </div>
                ))}
            </aside>
          </div>
        )}
      </>
    );
  }
  function ProjectsPage() {
    const active = data.projects.filter((p) => !p.archived_at);
    return (
      <>
        <PageHead
          eyebrow="ORGANIZACIÓN / ESPACIOS"
          title="Proyectos"
          subtitle="Agrupa el trabajo y revisa el progreso de cada proyecto."
          action={
            <button className="btn primary" onClick={() => open("project")}>
              <Plus size={17} /> Nuevo proyecto
            </button>
          }
        />
        <div className="project-grid">
          {active.map((p) => {
            const tasks = data.tasks.filter(
              (t) => t.project_id === p.id && !t.archived_at,
            );
            const entries = data.entries.filter(
              (e) => e.project_id === p.id && e.kind === "task",
            );
            const complete = tasks.filter((t) => t.status === "done").length;
            return (
              <article className="project-card" key={p.id}>
                <div className="project-card-top">
                  <span
                    className="project-icon"
                    style={{ background: p.color || "#ee3d42" }}
                  >
                    <FolderKanban size={21} />
                  </span>
                  <IconButton
                    title="Editar proyecto"
                    onClick={() => open("project", p)}
                  >
                    <MoreHorizontal size={19} />
                  </IconButton>
                </div>
                <h2>{p.name}</h2>
                <p>{p.description || "Sin descripción"}</p>
                <span className={`state-tag ${p.status}`}>
                  {projectStatus[p.status]}
                </span>
                <div className="project-progress">
                  <div>
                    <span>Progreso</span>
                    <strong>
                      {tasks.length
                        ? Math.round((complete / tasks.length) * 100)
                        : 0}
                      %
                    </strong>
                  </div>
                  <div className="progress-line">
                    <span
                      style={{
                        width: `${tasks.length ? (complete / tasks.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </div>
                <div className="project-footer">
                  <span>{tasks.length} tareas</span>
                  <span>
                    {duration(entries.reduce((n, e) => n + actual(e), 0))}{" "}
                    registradas
                  </span>
                </div>
                <button
                  className="project-open"
                  onClick={() => {
                    setTaskProjectFilter(p.id);
                    setPage("tasks");
                  }}
                >
                  Ver tareas <ArrowRight size={16} />
                </button>
              </article>
            );
          })}
        </div>
        {!active.length && (
          <Empty
            title="Sin proyectos todavía"
            description="Crea un proyecto para empezar a organizar tus tareas."
            action={
              <button className="btn primary" onClick={() => open("project")}>
                <Plus size={16} /> Crear proyecto
              </button>
            }
          />
        )}
        <h3 className="minor-heading">Archivados</h3>
        {data.projects
          .filter((p) => p.archived_at)
          .map((p) => (
            <div className="archived-row" key={p.id}>
              <strong>{p.name}</strong>
              <button
                className="text-link"
                onClick={() =>
                  void run(
                    () =>
                      unwrap(
                        supabase
                          .from("projects")
                          .update({ archived_at: null })
                          .eq("id", p.id)
                          .eq("user_id", userId!),
                      ),
                    "Proyecto restaurado.",
                  )
                }
              >
                Restaurar
              </button>
            </div>
          ))}
      </>
    );
  }
  function CalendarPage() {
    const monthStart = calendarMonth.startOf("month");
    const gridStart = monthStart.startOf("week");
    const cells = Array.from(
      { length: 42 },
      (_, i) => gridStart.plus({ days: i }).toISODate()!,
    );
    const monthLabel = calendarMonth.setLocale("es").toFormat("LLLL yyyy");
    const selectedEvents = data.events.filter((e) =>
      e.all_day
        ? selectedDate >= e.starts_on && selectedDate < e.ends_on
        : selectedDate ===
          DateTime.fromISO(e.starts_at).setZone(zone).toISODate(),
    );
    const due = data.tasks.filter(
      (t) => t.due_date === selectedDate && !t.archived_at,
    );
    const periodDay = data.days.find((d) => d.work_date === selectedDate);
    const selectedPeriods = data.periods.filter(
      (p) => p.work_day_id === periodDay?.id,
    );
    const selectedEntries = data.entries.filter((e) =>
      selectedPeriods.some((p) => p.id === e.work_period_id),
    );
    return (
      <>
        <PageHead
          eyebrow="PLANIFICACIÓN / VISTA MENSUAL"
          title="Calendario"
          subtitle="Jornadas, eventos, festivos y vencimientos en una vista."
          action={
            <button className="btn primary" onClick={() => open("event")}>
              <Plus size={17} /> Nuevo evento
            </button>
          }
        />
        <div className="calendar-layout">
          <section className="panel calendar-panel">
            <div className="calendar-top">
              <h2>{monthLabel}</h2>
              <div className="calendar-controls">
                <button
                  className="btn subtle"
                  onClick={() => {
                    setCalendarMonth(DateTime.now().startOf("month"));
                    setSelectedDate(currentDate);
                  }}
                >
                  Hoy
                </button>
                <IconButton
                  title="Mes anterior"
                  onClick={() =>
                    setCalendarMonth(calendarMonth.minus({ months: 1 }))
                  }
                >
                  <ChevronLeft size={19} />
                </IconButton>
                <IconButton
                  title="Mes siguiente"
                  onClick={() =>
                    setCalendarMonth(calendarMonth.plus({ months: 1 }))
                  }
                >
                  <ChevronRight size={19} />
                </IconButton>
              </div>
            </div>
            <div className="calendar-grid">
              {weekdays.map((w, i) => (
                <div className="weekday" key={i}>
                  {w}
                </div>
              ))}
              {cells.map((date) => {
                const d = data.days.find((x) => x.work_date === date);
                const eventCount = data.events.filter(
                  (e) => e.all_day && date >= e.starts_on && date < e.ends_on,
                ).length;
                const dueCount = data.tasks.filter(
                  (t) => t.due_date === date && !t.archived_at,
                ).length;
                const entries = data.entries.filter((e) =>
                  data.periods.some(
                    (p) => p.work_day_id === d?.id && p.id === e.work_period_id,
                  ),
                );
                return (
                  <button
                    key={date}
                    className={`calendar-cell ${date.slice(0, 7) !== monthStart.toFormat("yyyy-MM") ? "other-month" : ""} ${date === selectedDate ? "selected" : ""} ${date === currentDate ? "today" : ""}`}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span className="cell-number">
                      {Number(date.slice(-2))}
                    </span>
                    <span className="cell-marks">
                      {d && (
                        <i
                          className={`cell-mark ${reviewed(d) ? "reviewed" : "work"}`}
                        />
                      )}{" "}
                      {entries.length > 0 && <i className="cell-mark entry" />}
                      {eventCount > 0 && <i className="cell-mark holiday" />}
                      {dueCount > 0 && <i className="cell-mark due" />}
                    </span>
                    {d && d.target_minutes > 0 && (
                      <small>{duration(d.target_minutes * 60)} obj.</small>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="calendar-legend">
              <span>
                <i className="cell-mark work" /> Jornada
              </span>
              <span>
                <i className="cell-mark entry" /> Partes
              </span>
              <span>
                <i className="cell-mark holiday" /> Evento
              </span>
              <span>
                <i className="cell-mark due" /> Vencimiento
              </span>
            </div>
          </section>
          <section className="panel selected-day">
            <span className="eyebrow">DÍA SELECCIONADO</span>
            <h2>
              {dateLabel(selectedDate, zone, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </h2>
            <div className="selected-target">
              <span>Objetivo diario</span>
              <strong>{duration((periodDay?.target_minutes || 0) * 60)}</strong>
            </div>
            {periodDay && (
              <span
                className={`status-pill ${reviewed(periodDay) ? "done" : ""}`}
              >
                {reviewed(periodDay)
                  ? "Jornada revisada"
                  : "Revisión pendiente"}
              </span>
            )}
            <div className="day-items">
              {selectedEvents.map((e) => (
                <button
                  className="day-item"
                  key={e.id}
                  onClick={() => open("event", e)}
                >
                  <span className={`event-dot ${e.kind}`} />
                  <span>
                    {e.title}
                    <small>{e.kind === "holiday" ? "Festivo" : "Evento"}</small>
                  </span>
                </button>
              ))}
              {due.map((t) => (
                <button
                  className="day-item"
                  key={t.id}
                  onClick={() => {
                    setSelectedTask(t.id);
                    setPage("tasks");
                  }}
                >
                  <span className="event-dot due" />
                  <span>
                    {t.title}
                    <small>Vence {t.id}</small>
                  </span>
                </button>
              ))}
              {selectedEntries.map((e) => (
                <button
                  className="day-item"
                  key={e.id}
                  onClick={() => open("entry", e)}
                >
                  <span className="event-dot entry" />
                  <span>
                    {entryName(e)}
                    <small>{duration(actual(e))}</small>
                  </span>
                </button>
              ))}
              {!selectedEvents.length &&
                !due.length &&
                !selectedEntries.length && (
                  <p className="muted">No hay actividad registrada este día.</p>
                )}
            </div>
            <button
              className="btn secondary full"
              onClick={() => {
                setPage("timer");
              }}
            >
              Abrir jornada <ArrowRight size={16} />
            </button>
          </section>
        </div>
      </>
    );
  }
  function ReportsPage() {
    const [range, setRange] = useState<"day" | "week" | "month">("month");
    const [anchor, setAnchor] = useState(currentDate);
    const [projectFilter, setProjectFilter] = useState("");
    const [taskFilter, setTaskFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [measure, setMeasure] = useState<"real" | "rounded">("real");
    const start = DateTime.fromISO(anchor).startOf(range).toISODate()!;
    const end = DateTime.fromISO(anchor).endOf(range).toISODate()!;
    const days = data.days.filter(
      (d) => d.work_date >= start && d.work_date <= end,
    );
    const periods = data.periods.filter((p) =>
      days.some((d) => d.id === p.work_day_id),
    );
    const entries = data.entries.filter(
      (e) =>
        periods.some((p) => p.id === e.work_period_id) &&
        (!projectFilter || e.project_id === projectFilter) &&
        (!taskFilter || e.task_id === taskFilter) &&
        (!statusFilter ||
          data.tasks.find((t) => t.id === e.task_id)?.status === statusFilter),
    );
    const value = (e: Row) =>
      measure === "rounded" && e.kind === "task" && e.rounded_seconds != null
        ? e.rounded_seconds
        : actual(e);
    const presence = periods.reduce(
      (n, p) => n + seconds(p.started_at, p.ended_at, tick),
      0,
    );
    const net = entries
      .filter((e) => e.counts_as_work)
      .reduce((n, e) => n + actual(e), 0);
    const taskTime = entries
      .filter((e) => e.kind === "task")
      .reduce((n, e) => n + value(e), 0);
    const target = days.reduce((n, d) => n + d.target_minutes * 60, 0);
    const projectTotals = data.projects
      .map((p) => ({
        ...p,
        total: entries
          .filter((e) => e.project_id === p.id && e.kind === "task")
          .reduce((n, e) => n + value(e), 0),
      }))
      .filter((p) => p.total > 0)
      .sort((a, b) => b.total - a.total) as (Row & { total: number })[];
    const max = Math.max(...projectTotals.map((p) => p.total), 1);
    return (
      <>
        <PageHead
          eyebrow="ANÁLISIS / INFORMES"
          title="Informes"
          subtitle="Tiempo real, tiempo aplicado y progreso a partir de tus registros."
        />
        <div className="report-toolbar">
          <div className="segmented">
            {(["day", "week", "month"] as const).map((r) => (
              <button
                className={range === r ? "active" : ""}
                key={r}
                onClick={() => setRange(r)}
              >
                {r === "day" ? "Día" : r === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          <div className="date-controls">
            <IconButton
              title="Periodo anterior"
              onClick={() =>
                setAnchor(
                  DateTime.fromISO(anchor)
                    .minus({ [range + "s"]: 1 })
                    .toISODate()!,
                )
              }
            >
              <ChevronLeft size={18} />
            </IconButton>
            <span>
              {dateLabel(start, zone, { year: "numeric" })}{" "}
              {start !== end &&
                `— ${dateLabel(end, zone, { year: "numeric" })}`}
            </span>
            <IconButton
              title="Periodo siguiente"
              onClick={() =>
                setAnchor(
                  DateTime.fromISO(anchor)
                    .plus({ [range + "s"]: 1 })
                    .toISODate()!,
                )
              }
            >
              <ChevronRight size={18} />
            </IconButton>
          </div>
          <select
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="">Todos los proyectos</option>
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={taskFilter}
            onChange={(e) => setTaskFilter(e.target.value)}
          >
            <option value="">Todas las tareas</option>
            {data.tasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.id} · {t.title}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Todos los estados</option>
            {Object.entries(taskStatus).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <div className="segmented">
            <button
              className={measure === "real" ? "active" : ""}
              onClick={() => setMeasure("real")}
            >
              Real
            </button>
            <button
              className={measure === "rounded" ? "active" : ""}
              onClick={() => setMeasure("rounded")}
            >
              Redondeado
            </button>
          </div>
        </div>
        <div className="metrics-grid">
          <Metric
            label="Presencia"
            value={duration(presence)}
            sub="Tiempo real"
            icon={Clock3}
            accent
          />
          <Metric
            label="Trabajo neto"
            value={duration(net)}
            sub={`${target ? Math.round((net / target) * 100) : 0}% del objetivo`}
            icon={Activity}
          />
          <Metric
            label="Tiempo en tareas"
            value={duration(taskTime)}
            sub={measure === "real" ? "Duración exacta" : "Duración aplicada"}
            icon={ListTodo}
          />
          <Metric
            label="Jornadas revisadas"
            value={`${days.filter(reviewed).length}/${days.length}`}
            sub="En el periodo"
            icon={Check}
          />
        </div>
        <div className="report-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DISTRIBUCIÓN</span>
                <h2>Tiempo por proyecto</h2>
              </div>
            </div>
            {projectTotals.length ? (
              projectTotals.map((p) => (
                <div className="bar-row" key={p.id}>
                  <div>
                    <span>{p.name}</span>
                    <strong>{duration(p.total)}</strong>
                  </div>
                  <div className="bar-track">
                    <span
                      style={{
                        width: `${(p.total / max) * 100}%`,
                        background: p.color || "#ed3f46",
                      }}
                    />
                  </div>
                </div>
              ))
            ) : (
              <Empty
                title="Sin datos en este periodo"
                description="Añade partes de horas para ver la distribución."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DESGLOSE</span>
                <h2>Cómo se invirtió el tiempo</h2>
              </div>
            </div>
            <div className="summary-rows larger">
              <div>
                <span>Tareas</span>
                <strong>
                  {duration(
                    entries
                      .filter((e) => e.kind === "task")
                      .reduce((n, e) => n + actual(e), 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Otros trabajos</span>
                <strong>
                  {duration(
                    entries
                      .filter((e) => e.kind === "custom" && e.counts_as_work)
                      .reduce((n, e) => n + actual(e), 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Descansos</span>
                <strong>
                  {duration(
                    entries
                      .filter((e) => e.kind === "break")
                      .reduce((n, e) => n + actual(e), 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Comida</span>
                <strong>
                  {duration(
                    entries
                      .filter((e) => e.kind === "meal")
                      .reduce((n, e) => n + actual(e), 0),
                  )}
                </strong>
              </div>
              <div>
                <span>Sin clasificar</span>
                <strong>
                  {duration(
                    Math.max(
                      0,
                      presence - entries.reduce((n, e) => n + actual(e), 0),
                    ),
                  )}
                </strong>
              </div>
            </div>
          </section>
        </div>
      </>
    );
  }
  function CalculatorPage() {
    const [start, setStart] = useState(`${currentDate}T09:00`);
    const [end, setEnd] = useState(`${currentDate}T17:00`);
    const [increment, setIncrement] = useState(
      data.preferences?.rounding_increment_minutes || 5,
    );
    const a = DateTime.fromISO(start, { zone });
    const b = DateTime.fromISO(end, { zone });
    const valid = a.isValid && b.isValid && b > a;
    const exact = valid ? Math.floor(b.diff(a, "seconds").seconds) : 0;
    const applied = rounded(exact, increment);
    return (
      <>
        <PageHead
          eyebrow="HERRAMIENTAS / CÁLCULO"
          title="Calculadora de tiempo"
          subtitle="Previsualiza duraciones y redondeos sin guardar datos."
        />
        <div className="calculator-layout">
          <section className="panel calculator-input">
            <span className="eyebrow">INTERVALO</span>
            <h2>¿Cuánto tiempo ha pasado?</h2>
            <div className="form-grid">
              <Field label="Inicio">
                <input
                  type="datetime-local"
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field label="Fin">
                <input
                  type="datetime-local"
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            <Field label="Redondear hacia arriba a">
              <select
                value={increment}
                onChange={(e) => setIncrement(Number(e.target.value))}
              >
                {[0, 5, 10, 15, 30, 60].map((n) => (
                  <option key={n} value={n}>
                    {n ? `${n} minutos` : "Sin redondeo"}
                  </option>
                ))}
              </select>
            </Field>
            <p className="muted">
              Zona horaria: {zone}. Los cambios de hora se calculan con el
              instante real.
            </p>
            {!valid && (
              <p className="form-error">
                La fecha de fin debe ser posterior al inicio.
              </p>
            )}
          </section>
          <section className="panel calculator-results">
            <span className="eyebrow">RESULTADO</span>
            <h2>Duración calculada</h2>
            <div className="calculated">
              <span>Tiempo exacto</span>
              <strong>{valid ? duration(exact, true) : "—"}</strong>
              <small>
                {valid ? decimalHours(exact) : "0,00"} horas decimales
              </small>
            </div>
            <div className="calc-arrow">
              <ArrowDownRight size={23} />
            </div>
            <div className="calculated applied">
              <span>Tiempo redondeado</span>
              <strong>{valid ? duration(applied) : "—"}</strong>
              <small>
                {valid ? decimalHours(applied) : "0,00"} horas decimales
              </small>
            </div>
            <p className="muted">
              Esta herramienta no crea ni modifica partes de horas.
            </p>
          </section>
        </div>
      </>
    );
  }
  function SettingsPage() {
    const [name, setName] = useState(data.profile?.display_name || "");
    const [timezone, setTimezone] = useState(
      data.profile?.timezone || "Europe/Madrid",
    );
    const [increment, setIncrement] = useState(
      data.preferences?.rounding_increment_minutes || 5,
    );
    const currentSchedule = [...data.schedules].sort((a, b) =>
      b.effective_from.localeCompare(a.effective_from),
    )[0];
    return (
      <>
        <PageHead
          eyebrow="PREFERENCIAS / CUENTA"
          title="Ajustes"
          subtitle="Personaliza tu perfil, horario y forma de registrar el tiempo."
        />
        <div className="settings-layout">
          <section className="panel">
            <span className="eyebrow">PERFIL</span>
            <h2>Tu cuenta</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await unwrap(
                    supabase
                      .from("profiles")
                      .update({ display_name: name, timezone })
                      .eq("user_id", userId!),
                  );
                  await unwrap(
                    supabase
                      .from("time_preferences")
                      .update({ rounding_increment_minutes: increment })
                      .eq("user_id", userId!),
                  );
                }, "Preferencias guardadas.");
              }}
            >
              <Field label="Nombre visible">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tu nombre"
                />
              </Field>
              <Field label="Correo electrónico">
                <input value={session!.user.email || ""} disabled />
              </Field>
              <Field label="Zona horaria">
                <input
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  list="timezones"
                  required
                />
                <datalist id="timezones">
                  <option value="Europe/Madrid" />
                  <option value="Europe/London" />
                  <option value="America/Mexico_City" />
                  <option value="America/Bogota" />
                  <option value="America/Argentina/Buenos_Aires" />
                </datalist>
              </Field>
              <Field label="Redondeo de partes de tarea">
                <select
                  value={increment}
                  onChange={(e) => setIncrement(Number(e.target.value))}
                >
                  {[0, 5, 10, 15, 30, 60].map((n) => (
                    <option key={n} value={n}>
                      {n ? `${n} minutos` : "Tiempo exacto"}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn primary" disabled={busy}>
                Guardar cambios
              </button>
            </form>
          </section>
          <div className="side-stack">
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">PLANIFICACIÓN</span>
                  <h2>Horario semanal</h2>
                </div>
                <IconButton
                  title="Nuevo horario"
                  onClick={() => open("schedule")}
                >
                  <Plus size={19} />
                </IconButton>
              </div>
              {currentSchedule ? (
                <>
                  <div className="summary-number">
                    {duration(currentSchedule.weekly_target_minutes * 60)}
                    <small>objetivo semanal</small>
                  </div>
                  <div className="weekday-pills">
                    {weekdays.map((w, i) => (
                      <span
                        className={
                          data.scheduleDays.some(
                            (d) =>
                              d.schedule_id === currentSchedule.id &&
                              d.weekday === i + 1,
                          )
                            ? "on"
                            : ""
                        }
                        key={i}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                  <p className="muted">
                    Desde{" "}
                    {dateLabel(currentSchedule.effective_from, zone, {
                      year: "numeric",
                    })}
                  </p>
                </>
              ) : (
                <p className="muted">
                  Aún no has definido un horario. Las jornadas tendrán objetivo
                  cero.
                </p>
              )}
              <button
                className="btn secondary full"
                onClick={() => open("schedule")}
              >
                <Plus size={16} /> Nueva versión de horario
              </button>
            </section>
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <span className="eyebrow">ACTIVIDADES</span>
                  <h2>Tipos personalizados</h2>
                </div>
                <IconButton title="Nuevo tipo" onClick={() => open("type")}>
                  <Plus size={19} />
                </IconButton>
              </div>
              {data.types
                .filter((t) => !t.archived_at)
                .map((t) => (
                  <button
                    className="type-row"
                    key={t.id}
                    onClick={() => open("type", t)}
                  >
                    <span
                      className="event-dot"
                      style={{ background: t.color || "#ec4146" }}
                    />
                    {t.name}
                    <small>
                      {t.default_counts_as_work ? "Trabajo" : "Pausa"}
                    </small>
                    <MoreHorizontal size={17} />
                  </button>
                ))}
              {!data.types.length && (
                <p className="muted">
                  Puedes añadir reuniones, formación u otras actividades.
                </p>
              )}
            </section>
          </div>
        </div>
      </>
    );
  }
  function Editor() {
    const record = editing || {};
    const form = editForm;
    // Values come from text, numeric, date, and boolean controls.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const set = (key: string, value: any) =>
      setEditForm((prev) => ({ ...prev, [key]: value }));
    const titles: Record<Exclude<Modal, null>, string> = {
      project: record.id ? "Editar proyecto" : "Nuevo proyecto",
      task: record.id ? "Editar tarea" : "Nueva tarea",
      entry: record.id
        ? "Corregir parte"
        : record.timer
          ? "Iniciar actividad"
          : "Añadir parte",
      period: record.id ? "Editar tramo" : "Añadir tramo",
      event: record.id ? "Editar evento" : "Nuevo evento",
      type: record.id ? "Editar tipo" : "Nuevo tipo de actividad",
      schedule: "Nuevo horario semanal",
      target: "Objetivo de jornada",
    };
    const save = (event: FormEvent) => {
      event.preventDefault();
      void run(async () => {
        if (modal === "project") {
          const values = {
            name: form.name.trim(),
            description: form.description || null,
            color: form.color,
            status: form.status,
          };
          if (record.id)
            await unwrap(
              supabase
                .from("projects")
                .update(values)
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else
            await unwrap(
              supabase.from("projects").insert({ ...values, user_id: userId }),
            );
        } else if (modal === "task") {
          const existingLink = form.link_url?.trim()
            ? data.links.find(
                (link) => link.normalized_url === canonicalUrl(form.link_url),
              )
            : null;
          if (existingLink && existingLink.task_id !== record.id)
            throw new Error("Ese enlace ya pertenece a otra tarea.");
          const values = {
            title: form.title.trim(),
            project_id: form.project_id,
            description: form.description || null,
            status: form.status,
            priority: form.priority || null,
            estimate_minutes:
              form.estimate_minutes === ""
                ? null
                : Number(form.estimate_minutes),
            due_date: form.due_date || null,
          };
          let taskId = record.id;
          if (record.id)
            await unwrap(
              supabase
                .from("tasks")
                .update(values)
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else {
            const created = await unwrap(
              supabase
                .from("tasks")
                .insert({ ...values, user_id: userId })
                .select("id")
                .single(),
            );
            if (!created) throw new Error("No se pudo crear la tarea.");
            taskId = created.id;
          }
          if (form.link_url?.trim() && !existingLink)
            await unwrap(
              supabase
                .from("task_links")
                .insert({
                  user_id: userId,
                  task_id: taskId,
                  url: form.link_url.trim(),
                  normalized_url: form.link_url.trim(),
                  label: form.link_label.trim() || null,
                }),
            );
        } else if (modal === "period") {
          const d = await ensureDay(form.work_date);
          const values = {
            work_day_id: d.id,
            started_at: toInstant(form.started_at, zone),
            ended_at: form.ended_at ? toInstant(form.ended_at, zone) : null,
            note: form.note || null,
          };
          if (record.id)
            await unwrap(
              supabase
                .from("work_periods")
                .update(values)
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else
            await unwrap(
              supabase
                .from("work_periods")
                .insert({ ...values, user_id: userId }),
            );
          setSelectedDate(d.work_date);
        } else if (modal === "entry") {
          if (record.timer) {
            await unwrap(
              supabase.rpc("start_entry", {
                p_period_id: form.work_period_id,
                p_kind: form.kind,
                p_task_id: form.kind === "task" ? form.task_id : null,
                p_activity_type_id:
                  form.kind === "custom" ? form.activity_type_id : null,
                p_note: form.note || null,
              }),
            );
          } else {
            const periodId = form.work_period_id;
            if (!periodId)
              throw new Error(
                "Elige un tramo de presencia antes de guardar el parte.",
              );
            const task = data.tasks.find((t) => t.id === form.task_id);
            const custom = data.types.find(
              (t) => t.id === form.activity_type_id,
            );
            const values = {
              work_period_id: periodId,
              kind: form.kind,
              task_id: form.kind === "task" ? form.task_id : null,
              activity_type_id:
                form.kind === "custom" ? form.activity_type_id : null,
              project_id:
                form.kind === "task"
                  ? record.id
                    ? form.project_id || null
                    : task?.project_id || null
                  : null,
              counts_as_work:
                form.kind === "task" ||
                (form.kind === "custom" &&
                  (record.id
                    ? record.counts_as_work
                    : !!custom?.default_counts_as_work)),
              started_at: toInstant(form.started_at, zone),
              ended_at: form.ended_at ? toInstant(form.ended_at, zone) : null,
              note: form.note || null,
            };
            if (record.id)
              await unwrap(
                supabase.rpc("correct_time_entry", {
                  p_id: record.id,
                  p_period_id: values.work_period_id,
                  p_kind: values.kind,
                  p_task_id: values.task_id,
                  p_activity_type_id: values.activity_type_id,
                  p_project_id: values.project_id,
                  p_counts_as_work: values.counts_as_work,
                  p_started_at: values.started_at,
                  p_ended_at: values.ended_at,
                  p_note: values.note,
                  p_reason: form.reason || null,
                }),
              );
            else
              await unwrap(
                supabase
                  .from("time_entries")
                  .insert({ ...values, user_id: userId }),
              );
          }
        } else if (modal === "event") {
          const values = {
            kind: form.kind,
            title: form.title.trim(),
            description: form.description || null,
            all_day: form.all_day,
            starts_on: form.all_day ? form.starts_on : null,
            ends_on: form.all_day ? form.ends_on : null,
            starts_at: form.all_day ? null : toInstant(form.starts_at, zone),
            ends_at: form.all_day ? null : toInstant(form.ends_at, zone),
            timezone: zone,
            affects_work_target:
              form.kind === "holiday" && form.affects_work_target,
          };
          if (record.id)
            await unwrap(
              supabase
                .from("calendar_events")
                .update(values)
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else
            await unwrap(
              supabase
                .from("calendar_events")
                .insert({ ...values, user_id: userId }),
            );
        } else if (modal === "type") {
          const values = {
            name: form.name.trim(),
            color: form.color,
            default_counts_as_work: form.default_counts_as_work,
          };
          if (record.id)
            await unwrap(
              supabase
                .from("activity_types")
                .update(values)
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else
            await unwrap(
              supabase
                .from("activity_types")
                .insert({ ...values, user_id: userId }),
            );
        } else if (modal === "schedule") {
          if (form.weekly_target_minutes > 0 && form.weekdays.length === 0)
            throw new Error("Elige al menos un día laborable.");
          await unwrap(
            supabase.rpc("create_work_schedule", {
              p_effective_from: form.effective_from,
              p_weekly_target_minutes: Number(form.weekly_target_minutes),
              p_weekdays: form.weekdays,
            }),
          );
        } else if (modal === "target") {
          const d = await ensureDay(record.work_date || selectedDate);
          await unwrap(
            supabase
              .from("work_days")
              .update({
                target_minutes: Number(form.target_minutes),
                target_source: "manual",
              })
              .eq("id", d.id)
              .eq("user_id", userId!),
          );
        }
      }, "Cambios guardados.");
    };
    const remove = () => {
      if (
        !record.id ||
        !modal ||
        !window.confirm(
          "¿Quieres eliminar este registro? Esta acción no se puede deshacer.",
        )
      )
        return;
      void run(
        async () => {
          if (modal === "type")
            await unwrap(
              supabase
                .from("activity_types")
                .update({ archived_at: new Date().toISOString() })
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          else {
            const table =
              modal === "entry"
                ? "time_entries"
                : modal === "period"
                  ? "work_periods"
                  : "calendar_events";
            await unwrap(
              supabase
                .from(table)
                .delete()
                .eq("id", record.id)
                .eq("user_id", userId!),
            );
          }
        },
        modal === "type" ? "Tipo archivado." : "Registro eliminado.",
      );
    };
    return (
      <ModalShell
        title={titles[modal!]}
        onClose={() => setModal(null)}
        wide={modal === "entry" || modal === "task"}
      >
        <form className="modal-form" onSubmit={save}>
          {modal === "project" && (
            <>
              <Field label="Nombre del proyecto">
                <input
                  autoFocus
                  required
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label="Descripción">
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <div className="form-grid">
                <Field label="Estado">
                  <Select
                    value={form.status}
                    onChange={(v) => set("status", v)}
                  >
                    {Object.entries(projectStatus).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Color">
                  <input
                    type="color"
                    value={form.color}
                    onChange={(e) => set("color", e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          {modal === "task" && (
            <>
              <div className="form-grid">
                <Field label="Título">
                  <input
                    autoFocus
                    required
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                  />
                </Field>
                <Field label="Proyecto">
                  <Select
                    value={form.project_id}
                    onChange={(v) => set("project_id", v)}
                    required
                  >
                    <option value="">Elegir proyecto</option>
                    {data.projects
                      .filter((p) => !p.archived_at || p.id === form.project_id)
                      .map((p) => (
                        <option value={p.id} key={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
              <Field label="Descripción">
                <textarea
                  rows={4}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <div className="form-grid three">
                <Field label="Estado">
                  <Select
                    value={form.status}
                    onChange={(v) => set("status", v)}
                  >
                    {Object.entries(taskStatus).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Prioridad">
                  <Select
                    value={form.priority}
                    onChange={(v) => set("priority", v)}
                  >
                    <option value="">Sin prioridad</option>
                    <option value="low">Baja</option>
                    <option value="medium">Media</option>
                    <option value="high">Alta</option>
                    <option value="urgent">Urgente</option>
                  </Select>
                </Field>
                <Field label="Estimación (min)">
                  <input
                    type="number"
                    min="0"
                    value={form.estimate_minutes}
                    onChange={(e) => set("estimate_minutes", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Vencimiento">
                <input
                  type="date"
                  value={form.due_date}
                  onChange={(e) => set("due_date", e.target.value)}
                />
              </Field>
              <div className="form-grid">
                <Field label="URL vinculada (opcional)">
                  <input
                    type="url"
                    placeholder="https://..."
                    value={form.link_url}
                    onChange={(e) => set("link_url", e.target.value)}
                  />
                </Field>
                <Field label="Etiqueta del enlace">
                  <input
                    value={form.link_label}
                    onChange={(e) => set("link_label", e.target.value)}
                  />
                </Field>
              </div>
            </>
          )}
          {modal === "period" && (
            <>
              <Field label="Fecha de jornada">
                <input
                  type="date"
                  value={form.work_date}
                  onChange={(e) => set("work_date", e.target.value)}
                  required
                />
              </Field>
              <div className="form-grid">
                <Field label="Inicio">
                  <input
                    type="datetime-local"
                    value={form.started_at}
                    onChange={(e) => set("started_at", e.target.value)}
                    required
                  />
                </Field>
                <Field label="Fin">
                  <input
                    type="datetime-local"
                    value={form.ended_at}
                    onChange={(e) => set("ended_at", e.target.value)}
                  />
                </Field>
              </div>
              <Field label="Nota">
                <input
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </Field>
            </>
          )}
          {modal === "entry" && (
            <>
              <div className="form-grid">
                <Field label="Tipo">
                  <Select value={form.kind} onChange={(v) => set("kind", v)}>
                    <option value="task">Tarea</option>
                    <option value="break">Descanso</option>
                    <option value="meal">Comida</option>
                    <option value="custom">Personalizado</option>
                  </Select>
                </Field>
                <Field label="Tramo de presencia">
                  <Select
                    value={form.work_period_id}
                    onChange={(v) => set("work_period_id", v)}
                    required
                  >
                    <option value="">Elegir tramo</option>
                    {data.periods
                      .filter((p) => (record.timer ? !p.ended_at : true))
                      .map((p) => (
                        <option value={p.id} key={p.id}>
                          {dateLabel(
                            data.days.find((d) => d.id === p.work_day_id)
                              ?.work_date || p.started_at,
                          )}{" "}
                          ·{" "}
                          {new Intl.DateTimeFormat("es-ES", {
                            timeZone: zone,
                            hour: "2-digit",
                            minute: "2-digit",
                          }).format(new Date(p.started_at))}
                        </option>
                      ))}
                  </Select>
                </Field>
              </div>
              {form.kind === "task" && (
                <Field label="Tarea">
                  <Select
                    value={form.task_id}
                    onChange={(v) => set("task_id", v)}
                    required
                  >
                    <option value="">Elegir tarea</option>
                    {data.tasks
                      .filter((t) => !t.archived_at || t.id === form.task_id)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.id} · {t.title}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              {form.kind === "custom" && (
                <Field label="Actividad">
                  <Select
                    value={form.activity_type_id}
                    onChange={(v) => set("activity_type_id", v)}
                    required
                  >
                    <option value="">Elegir tipo</option>
                    {data.types
                      .filter(
                        (t) => !t.archived_at || t.id === form.activity_type_id,
                      )
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </Select>
                </Field>
              )}
              {form.kind === "task" && record.id && (
                <Field label="Atribución histórica">
                  <Select
                    value={form.project_id}
                    onChange={(v) => set("project_id", v)}
                  >
                    <option value="">Sin proyecto</option>
                    {data.projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {!record.timer && (
                <div className="form-grid">
                  <Field label="Inicio">
                    <input
                      type="datetime-local"
                      value={form.started_at}
                      onChange={(e) => set("started_at", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Fin">
                    <input
                      type="datetime-local"
                      value={form.ended_at}
                      onChange={(e) => set("ended_at", e.target.value)}
                      required
                    />
                  </Field>
                </div>
              )}
              <Field label="Nota">
                <textarea
                  rows={2}
                  value={form.note}
                  onChange={(e) => set("note", e.target.value)}
                />
              </Field>
              {record.id && (
                <Field label="Motivo de la corrección (opcional)">
                  <input
                    value={form.reason}
                    onChange={(e) => set("reason", e.target.value)}
                    placeholder="Qué se ha corregido"
                  />
                </Field>
              )}
            </>
          )}
          {modal === "event" && (
            <>
              <div className="form-grid">
                <Field label="Tipo">
                  <Select
                    value={form.kind}
                    onChange={(v) => {
                      set("kind", v);
                      if (v === "holiday") set("all_day", true);
                    }}
                  >
                    <option value="event">Evento</option>
                    <option value="holiday">Festivo</option>
                  </Select>
                </Field>
                <Field label="Título">
                  <input
                    value={form.title}
                    onChange={(e) => set("title", e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field label="Descripción">
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={form.all_day}
                  disabled={form.kind === "holiday"}
                  onChange={(e) => set("all_day", e.target.checked)}
                />{" "}
                Todo el día
              </label>
              {form.all_day ? (
                <div className="form-grid">
                  <Field label="Desde">
                    <input
                      type="date"
                      value={form.starts_on}
                      onChange={(e) => set("starts_on", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Hasta (exclusivo)">
                    <input
                      type="date"
                      value={form.ends_on}
                      onChange={(e) => set("ends_on", e.target.value)}
                      required
                    />
                  </Field>
                </div>
              ) : (
                <div className="form-grid">
                  <Field label="Inicio">
                    <input
                      type="datetime-local"
                      value={form.starts_at}
                      onChange={(e) => set("starts_at", e.target.value)}
                      required
                    />
                  </Field>
                  <Field label="Fin">
                    <input
                      type="datetime-local"
                      value={form.ends_at}
                      onChange={(e) => set("ends_at", e.target.value)}
                      required
                    />
                  </Field>
                </div>
              )}
              {form.kind === "holiday" && (
                <label className="check-field">
                  <input
                    type="checkbox"
                    checked={form.affects_work_target}
                    onChange={(e) =>
                      set("affects_work_target", e.target.checked)
                    }
                  />{" "}
                  Objetivo laboral cero esos días
                </label>
              )}
            </>
          )}
          {modal === "type" && (
            <>
              <Field label="Nombre">
                <input
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  required
                />
              </Field>
              <Field label="Color">
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => set("color", e.target.value)}
                />
              </Field>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={form.default_counts_as_work}
                  onChange={(e) =>
                    set("default_counts_as_work", e.target.checked)
                  }
                />{" "}
                Cuenta como trabajo neto
              </label>
            </>
          )}
          {modal === "schedule" && (
            <>
              <Field label="Vigente desde">
                <input
                  type="date"
                  value={form.effective_from}
                  onChange={(e) => set("effective_from", e.target.value)}
                  min={
                    DateTime.fromISO(currentDate).plus({ days: 1 }).toISODate()!
                  }
                  required
                />
              </Field>
              <Field
                label="Objetivo semanal (minutos)"
                hint="37,5 horas equivalen a 2250 minutos."
              >
                <input
                  type="number"
                  min="0"
                  value={form.weekly_target_minutes}
                  onChange={(e) => set("weekly_target_minutes", e.target.value)}
                  required
                />
              </Field>
              <Field label="Días laborables">
                <div className="weekday-checks">
                  {weekdays.map((w, i) => (
                    <label key={i}>
                      <input
                        type="checkbox"
                        checked={form.weekdays.includes(i + 1)}
                        onChange={() =>
                          set(
                            "weekdays",
                            form.weekdays.includes(i + 1)
                              ? form.weekdays.filter((n: number) => n !== i + 1)
                              : [...form.weekdays, i + 1].sort(),
                          )
                        }
                      />
                      {w}
                    </label>
                  ))}
                </div>
              </Field>
            </>
          )}
          {modal === "target" && (
            <>
              <p className="muted">
                El objetivo manual tendrá prioridad sobre el horario y los
                festivos en esta jornada.
              </p>
              <Field label="Objetivo diario (minutos)">
                <input
                  type="number"
                  min="0"
                  value={form.target_minutes}
                  onChange={(e) => set("target_minutes", e.target.value)}
                  required
                />
              </Field>
            </>
          )}
          <div className="modal-footer">
            {record.id &&
              ["entry", "period", "event", "type"].includes(modal!) && (
                <button type="button" className="btn danger" onClick={remove}>
                  {modal === "type" ? "Archivar" : "Eliminar"}
                </button>
              )}
            <button
              type="button"
              className="btn secondary"
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>
            <button className="btn primary" type="submit" disabled={busy}>
              {record.timer ? "Iniciar" : "Guardar cambios"}{" "}
              <ArrowRight size={16} />
            </button>
          </div>
        </form>
      </ModalShell>
    );
  }
}

function Auth() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage("");
    try {
      if (mode === "login")
        await unwrap(supabase.auth.signInWithPassword({ email, password }));
      else if (mode === "signup") {
        await unwrap(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: { display_name: name },
              emailRedirectTo: window.location.origin,
            },
          }),
        );
        setMessage(
          "Revisa tu correo para confirmar la cuenta, si tu proyecto requiere confirmación.",
        );
      } else {
        await unwrap(
          supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin,
          }),
        );
        setMessage(
          "Si existe una cuenta con ese correo, recibirás un enlace para restablecer la contraseña.",
        );
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      setLoading(false);
    }
  };
  return (
    <div className="auth-screen">
      <div className="auth-art">
        <div className="brand big">
          <span className="brand-symbol">
            C<span>.</span>
          </span>
          <span>chambapp</span>
        </div>
        <div className="auth-art-copy">
          <span className="eyebrow">TRABAJA CON CLARIDAD</span>
          <h1>
            Tu tiempo
            <br />
            tiene <em>valor.</em>
          </h1>
          <p>
            Una forma más clara de organizar proyectos, registrar cada minuto y
            entender cómo avanza tu trabajo.
          </p>
        </div>
        <div className="auth-orbit orbit-one" />
        <div className="auth-orbit orbit-two" />
        <div className="auth-art-footer">PROYECTOS · TIEMPO · ENFOQUE</div>
      </div>
      <div className="auth-form-area">
        <div className="auth-form-box">
          <span className="eyebrow">BIENVENIDO A CHAMBAPP</span>
          <h2>
            {mode === "login"
              ? "Accede a tu espacio"
              : mode === "signup"
                ? "Crea tu cuenta"
                : "Recupera tu cuenta"}
          </h2>
          <p>
            {mode === "login"
              ? "Todo tu trabajo, en un solo lugar."
              : mode === "signup"
                ? "Empieza a registrar tu trabajo con claridad."
                : "Te enviaremos un enlace a tu correo."}
          </p>
          <form onSubmit={submit}>
            {mode === "signup" && (
              <Field label="Nombre">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                />
              </Field>
            )}
            <Field label="Correo electrónico">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="tu@correo.com"
              />
            </Field>
            {mode !== "reset" && (
              <Field label="Contraseña">
                <input
                  type="password"
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  placeholder="••••••••"
                />
              </Field>
            )}
            {message && (
              <div className="auth-message" role="status">
                {message}
              </div>
            )}
            <button className="btn primary full large" disabled={loading}>
              {mode === "login"
                ? "Entrar"
                : mode === "signup"
                  ? "Crear cuenta"
                  : "Enviar enlace"}{" "}
              <ArrowRight size={17} />
            </button>
          </form>
          <div className="auth-links">
            {mode === "login" ? (
              <>
                <button onClick={() => setMode("signup")}>
                  Crear una cuenta
                </button>
                <button onClick={() => setMode("reset")}>
                  ¿Olvidaste la contraseña?
                </button>
              </>
            ) : (
              <button onClick={() => setMode("login")}>
                Volver a iniciar sesión
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
function PasswordRecovery({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="loading-screen">
      <div className="brand big">
        <span className="brand-symbol">
          C<span>.</span>
        </span>
        <span>chambapp</span>
      </div>
      <div className="recovery-box">
        <span className="eyebrow">SEGURIDAD</span>
        <h1>Elige una nueva contraseña</h1>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setLoading(true);
            try {
              await unwrap(supabase.auth.updateUser({ password }));
              onDone();
            } catch (error) {
              setMessage(errorText(error));
            } finally {
              setLoading(false);
            }
          }}
        >
          <Field label="Nueva contraseña">
            <input
              type="password"
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </Field>
          {message && <p className="form-error">{message}</p>}
          <button className="btn primary full" disabled={loading}>
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  );
}
export default App;
