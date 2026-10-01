import {
  Activity, ArrowDown, ArrowRight, ArrowUpRight, Bell, CalendarDays, Check,
  CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3, CodeXml, Download,
  Eye, EyeOff, FileText, Flag, FolderKanban, Gauge, Globe2, Grid2X2,
  Info, ListChecks, LockKeyhole, LogOut, Menu, MoreHorizontal, Pause, Pencil,
  Play, Plus, Search, Settings2, ShieldCheck, Square, Timer, Trash2, UserRound,
  Wallet, X, Zap,
} from 'lucide-react';

const icons = {
  activity: Activity, down: ArrowDown, arrow: ArrowRight, up: ArrowUpRight,
  bell: Bell, calendar: CalendarDays, check: Check, verified: CheckCircle2,
  chevron: ChevronDown, left: ChevronLeft, right: ChevronRight, clock: Clock3,
  download: Download, eye: Eye, eyeOff: EyeOff, file: FileText, flag: Flag,
  folder: FolderKanban, gauge: Gauge, github: CodeXml, globe: Globe2, grid: Grid2X2,
  info: Info, tasks: ListChecks, lock: LockKeyhole, logout: LogOut, menu: Menu,
  more: MoreHorizontal, pause: Pause, edit: Pencil, play: Play, plus: Plus,
  search: Search, settings: Settings2, shield: ShieldCheck, stop: Square,
  timer: Timer, trash: Trash2, user: UserRound, wallet: Wallet, close: X, zap: Zap,
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 18, className = '' }: { name: IconName; size?: number; className?: string }) {
  const Component = icons[name];
  return <Component size={size} strokeWidth={1.65} aria-hidden="true" className={`icon ${className}`} />;
}
