import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings,
  Folder,
  DownloadCloud,
  Cpu,
  Wifi,
  RefreshCw,
  Shield,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  ArrowLeft,
  Loader2,
  KeyRound,
  Trash2,
  Search,
  History,
  X,
  Sliders,
  Volume2,
  Film,
  Check,
  Sparkles,
  Upload,
  FileText,
  RotateCcw,
  Bell,
  Palette,
  Layers,
  Globe,
  Plus,
  Minus,
  CheckSquare,
  Square,
  Radio,
  ExternalLink,
  Download,
  Clock,
  AlertTriangle,
  TerminalSquare,
  Copy,
  CopyCheck,
  Archive,
  Eye,
  Music,
  Info
} from 'lucide-react';
import useSettings from '../hooks/useSettings';
import IncognitoIcon from './IncognitoIcon';

const API_BASE = typeof window !== 'undefined' && window.location 
  ? (window.location.port === '5173' ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin)
  : 'http://127.0.0.1:8000';

// ─── Constants & Taxonomy ──────────────────────────────────────────────

const TABS = [
  { id: 'general', label: 'General', icon: Settings, desc: 'Appearance, notifications & quick download defaults' },
  { id: 'directories', label: 'Directories & Templates', icon: Folder, desc: 'Output paths, subdirectory sorting & filename formatting' },
  { id: 'downloading', label: 'Downloading & Limits', icon: DownloadCloud, desc: 'Concurrency, speed limits, retries & stream resumption' },
  { id: 'formats', label: 'Formats & Processing', icon: Film, desc: 'Default containers, preferred codecs, tags & subtitles' },
  { id: 'sponsorblock', label: 'SponsorBlock', icon: Shield, desc: 'Automatic segment removal & category filtering' },
  { id: 'network', label: 'Network & Proxy', icon: Wifi, desc: 'Proxies, User-Agents, geo-bypass & connection timeouts' },
  { id: 'cookies', label: 'Cookies & Accounts', icon: KeyRound, desc: 'Netscape cookies import & session management' },
  { id: 'potoken', label: 'Proof of Origin (PO Token)', icon: Cpu, desc: 'YouTube BotGuard bypass, BgUtils provider & player clients' },
  { id: 'updates', label: 'Updates & System', icon: RefreshCw, desc: 'yt-dlp version, release channels, backup & restore' },
];

const FILENAME_TOKENS = [
  { token: '%(title)s', label: 'Title', desc: 'Video Title' },
  { token: '%(id)s', label: 'ID', desc: 'Unique Video ID' },
  { token: '%(uploader)s', label: 'Uploader', desc: 'Channel / Artist' },
  { token: '%(resolution)s', label: 'Resolution', desc: 'e.g. 1080p, 4K' },
  { token: '%(ext)s', label: 'Ext', desc: 'File Extension (mp4, mkv)' },
  { token: '%(upload_date)s', label: 'Date', desc: 'YYYYMMDD' },
  { token: '%(playlist_title)s', label: 'Playlist', desc: 'Playlist Title' },
  { token: '%(playlist_index)s', label: 'Index', desc: 'Track / Order number' },
  { token: '%(epoch)s', label: 'Timestamp', desc: 'Unix Timestamp' },
  { token: '%(format_id)s', label: 'Format', desc: 'Stream Format ID' },
];

const SUBDIR_TOKENS = [
  { token: '%(uploader)s', label: 'Uploader / Artist', desc: 'Channel or Artist folder' },
  { token: '%(playlist_title)s', label: 'Playlist Name', desc: 'Album or Playlist subfolder' },
  { token: '%(extractor)s', label: 'Platform', desc: 'e.g. youtube, soundcloud' },
  { token: '%(upload_date>%Y-%m)s', label: 'Year-Month', desc: 'Folder by upload date' },
];

const SPONSORBLOCK_CATEGORIES = [
  {
    id: 'sponsor',
    label: 'Sponsor',
    desc: 'Paid promotion, paid product placement, commercial endorsements',
    badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  {
    id: 'intro',
    label: 'Intermission / Intro',
    desc: 'Visual animated intro, title cards, or interval sequence',
    badge: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  },
  {
    id: 'outro',
    label: 'Endcards / Outro',
    desc: 'End credits, video endcards, and channel closing sequences',
    badge: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  },
  {
    id: 'selfpromo',
    label: 'Self Promotion',
    desc: 'Unpaid promotion of creator merchandise, Patreon, socials, etc.',
    badge: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  {
    id: 'interaction',
    label: 'Interaction Reminder',
    desc: 'Reminders to subscribe, like, hit the notification bell, or comment',
    badge: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  },
  {
    id: 'preview',
    label: 'Preview & Recap',
    desc: 'Teaser of what comes next in the video or recap of previous parts',
    badge: 'bg-pink-500/10 text-pink-400 border-pink-500/30',
  },
  {
    id: 'music_offtopic',
    label: 'Non-Music Section',
    desc: 'Dialogue, skits, and non-music pauses within music videos',
    badge: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
  },
];

const USER_AGENT_PRESETS = [
  { label: 'Default yt-dlp', value: '' },
  {
    label: 'Chrome 133 (Windows)',
    value:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  },
  {
    label: 'Firefox 134 (Windows)',
    value: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:134.0) Gecko/20100101 Firefox/134.0',
  },
  {
    label: 'Safari 17 (macOS)',
    value:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_7_2) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15',
  },
  {
    label: 'Android Mobile (Pixel 8)',
    value:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Mobile Safari/537.36',
  },
];

const SPEED_PRESETS = [
  { label: 'Unlimited', value: 0 },
  { label: '1 MB/s', value: 1024 },
  { label: '5 MB/s', value: 5120 },
  { label: '10 MB/s', value: 10240 },
  { label: '25 MB/s', value: 25600 },
];

// Helper to simulate filename template
function previewFilename(template) {
  if (!template) return 'Never Gonna Give You Up.mp4';
  return template
    .replace(/%\(title\)s/g, 'Never Gonna Give You Up')
    .replace(/%\(id\)s/g, 'dQw4w9WgXcQ')
    .replace(/%\(uploader\)s/g, 'Rick Astley')
    .replace(/%\(resolution\)s/g, '1080p')
    .replace(/%\(ext\)s/g, 'mp4')
    .replace(/%\(upload_date\)s/g, '20091025')
    .replace(/%\(playlist_title\)s/g, 'Whenever You Need Somebody')
    .replace(/%\(playlist_index\)s/g, '01')
    .replace(/%\(epoch\)s/g, '1710938400')
    .replace(/%\(format_id\)s/g, '137+140');
}

// ─── UI Helper Components ──────────────────────────────────────────────

export function SettingsGroup({ title, description, headerAction, action, badge, children, className = '' }) {
  const finalAction = action || headerAction;
  return (
    <div className={`space-y-2 ${className}`}>
      {(title || description || finalAction) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 px-1 mb-1">
          <div>
            {title && (
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h3>
                {badge && (
                  <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                    {badge}
                  </span>
                )}
              </div>
            )}
            {description && <p className="text-xs text-zinc-500 mt-0.5">{description}</p>}
          </div>
          {finalAction && <div className="flex-shrink-0">{finalAction}</div>}
        </div>
      )}
      <div className="rounded-2xl bg-zinc-900/40 border border-zinc-800/70 divide-y divide-zinc-800/50 overflow-hidden backdrop-blur-sm shadow-sm">
        {children}
      </div>
    </div>
  );
}

export function SettingsRow({ id, children, className = '', onClick }) {
  return (
    <div id={id} data-setting-id={id} onClick={onClick} className={`p-4 sm:px-4.5 sm:py-3.5 transition-colors hover:bg-zinc-800/20 ${className}`}>
      {children}
    </div>
  );
}

export function SettingCard({ id, children, className = '', onClick }) {
  return (
    <div id={id} data-setting-id={id} onClick={onClick} className={`rounded-2xl bg-zinc-900/40 border border-zinc-800/70 overflow-hidden backdrop-blur-sm p-4 sm:px-4.5 sm:py-3.5 ${className}`}>
      {children}
    </div>
  );
}

export function ToggleRow({
  id,
  enabled,
  checked,
  onChange,
  label,
  title,
  description,
  icon: Icon,
  badge,
  badgeColor,
  disabled = false,
  className = '',
  children,
}) {
  const isChecked = Boolean(enabled !== undefined ? enabled : checked);
  const displayTitle = label || title;
  const isIncognito = Icon === IncognitoIcon;
  const handleToggle = () => {
    if (!disabled && onChange) {
      onChange(!isChecked);
    }
  };
  return (
    <div 
      id={id}
      data-setting-id={id}
      onClick={handleToggle}
      className={`p-4 sm:px-4.5 sm:py-3.5 hover:bg-zinc-800/20 transition-colors cursor-pointer select-none ${className}`}
    >
      <div className="flex items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          {Icon && (
            <div className={`p-2 rounded-xl flex-shrink-0 mt-0.5 transition-all shadow-sm ${
              isIncognito
                ? (isChecked ? 'bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-purple-500/20' : 'bg-purple-500/15 text-purple-300 border border-purple-500/30')
                : 'bg-zinc-800 text-zinc-100 border border-zinc-700/60'
            }`}>
              <Icon size={18} strokeWidth={2.4} />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-zinc-200">{displayTitle}</p>
              {badge && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase border ${
                  badgeColor || 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                }`}>
                  {badge}
                </span>
              )}
            </div>
            {description && <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleToggle();
          }}
          disabled={disabled}
          className={`toggle-switch flex-shrink-0 mt-0.5 sm:mt-0 ${isChecked ? 'active' : ''} ${isChecked && isIncognito ? 'toggle-purple' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
          role="switch"
          aria-checked={isChecked}
          aria-label={displayTitle}
        />
      </div>
      {children && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {children}
        </div>
      )}
    </div>
  );
}

export function SelectRow({
  id,
  label,
  title,
  description,
  value,
  options = [],
  onChange,
  icon: Icon,
  badge,
  disabled = false,
  className = '',
}) {
  const displayTitle = label || title;
  return (
    <div
      id={id}
      data-setting-id={id}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:px-4.5 sm:py-3.5 hover:bg-zinc-800/20 transition-colors ${className}`}
    >
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        {Icon && (
          <div className="p-2 rounded-xl bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm flex-shrink-0 mt-0.5">
            <Icon size={18} strokeWidth={2.4} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-200">{displayTitle}</p>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>

      <div className="relative flex-shrink-0 w-full sm:w-auto min-w-[150px] max-w-full sm:max-w-[260px] pl-11 sm:pl-0">
        <select
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full appearance-none bg-zinc-950/80 border border-zinc-700/60 rounded-xl pl-3 pr-8 py-2 text-xs font-medium text-zinc-200 focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all cursor-pointer hover:border-zinc-600 truncate disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label={displayTitle}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} className="bg-zinc-900 text-zinc-200 py-1">
              {opt.label}
            </option>
          ))}
        </select>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
          <ChevronRight size={13} className="rotate-90" />
        </div>
      </div>
    </div>
  );
}

export function StepperRow({
  id,
  label,
  title,
  description,
  value = 0,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
  icon: Icon,
  presets = [],
  badge,
  disabled = false,
  className = '',
}) {
  const displayTitle = label || title;
  const numVal = typeof value === 'number' ? value : parseInt(value, 10) || 0;

  const handleStep = (delta) => {
    if (disabled) return;
    const next = Math.max(min, Math.min(max, numVal + delta));
    onChange(next);
  };

  return (
    <div
      id={id}
      data-setting-id={id}
      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:px-4.5 sm:py-3.5 hover:bg-zinc-800/20 transition-colors ${className}`}
    >
      <div className="flex items-start gap-3.5 flex-1 min-w-0">
        {Icon && (
          <div className="p-2 rounded-xl bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm flex-shrink-0 mt-0.5">
            <Icon size={18} strokeWidth={2.4} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-200">{displayTitle}</p>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>

      <div className="flex flex-col items-start sm:items-end gap-1.5 flex-shrink-0 pl-11 sm:pl-0">
        <div className="inline-flex items-center rounded-xl bg-zinc-950/80 border border-zinc-700/60 p-0.5">
          <button
            type="button"
            onClick={() => handleStep(-step)}
            disabled={disabled || numVal <= min}
            className="w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            aria-label="Decrease"
          >
            <Minus size={13} />
          </button>
          <span className="min-w-[4.8rem] px-2 text-center text-xs font-semibold text-zinc-100 font-mono select-none">
            {numVal === 0 && unit === 'KB/s' ? 'Unlimited' : `${numVal}${unit ? ` ${unit}` : ''}`}
          </span>
          <button
            type="button"
            onClick={() => handleStep(step)}
            disabled={disabled || numVal >= max}
            className="w-7 h-7 rounded-lg hover:bg-zinc-800 text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
            aria-label="Increase"
          >
            <Plus size={13} />
          </button>
        </div>

        {presets && presets.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap justify-start sm:justify-end">
            {presets.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => !disabled && onChange(p.value)}
                disabled={disabled}
                className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${
                  numVal === p.value
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-semibold'
                    : 'bg-zinc-800/50 text-zinc-400 border-zinc-700/40 hover:bg-zinc-700/50 hover:text-zinc-200'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function PathInputRow({
  id,
  label,
  title,
  description,
  value,
  onChange,
  placeholder,
  onBrowse,
  icon: Icon,
  onReset,
  badge,
  className = '',
}) {
  const displayTitle = label || title;
  const [localVal, setLocalVal] = useState(value || '');

  useEffect(() => {
    setLocalVal(value || '');
  }, [value]);

  const handleBlur = () => {
    if (localVal !== (value || '')) {
      onChange(localVal);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      onChange(localVal);
      e.target.blur();
    }
  };

  return (
    <div
      id={id}
      data-setting-id={id}
      className={`p-4 sm:px-4.5 sm:py-3.5 space-y-2.5 hover:bg-zinc-800/20 transition-colors ${className}`}
    >
      <div className="flex items-start gap-3.5">
        {Icon && (
          <div className="p-2 rounded-xl bg-zinc-800 text-zinc-100 border border-zinc-700/60 shadow-sm flex-shrink-0 mt-0.5">
            <Icon size={18} strokeWidth={2.4} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-zinc-200">{displayTitle}</p>
            {badge && (
              <span className="text-[10px] px-1.5 py-0.5 rounded font-semibold tracking-wide uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{description}</p>}
        </div>
      </div>

      <div className="flex items-center gap-2 pl-0 sm:pl-11">
        <div className="relative flex-1">
          <input
            type="text"
            value={localVal}
            onChange={(e) => setLocalVal(e.target.value)}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="w-full bg-zinc-950/80 border border-zinc-700/60 rounded-xl pl-3.5 pr-8 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all placeholder-zinc-600"
          />
          {onReset && localVal && (
            <button
              type="button"
              onClick={onReset}
              title="Reset to default"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
            >
              <RotateCcw size={12} />
            </button>
          )}
        </div>
        {onBrowse && (
          <button
            type="button"
            onClick={onBrowse}
            className="px-3.5 py-2 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <Folder size={13} /> Browse...
          </button>
        )}
      </div>
    </div>
  );
}

// Backwards-compatible aliases
export function ToggleSwitch({
  checked,
  enabled,
  onChange,
  disabled = false,
  className = '',
  isIncognito = false,
  'aria-label': ariaLabel,
  ...rest
}) {
  // If invoked with row metadata (label, title, description, icon, badge), render full ToggleRow
  if (rest.label || rest.title || rest.description || rest.icon || rest.badge) {
    return (
      <ToggleRow
        checked={checked}
        enabled={enabled}
        onChange={onChange}
        disabled={disabled}
        className={className}
        {...rest}
      />
    );
  }
  // Otherwise render a pure, standalone switch button with active state & click handling
  const isChecked = Boolean(enabled !== undefined ? enabled : checked);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled && onChange) {
          onChange(!isChecked);
        }
      }}
      disabled={disabled}
      className={`toggle-switch flex-shrink-0 ${isChecked ? 'active' : ''} ${isChecked && isIncognito ? 'toggle-purple' : ''} ${disabled ? 'opacity-40 cursor-not-allowed' : ''} ${className}`}
      role="switch"
      aria-checked={isChecked}
      aria-label={ariaLabel || 'Toggle switch'}
    />
  );
}
export const SelectField = SelectRow;
export const StepperInput = StepperRow;
export const PathInputSetting = PathInputRow;

// ─── Main Component ───────────────────────────────────────────────────

export default function SettingsTab({
  settings: propSettings,
  updateSetting: propUpdateSetting,
  refetchSettings: propRefetchSettings,
  isLoading: propIsLoading,
  isSaving: propIsSaving,
}) {
  // Use fallback only if rendered standalone without props
  const fallback = useSettings(propSettings === undefined);
  const settings = propSettings !== undefined ? propSettings : fallback.settings;
  const updateSetting = propUpdateSetting || fallback.updateSetting;
  const refetchSettings = propRefetchSettings || fallback.refetchSettings;
  const isLoading = propIsLoading !== undefined ? propIsLoading : fallback.isLoading;
  const isSaving = propIsSaving !== undefined ? propIsSaving : fallback.isSaving;

  const [activeTab, setActiveTab] = useState('general');
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileCategory, setMobileCategory] = useState(null);

  const handleSelectCategory = (tabId) => {
    setActiveTab(tabId);
    setMobileCategory(tabId);
    setSearchQuery('');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleJumpToSetting = (tabId, settingId, settingTitle) => {
    setActiveTab(tabId);
    setMobileCategory(tabId);
    setSearchQuery('');

    // Wait for tab DOM to mount and render
    setTimeout(() => {
      let targetEl = 
        document.getElementById(`setting-${settingId}`) ||
        document.getElementById(settingId) ||
        document.querySelector(`[data-setting-id="setting-${settingId}"]`) ||
        document.querySelector(`[data-setting-id="${settingId}"]`);

      // Fallback: search by setting label / title in the tab
      if (!targetEl && settingTitle) {
        const headings = document.querySelectorAll('p, h2, h3, h4, label, span');
        const searchTitle = settingTitle.trim().toLowerCase();
        for (const el of headings) {
          if (el.textContent && el.textContent.trim().toLowerCase() === searchTitle) {
            targetEl = el.closest('[data-setting-id], .p-4, .space-y-2, .rounded-2xl') || el;
            break;
          }
        }
      }

      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Add prominent glowing ring animation
        targetEl.classList.add(
          'ring-2',
          'ring-cyan-400',
          'bg-cyan-500/15',
          'shadow-[0_0_25px_rgba(6,182,212,0.35)]',
          'transition-all',
          'duration-300'
        );
        setTimeout(() => {
          targetEl.classList.remove(
            'ring-2',
            'ring-cyan-400',
            'bg-cyan-500/15',
            'shadow-[0_0_25px_rgba(6,182,212,0.35)]'
          );
        }, 2200);
      } else if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 120);
  };

  const handleSelectTab = (tabId, settingId = null, settingTitle = null) => {
    if (settingId) {
      handleJumpToSetting(tabId, settingId, settingTitle);
    } else {
      handleSelectCategory(tabId);
    }
  };

  const handleBackToCategoryList = () => {
    setMobileCategory(null);
  };

  // Updates & System state
  const [ytdlpVersion, setYtdlpVersion] = useState(null);
  const [updateStatus, setUpdateStatus] = useState('idle'); // idle, updating, success, error
  const [updateMessage, setUpdateMessage] = useState('');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Cookies & Accounts state
  const [verifyingSiteId, setVerifyingSiteId] = useState(null);
  const [cookieFeedback, setCookieFeedback] = useState(null); // { type: 'success'|'error', text: '' }
  const [pastedCookies, setPastedCookies] = useState('');
  const [parsingCookies, setParsingCookies] = useState(false);
  const [showCookiePasteModal, setShowCookiePasteModal] = useState(false);
  const fileInputRef = useRef(null);

  // Proof of Origin (PO Token) state
  const [potokenFeedback, setPotokenFeedback] = useState(null); // { type: 'success'|'error', text: '' }
  const [testingBgUtils, setTestingBgUtils] = useState(false);
  const [bgUtilsTestResult, setBgUtilsTestResult] = useState(null);
  const [generatingPoToken, setGeneratingPoToken] = useState(false);
  const [copiedField, setCopiedField] = useState(null);

  // History & Logs cleanup state
  const [showClearHistoryConfirm, setShowClearHistoryConfirm] = useState(false);
  const [isClearingHistory, setIsClearingHistory] = useState(false);
  const [historyClearMessage, setHistoryClearMessage] = useState(null);

  const [showClearLogsConfirm, setShowClearLogsConfirm] = useState(false);
  const [isClearingLogs, setIsClearingLogs] = useState(false);
  const [logsClearMessage, setLogsClearMessage] = useState(null);

  // Duplicate prevention & download archive state
  const [archiveStatus, setArchiveStatus] = useState(null);
  const [isClearingArchive, setIsClearingArchive] = useState(false);
  const [archiveFeedback, setArchiveFeedback] = useState(null);
  const [showArchiveEntries, setShowArchiveEntries] = useState(false);
  const [archiveEntries, setArchiveEntries] = useState([]);
  const [loadingArchiveEntries, setLoadingArchiveEntries] = useState(false);
  const [showClearArchiveConfirm, setShowClearArchiveConfirm] = useState(false);

  const fetchArchiveStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/archive/status`);
      if (res.ok) {
        const data = await res.json();
        setArchiveStatus(data);
      }
    } catch (e) {
      console.debug('Failed to fetch archive status', e);
    }
  };

  const handleClearArchive = async () => {
    setIsClearingArchive(true);
    setShowClearArchiveConfirm(false);
    try {
      const res = await fetch(`${API_BASE}/api/archive/clear`, { method: 'POST' });
      if (res.ok) {
        setArchiveFeedback({ type: 'success', text: 'Download archive successfully cleared.' });
        fetchArchiveStatus();
        setArchiveEntries([]);
      } else {
        setArchiveFeedback({ type: 'error', text: 'Failed to clear download archive.' });
      }
    } catch (e) {
      setArchiveFeedback({ type: 'error', text: e.message || 'Error clearing archive' });
    } finally {
      setIsClearingArchive(false);
      setTimeout(() => setArchiveFeedback(null), 4000);
    }
  };

  const handleToggleArchiveEntries = async () => {
    if (showArchiveEntries) {
      setShowArchiveEntries(false);
      return;
    }
    setShowArchiveEntries(true);
    setLoadingArchiveEntries(true);
    try {
      const res = await fetch(`${API_BASE}/api/archive/entries?limit=100`);
      if (res.ok) {
        const data = await res.json();
        setArchiveEntries(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.debug('Failed to fetch archive entries', e);
    } finally {
      setLoadingArchiveEntries(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'downloading') {
      fetchArchiveStatus();
    }
  }, [activeTab]);

  // Local state for filename template input to prevent revert-on-type
  const [filenameTemplate, setFilenameTemplate] = useState(settings?.custom_filename_template || '%(title)s.%(ext)s');
  const filenameDebounceRef = useRef(null);
  const lastUserEditTimeRef = useRef(0);

  // Sync from server only when settings load from outside or not during active user editing
  useEffect(() => {
    if (settings?.custom_filename_template !== undefined && settings?.custom_filename_template !== null) {
      if (Date.now() - lastUserEditTimeRef.current < 2500) {
        return; // User recently edited, do not overwrite with stale in-flight response
      }
      const activeEl = document.activeElement;
      if (activeEl && activeEl.dataset?.settingsKey === 'custom_filename_template') {
        return; // User is actively focused/typing in the input
      }
      setFilenameTemplate(settings.custom_filename_template);
    }
  }, [settings?.custom_filename_template]);

  const commitFilenameTemplate = (value) => {
    lastUserEditTimeRef.current = Date.now();
    clearTimeout(filenameDebounceRef.current);
    updateSetting('custom_filename_template', value);
  };

  const handleFilenameChange = (e) => {
    const val = e.target.value;
    lastUserEditTimeRef.current = Date.now();
    setFilenameTemplate(val);
    clearTimeout(filenameDebounceRef.current);
    filenameDebounceRef.current = setTimeout(() => {
      updateSetting('custom_filename_template', val);
    }, 600);
  };

  const handleFilenameReset = () => {
    const defaultVal = '%(title)s.%(ext)s';
    lastUserEditTimeRef.current = Date.now();
    setFilenameTemplate(defaultVal);
    clearTimeout(filenameDebounceRef.current);
    updateSetting('custom_filename_template', defaultVal);
  };

  const handleFilenameTokenAppend = (token) => {
    lastUserEditTimeRef.current = Date.now();
    const trimmed = (filenameTemplate || '').trim();
    const updated = trimmed ? `${trimmed}_${token}` : token;
    setFilenameTemplate(updated);
    clearTimeout(filenameDebounceRef.current);
    updateSetting('custom_filename_template', updated);
  };

  const handleClearHistory = async () => {
    setIsClearingHistory(true);
    try {
      const res = await fetch(`${API_BASE}/api/history/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setHistoryClearMessage({ type: 'success', text: `History cleared successfully (${data.cleared_count || 0} items removed)` });
        setTimeout(() => setHistoryClearMessage(null), 3500);
      } else {
        setHistoryClearMessage({ type: 'error', text: 'Failed to clear history' });
      }
    } catch (err) {
      setHistoryClearMessage({ type: 'error', text: 'Network error while clearing history' });
    } finally {
      setIsClearingHistory(false);
      setShowClearHistoryConfirm(false);
    }
  };

  const handleClearLogs = async () => {
    setIsClearingLogs(true);
    try {
      const res = await fetch(`${API_BASE}/api/logs/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.status === 'success') {
        setLogsClearMessage({ type: 'success', text: `All logs cleared (${data.cleared_logs_count || 0} files deleted)` });
        setTimeout(() => setLogsClearMessage(null), 3500);
      } else {
        setLogsClearMessage({ type: 'error', text: 'Failed to clear execution logs' });
      }
    } catch (err) {
      setLogsClearMessage({ type: 'error', text: 'Network error while clearing logs' });
    } finally {
      setIsClearingLogs(false);
      setShowClearLogsConfirm(false);
    }
  };

  // Fetch yt-dlp version on mount
  useEffect(() => {
    fetchYtdlpVersion();
  }, []);

  const fetchYtdlpVersion = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/ytdlp-version`);
      if (res.ok) {
        const data = await res.json();
        setYtdlpVersion(data.ytdlp_version);
      }
    } catch (e) {
      console.warn('Could not fetch yt-dlp version:', e);
    }
  };

  // Folder selection
  const handleSelectFolder = async (key) => {
    try {
      const res = await fetch(`${API_BASE}/api/select-folder`);
      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          updateSetting(key, data.path);
        }
      }
    } catch (err) {
      console.error('Folder selection failed:', err);
    }
  };

  // Check for updates
  const handleCheckUpdate = async () => {
    setUpdateStatus('updating');
    setUpdateMessage('');
    try {
      const res = await fetch(`${API_BASE}/api/update`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setUpdateStatus('success');
        setUpdateMessage(data.message || 'yt-dlp updated successfully!');
        fetchYtdlpVersion();
      } else {
        setUpdateStatus('error');
        setUpdateMessage(data.detail || 'Update process failed.');
      }
    } catch (e) {
      setUpdateStatus('error');
      setUpdateMessage('Network error while checking updates.');
    }
    setTimeout(() => {
      setUpdateStatus('idle');
      setUpdateMessage('');
    }, 6000);
  };

  // Reset all settings
  const handleResetSettings = async () => {
    setIsResetting(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings/reset`, { method: 'POST' });
      if (res.ok) {
        setShowResetConfirm(false);
        if (refetchSettings) await refetchSettings();
      }
    } catch (err) {
      console.error('Failed to reset settings:', err);
    } finally {
      setIsResetting(false);
    }
  };

  // Upload Netscape cookie file
  const handleCookieFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target.result;
      setParsingCookies(true);
      try {
        const res = await fetch(`${API_BASE}/api/cookies/parse-pasted`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ raw_text: content }),
        });
        const data = await res.json();
        if (res.ok && data.status === 'success') {
          setCookieFeedback({ type: 'success', text: data.message || 'Cookies imported successfully!' });
          if (refetchSettings) await refetchSettings();
        } else {
          setCookieFeedback({ type: 'error', text: data.detail || 'Could not parse cookie file.' });
        }
      } catch (err) {
        setCookieFeedback({ type: 'error', text: 'Error uploading cookie file.' });
      } finally {
        setParsingCookies(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        setTimeout(() => setCookieFeedback(null), 7000);
      }
    };
    reader.readAsText(file);
  };

  // Paste raw cookie text
  const handlePasteCookiesSubmit = async () => {
    if (!pastedCookies.trim()) return;
    setParsingCookies(true);
    try {
      const res = await fetch(`${API_BASE}/api/cookies/parse-pasted`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw_text: pastedCookies }),
      });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setPastedCookies('');
        setShowCookiePasteModal(false);
        setCookieFeedback({ type: 'success', text: data.message || 'Cookies added successfully!' });
        if (refetchSettings) await refetchSettings();
      } else {
        setCookieFeedback({ type: 'error', text: data.detail || 'Failed to parse cookie text.' });
      }
    } catch (e) {
      setCookieFeedback({ type: 'error', text: 'Network error parsing cookies.' });
    } finally {
      setParsingCookies(false);
      setTimeout(() => setCookieFeedback(null), 7000);
    }
  };

  // Toggle individual site cookie
  const handleToggleSiteCookie = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/cookies/site/toggle/${id}`, { method: 'POST' });
      if (res.ok && refetchSettings) await refetchSettings();
    } catch (e) {
      console.error(e);
    }
  };

  // Verify individual site cookie
  const handleVerifySiteCookie = async (id) => {
    setVerifyingSiteId(id);
    try {
      const res = await fetch(`${API_BASE}/api/cookies/site/verify/${id}`, { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.status === 'success') {
        setCookieFeedback({ type: 'success', text: data.message });
        if (refetchSettings) await refetchSettings();
      } else {
        setCookieFeedback({ type: 'error', text: data.detail || 'Cookie validation failed.' });
      }
    } catch (e) {
      setCookieFeedback({ type: 'error', text: 'Validation request failed.' });
    } finally {
      setVerifyingSiteId(null);
    }
    setTimeout(() => setCookieFeedback(null), 6000);
  };

  // Delete site cookie
  const handleDeleteSiteCookie = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/cookies/site/${id}`, { method: 'DELETE' });
      if (res.ok && refetchSettings) await refetchSettings();
    } catch (e) {
      console.error(e);
    }
  };

  // Clear all saved cookies
  const handleClearAllCookies = async () => {
    if (!window.confirm('Are you sure you want to clear all saved cookies and session accounts?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/cookies/all`, { method: 'DELETE' });
      if (res.ok) {
        setCookieFeedback({ type: 'success', text: 'All cookies cleared.' });
        if (refetchSettings) await refetchSettings();
      }
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setCookieFeedback(null), 5000);
  };

  // ─── Proof of Origin (PO Token) Handlers ───
  const poSettings = settings?.potoken_settings || {
    enabled: false,
    mode: 'no_auth',
    bgutil_base_url: 'http://127.0.0.1:4416',
    player_clients: ['ios', 'android', 'mweb', 'web'],
    use_only_po_token: false,
    gvs_token: '',
    player_token: '',
    subs_token: '',
    visitor_data: '',
    last_generated: null,
    token_status: 'idle',
    status_message: null,
    test_video_id: 'aqz-KE-bpKQ',
  };

  const handleUpdatePoSetting = (key, value) => {
    const updated = { ...poSettings, [key]: value };
    updateSetting('potoken_settings', updated, true);
  };

  const handleTogglePoClient = (client) => {
    const current = poSettings.player_clients || ['ios', 'android', 'mweb', 'web'];
    let next;
    if (current.includes(client)) {
      if (current.length === 1) return;
      next = current.filter(c => c !== client);
    } else {
      next = [...current, client];
    }
    handleUpdatePoSetting('player_clients', next);
  };

  const handleTestBgUtilsProvider = async (baseUrl) => {
    const urlToTest = baseUrl || poSettings.bgutil_base_url || 'http://127.0.0.1:4416';
    setTestingBgUtils(true);
    setBgUtilsTestResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/potoken/test-provider`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base_url: urlToTest }),
      });
      const data = await res.json();
      setBgUtilsTestResult(data);
      if (data.connected) {
        setPotokenFeedback({ type: 'success', text: data.message });
      } else {
        setPotokenFeedback({ type: 'error', text: data.message });
      }
    } catch (e) {
      setBgUtilsTestResult({ connected: false, message: 'Failed to test BgUtils connection.' });
      setPotokenFeedback({ type: 'error', text: 'Network error connecting to BgUtils.' });
    } finally {
      setTestingBgUtils(false);
      setTimeout(() => setPotokenFeedback(null), 6000);
    }
  };

  const handleGeneratePoTokens = async (overrideMode) => {
    const modeToUse = overrideMode || poSettings.mode || 'no_auth';
    setGeneratingPoToken(true);
    try {
      const res = await fetch(`${API_BASE}/api/potoken/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: modeToUse, test_video_id: poSettings.test_video_id || 'aqz-KE-bpKQ' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setPotokenFeedback({ type: 'success', text: data.message });
        if (refetchSettings) await refetchSettings();
      } else {
        setPotokenFeedback({ type: 'error', text: data.detail || data.message || 'Token generation failed.' });
      }
    } catch (e) {
      setPotokenFeedback({ type: 'error', text: 'Network error generating PO tokens.' });
    } finally {
      setGeneratingPoToken(false);
      setTimeout(() => setPotokenFeedback(null), 6000);
    }
  };

  const handleCopyPoToken = (text, fieldName) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  // Backup & Restore
  const handleBackup = () => {
    window.location.href = `${API_BASE}/api/backup`;
  };

  const handleRestore = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    try {
      const res = await fetch(`${API_BASE}/api/restore`, { method: 'POST', body: formData });
      if (res.ok) {
        alert('Configuration backup restored! Reloading settings...');
        if (refetchSettings) await refetchSettings();
      } else {
        alert('Failed to restore backup.');
      }
    } catch (e) {
      alert('Error restoring backup file.');
    }
  };

  // Append token to template
  const handleAppendToken = (fieldKey, currentVal, token) => {
    const trimmed = (currentVal || '').trim();
    const updated = trimmed ? `${trimmed}_${token}` : token;
    updateSetting(fieldKey, updated);
  };

  // ─── Search Filter Index ─────────────────────────────────────────────

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const q = searchQuery.toLowerCase().trim();

    const items = [
      // General
      {
        id: 'incognito_mode',
        tab: 'general',
        category: 'General',
        title: 'Incognito Mode',
        desc: "Downloads won't be saved to history or cached on disk",
        keywords: 'private hidden privacy secret history cache incognito anonymous chrome firefox stealth',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.incognito_mode}
            onChange={(v) => updateSetting('incognito_mode', v)}
            label="Incognito Mode"
            description="Prevent downloads and viewed URLs from saving to history"
            icon={IncognitoIcon}
            badge="Privacy"
            badgeColor="bg-purple-500/15 text-purple-300 border-purple-500/30"
          />
        ),
      },
      {
        id: 'save_search_history',
        tab: 'general',
        category: 'General',
        title: 'Search History',
        desc: 'Save searched URLs and queries for quick suggestions and auto-complete',
        keywords: 'search history recent urls queries suggestions save disable',
        render: () => (
          <ToggleSwitch
            enabled={settings?.save_search_history !== false}
            onChange={(v) => updateSetting('save_search_history', v)}
            label="Search History"
            description="Save searched URLs and queries for quick auto-complete suggestions"
            icon={History}
          />
        ),
      },
      {
        id: 'notifications_enabled',
        tab: 'general',
        category: 'General',
        title: 'Completion Notifications',
        desc: 'Display system alerts and play chime when a download completes',
        keywords: 'alerts notify sound chime desktop popups',
        render: () => (
          <ToggleSwitch
            enabled={settings?.notifications_enabled !== false}
            onChange={(v) => updateSetting('notifications_enabled', v)}
            label="Completion Notifications"
            description="Display desktop notification alerts when downloads finish"
            icon={Bell}
          />
        ),
      },
      {
        id: 'theme',
        tab: 'general',
        category: 'General',
        title: 'Interface Theme',
        desc: 'Choose visual color theme: Dark, OLED Black, System, Light',
        keywords: 'theme appearance style dark light oled color',
        render: () => (
          <SelectField
            label="Interface Theme"
            description="Visual color theme for the web application"
            value={settings?.theme || 'dark'}
            onChange={(v) => updateSetting('theme', v)}
            options={[
              { label: 'Dark (Default)', value: 'dark' },
              { label: 'OLED Pure Black', value: 'oled' },
              { label: 'System Theme', value: 'system' },
              { label: 'Light', value: 'light' },
            ]}
            icon={Palette}
          />
        ),
      },
      {
        id: 'quick_download',
        tab: 'general',
        category: 'General',
        title: 'Quick Download Mode',
        desc: 'Bypass manual format selection and automatically start download',
        keywords: 'instant quick speed default direct format skip',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.quick_download}
            onChange={(v) => updateSetting('quick_download', v)}
            label="Quick Download Mode"
            description="Skip format selection popup and automatically start with default quality"
            icon={DownloadCloud}
          />
        ),
      },
      {
        id: 'default_video_quality',
        tab: 'general',
        category: 'General',
        title: 'Default Video Quality',
        desc: 'Resolution fallback for quick downloads (Best, 4K, 1080p, etc.)',
        keywords: 'resolution 4k 1080p 720p 480p quality fhd hd',
        render: () => (
          <SelectField
            label="Default Video Quality"
            description="Target resolution for one-click downloads"
            value={settings?.default_video_quality || 'best'}
            onChange={(v) => updateSetting('default_video_quality', v)}
            options={[
              { label: 'Best Available', value: 'best' },
              { label: '4K Ultra HD (2160p)', value: '2160' },
              { label: '2K Quad HD (1440p)', value: '1440' },
              { label: '1080p Full HD', value: '1080' },
              { label: '720p HD', value: '720' },
              { label: '480p SD', value: '480' },
              { label: '360p Low', value: '360' },
            ]}
            icon={Film}
          />
        ),
      },
      // Directories & Templates
      {
        id: 'download_dir',
        tab: 'directories',
        category: 'Directories & Templates',
        title: 'Download Directory',
        desc: 'Destination path where finished video and audio files are stored',
        keywords: 'folder directory path save destination disk storage',
        render: () => (
          <PathInputSetting
            label="Download Directory"
            description="Target folder where completed downloads are moved. Empty uses system Downloads folder."
            value={settings?.download_dir}
            onChange={(v) => updateSetting('download_dir', v)}
            placeholder="System Downloads folder"
            onBrowse={() => handleSelectFolder('download_dir')}
            icon={Folder}
          />
        ),
      },
      {
        id: 'temp_dir',
        tab: 'directories',
        category: 'Directories & Templates',
        title: 'Staging / Temp Path',
        desc: 'Directory where fragments and stream chunks are assembled',
        keywords: 'staging temp cache fragments assembly chunks scratch',
        render: () => (
          <PathInputSetting
            label="Staging / Temp Path"
            description="Directory where video fragments are cached and muxed during active download."
            value={settings?.temp_dir}
            onChange={(v) => updateSetting('temp_dir', v)}
            placeholder="/tmp (System default)"
            onBrowse={() => handleSelectFolder('temp_dir')}
            icon={Layers}
          />
        ),
      },
      {
        id: 'create_subdirectories',
        tab: 'directories',
        category: 'Directories & Templates',
        title: 'Create Subdirectories',
        desc: 'Sort media into subfolders by creator, channel, or playlist',
        keywords: 'subfolder organize uploader artist playlist grouping',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.create_subdirectories}
            onChange={(v) => updateSetting('create_subdirectories', v)}
            label="Create Subdirectories"
            description="Automatically sort downloads into custom subfolders"
            icon={Folder}
          />
        ),
      },
      {
        id: 'custom_filename_template',
        tab: 'directories',
        category: 'Directories & Templates',
        title: 'Output Filename Template',
        desc: 'Configure yt-dlp naming syntax with tokens (title, uploader, date, etc.)',
        keywords: 'template filename token name pattern naming format %(title)s',
        render: () => (
          <div className="space-y-2">
            <p className="text-sm font-medium text-zinc-200">Filename Template</p>
            <p className="text-xs text-zinc-400">Custom formatting pattern for downloaded files</p>
            <input
              type="text"
              data-settings-key="custom_filename_template"
              value={filenameTemplate}
              onChange={handleFilenameChange}
              onBlur={() => commitFilenameTemplate(filenameTemplate)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/60"
            />
            <p className="text-[11px] text-zinc-500">
              Preview: <span className="text-cyan-400 font-mono">{previewFilename(filenameTemplate)}</span>
            </p>
          </div>
        ),
      },
      // Downloading & Limits
      {
        id: 'concurrent_downloads',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Max Concurrent Downloads',
        desc: 'Number of downloads allowed to run simultaneously (1 - 10)',
        keywords: 'parallel concurrent simultaneous queue workers limits max',
        render: () => (
          <StepperInput
            label="Max Concurrent Downloads"
            description="Number of simultaneous active downloads allowed at the same time"
            value={settings?.concurrent_downloads || 3}
            onChange={(v) => updateSetting('concurrent_downloads', v)}
            min={1}
            max={10}
            step={1}
            icon={DownloadCloud}
          />
        ),
      },
      {
        id: 'download_speed_limit',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Download Speed Limit',
        desc: 'Bandwidth throttling in KB/s (0 = unlimited)',
        keywords: 'speed throttle bandwidth limit rate ratelimit kb/s mb/s',
        render: () => (
          <StepperInput
            label="Download Speed Limit"
            description="Bandwidth throttle per download worker (0 = unlimited)"
            value={settings?.download_speed_limit || 0}
            onChange={(v) => updateSetting('download_speed_limit', v)}
            min={0}
            max={102400}
            step={1024}
            unit="KB/s"
            icon={Sliders}
            presets={SPEED_PRESETS}
          />
        ),
      },
      {
        id: 'retries',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Auto-Retry Count',
        desc: 'Maximum retry attempts if a connection drops or fragment fails',
        keywords: 'retry retries connection error drop timeout attempts',
        render: () => (
          <StepperInput
            label="Auto-Retry Count"
            description="Number of times yt-dlp will retry a failed connection before aborting"
            value={settings?.retries ?? 10}
            onChange={(v) => updateSetting('retries', v)}
            min={0}
            max={50}
            step={1}
            icon={RotateCcw}
          />
        ),
      },
      {
        id: 'retry_sleep',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Retry Delay',
        desc: 'Seconds to wait between retry attempts',
        keywords: 'delay sleep wait interval retry reconnect',
        render: () => (
          <StepperInput
            label="Retry Delay"
            description="Seconds to pause before re-attempting a dropped network stream"
            value={settings?.retry_sleep ?? 5}
            onChange={(v) => updateSetting('retry_sleep', v)}
            min={0}
            max={60}
            step={1}
            unit="sec"
            icon={RotateCcw}
          />
        ),
      },
      {
        id: 'continue_downloads',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Resume Partially Downloaded Streams',
        desc: 'Continue existing partial files rather than restarting from 0%',
        keywords: 'resume continue restart resume-dl interrupted pause',
        render: () => (
          <ToggleSwitch
            enabled={settings?.continue_downloads !== false}
            onChange={(v) => updateSetting('continue_downloads', v)}
            label="Resume Interrupted Downloads"
            description="Continue downloading partially completed files instead of starting over"
            icon={DownloadCloud}
          />
        ),
      },
      // Formats & Processing
      {
        id: 'default_video_container',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Default Video Container',
        desc: 'Target video packaging: MP4, MKV, WEBM, or Auto',
        keywords: 'container mp4 mkv webm format mux extension video',
        render: () => (
          <SelectField
            label="Default Video Container"
            description="Target container for merged video streams"
            value={settings?.default_video_container || 'auto'}
            onChange={(v) => updateSetting('default_video_container', v)}
            options={[
              { label: 'Auto (Best Match)', value: 'auto' },
              { label: 'MP4 (Universal compatibility)', value: 'mp4' },
              { label: 'MKV (Matroska - Multi-subs/audio)', value: 'mkv' },
              { label: 'WEBM (Google WebM / VP9)', value: 'webm' },
            ]}
            icon={Film}
          />
        ),
      },
      {
        id: 'default_audio_container',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Default Audio Container',
        desc: 'Target audio container: MP3, M4A, OPUS, or FLAC',
        keywords: 'audio container mp3 m4a opus flac music sound',
        render: () => (
          <SelectField
            label="Default Audio Container"
            description="Target format when downloading audio-only streams"
            value={settings?.default_audio_container || 'mp3'}
            onChange={(v) => updateSetting('default_audio_container', v)}
            options={[
              { label: 'MP3 (Universal compatibility)', value: 'mp3' },
              { label: 'M4A (Apple AAC)', value: 'm4a' },
              { label: 'OPUS (Modern & efficient)', value: 'opus' },
              { label: 'FLAC (Lossless Studio Quality)', value: 'flac' },
            ]}
            icon={Volume2}
          />
        ),
      },
      {
        id: 'preferred_video_codec',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Preferred Video Codec',
        desc: 'Select preferred video codec: AV1, VP9, H.264 (avc1), or Auto',
        keywords: 'codec av1 av01 vp9 h264 avc1 hardware gpu decoding',
        render: () => (
          <SelectField
            label="Preferred Video Codec"
            description="Prioritize streams encoded with this video codec"
            value={settings?.preferred_video_codec || 'auto'}
            onChange={(v) => updateSetting('preferred_video_codec', v)}
            options={[
              { label: 'Auto (Highest quality)', value: 'auto' },
              { label: 'AV1 (av01 - Next-Gen Efficiency)', value: 'av01' },
              { label: 'VP9 (YouTube standard)', value: 'vp9' },
              { label: 'H.264 (avc1 - Universal hardware support)', value: 'h264' },
            ]}
            icon={Cpu}
          />
        ),
      },
      {
        id: 'preferred_audio_codec',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Preferred Audio Codec',
        desc: 'Select preferred audio codec: AAC, Opus, MP3, Vorbis, or Auto',
        keywords: 'audio codec aac opus mp3 vorbis sound',
        render: () => (
          <SelectField
            label="Preferred Audio Codec"
            description="Prioritize streams encoded with this audio codec"
            value={settings?.preferred_audio_codec || 'auto'}
            onChange={(v) => updateSetting('preferred_audio_codec', v)}
            options={[
              { label: 'Auto (Best)', value: 'auto' },
              { label: 'AAC (Apple standard)', value: 'aac' },
              { label: 'Opus (YouTube standard)', value: 'opus' },
              { label: 'MP3 (LAME)', value: 'mp3' },
              { label: 'Vorbis (Ogg)', value: 'vorbis' },
            ]}
            icon={Volume2}
          />
        ),
      },
      {
        id: 'embed_metadata',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Embed Metadata',
        desc: 'Write tags like title, artist, album, and release date into file',
        keywords: 'tags id3 metadata artist album info title description',
        render: () => (
          <ToggleSwitch
            enabled={settings?.embed_metadata !== false}
            onChange={(v) => updateSetting('embed_metadata', v)}
            label="Embed Metadata"
            description="Inject artist, title, album, and release date ID3 / MP4 tags"
            icon={FileText}
          />
        ),
      },
      {
        id: 'embed_thumbnail',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Embed Thumbnail Artwork',
        desc: 'Save video thumbnail as embedded album / cover art',
        keywords: 'thumbnail cover art image album artwork picture poster',
        render: () => (
          <ToggleSwitch
            enabled={settings?.embed_thumbnail !== false}
            onChange={(v) => updateSetting('embed_thumbnail', v)}
            label="Embed Thumbnail Artwork"
            description="Embed high-resolution cover image into media files"
            icon={Film}
          />
        ),
      },
      {
        id: 'embed_chapters',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Embed Chapters',
        desc: 'Mux video chapter markers for easy player scrubbing',
        keywords: 'chapters timestamps markers intervals seek navigation',
        render: () => (
          <ToggleSwitch
            enabled={settings?.embed_chapters !== false}
            onChange={(v) => updateSetting('embed_chapters', v)}
            label="Embed Chapters"
            description="Add chapter markers to video files for quick navigation"
            icon={Layers}
          />
        ),
      },
      // SponsorBlock
      {
        id: 'sponsorblock_remove',
        tab: 'sponsorblock',
        category: 'SponsorBlock',
        title: 'SponsorBlock Auto-Removal',
        desc: 'Cut or skip sponsored promotions and filler segments',
        keywords: 'sponsor sponsorblock ads promotion skip cut commercial',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.sponsorblock_remove}
            onChange={(v) => {
              updateSetting('sponsorblock_remove', v);
              updateSetting('remove_sponsorblock_default', v);
            }}
            label="Remove Sponsor Segments"
            description="Automatically cut sponsor segments using the crowd-sourced SponsorBlock database"
            icon={Shield}
          />
        ),
      },
      // Network & Proxy
      {
        id: 'socks5_proxy',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Proxy URL',
        desc: 'HTTP or SOCKS5 proxy URL for routing download traffic',
        keywords: 'proxy socks socks5 http vpn ip address route bypass',
        render: () => (
          <div className="space-y-1 py-1">
            <p className="text-sm font-medium text-zinc-200">Proxy URL</p>
            <p className="text-xs text-zinc-400">Route yt-dlp traffic through an HTTP or SOCKS5 proxy</p>
            <input
              type="text"
              value={settings?.socks5_proxy || settings?.proxy_url || ''}
              onChange={(e) => {
                updateSetting('socks5_proxy', e.target.value);
                updateSetting('proxy_url', e.target.value);
              }}
              placeholder="socks5://127.0.0.1:1080 or http://user:pass@host:port"
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-blue-500/60"
            />
          </div>
        ),
      },
      {
        id: 'custom_user_agent',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Custom User-Agent',
        desc: 'Browser identifier sent with HTTP headers',
        keywords: 'user agent user-agent headers browser spoof bot',
        render: () => (
          <div className="space-y-1 py-1">
            <p className="text-sm font-medium text-zinc-200">Custom User-Agent</p>
            <p className="text-xs text-zinc-400">Custom HTTP User-Agent string sent to servers</p>
            <input
              type="text"
              value={settings?.custom_user_agent || ''}
              onChange={(e) => updateSetting('custom_user_agent', e.target.value)}
              placeholder="Default yt-dlp User-Agent"
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-blue-500/60"
            />
          </div>
        ),
      },
      {
        id: 'impersonate_target',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Browser Impersonation (TLS Fingerprint)',
        desc: 'Mimic browser TLS/JA3 fingerprints via curl-cffi to evade datacenter IP bot detection',
        keywords: 'impersonate browser tls ja3 fingerprint curl_cffi bot anti-bot datacenter vps',
        render: () => (
          <SelectField
            label="Browser Impersonation"
            description="Mimic authentic browser TLS fingerprints via curl-cffi"
            value={settings?.impersonate_target || 'chrome'}
            onChange={(v) => updateSetting('impersonate_target', v)}
            options={[
              { label: 'Chrome (Recommended - TLS matching)', value: 'chrome' },
              { label: 'Safari (Apple WebKit TLS)', value: 'safari' },
              { label: 'Edge (Microsoft Edge TLS)', value: 'edge' },
              { label: 'Disabled (Raw Python urllib)', value: 'none' },
            ]}
            icon={Shield}
          />
        ),
      },
      {
        id: 'socket_timeout',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Socket Timeout',
        desc: 'Timeout limit in seconds for unresponsive HTTP requests',
        keywords: 'socket timeout seconds connection drop hang freeze',
        render: () => (
          <StepperInput
            label="Socket Timeout"
            description="Seconds to wait before aborting an unresponsive network request"
            value={settings?.socket_timeout || 30}
            onChange={(v) => updateSetting('socket_timeout', v)}
            min={5}
            max={180}
            step={5}
            unit="sec"
            icon={Wifi}
          />
        ),
      },
      {
        id: 'geo_bypass',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Geo-Bypass',
        desc: 'Bypass geographic restrictions by simulating client country headers',
        keywords: 'geo bypass region country block restricted location',
        render: () => (
          <ToggleSwitch
            enabled={settings?.geo_bypass !== false}
            onChange={(v) => updateSetting('geo_bypass', v)}
            label="Geographic Restriction Bypass"
            description="Simulate client IP and country headers to bypass region locks"
            icon={Globe}
          />
        ),
      },
      {
        id: 'force_ipv4',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Force IPv4',
        desc: 'Disable IPv6 routing to bypass ISP throttling and DNS issues',
        keywords: 'ipv4 ipv6 network ip rate limit slow connection',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.force_ipv4}
            onChange={(v) => updateSetting('force_ipv4', v)}
            label="Force IPv4"
            description="Force all connections through IPv4 to avoid IPv6 timeouts and blocks"
            icon={Wifi}
          />
        ),
      },
      // Cookies & Accounts
      {
        id: 'netscape_cookies',
        tab: 'cookies',
        category: 'Cookies & Accounts',
        title: 'Netscape Cookie Import',
        desc: 'Import or paste Netscape format cookies.txt for authenticated downloads',
        keywords: 'cookies accounts login session netscape file txt authentication',
        render: () => (
          <div className="space-y-2 py-1">
            <p className="text-sm font-medium text-zinc-200">Netscape Cookie Import</p>
            <p className="text-xs text-zinc-400">Import or paste Netscape format cookies.txt exported from your browser</p>
          </div>
        ),
      },
      // Updates & System
      {
        id: 'ytdlp_release_channel',
        tab: 'updates',
        category: 'Updates & System',
        title: 'yt-dlp Release Channel',
        desc: 'Select Stable, Nightly, or Master git update stream',
        keywords: 'channel release update stable nightly master version git',
        render: () => (
          <SelectField
            label="Release Channel"
            description="Which update branch of yt-dlp to follow"
            value={settings?.ytdlp_release_channel || 'stable'}
            onChange={(v) => updateSetting('ytdlp_release_channel', v)}
            options={[
              { label: 'Stable (Official PyPI releases - Recommended)', value: 'stable' },
              { label: 'Nightly (Daily automated builds)', value: 'nightly' },
              { label: 'Master (Direct GitHub HEAD repo)', value: 'master' },
            ]}
            icon={RefreshCw}
          />
        ),
      },
      // Execution Logging
      {
        id: 'log_downloads',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Log Downloads',
        desc: 'Create and persist execution log files on disk for each download',
        keywords: 'log logs logging execution output terminal disk file history log_downloads',
        render: () => (
          <ToggleSwitch
            enabled={settings?.log_downloads !== false}
            onChange={(v) => updateSetting('log_downloads', v)}
            label="Log Downloads"
            description={
              settings?.incognito_mode 
                ? "Create a log file for each download (currently suppressed by Incognito Mode)" 
                : "Create a log file for each download"
            }
            icon={FileText}
            badge={settings?.incognito_mode ? "Incognito Active" : undefined}
            badgeColor={settings?.incognito_mode ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : undefined}
          />
        ),
      },
      // Duplicate Prevention
      {
        id: 'prevent_duplicate_downloads',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Prevent Duplicate Downloads',
        desc: 'Avoid queuing or downloading media you already have (off, url, url_type, download_archive, config)',
        keywords: 'duplicate prevention prevent duplicate downloads avoid redundant archive url url_type redownload history repeat',
        render: () => (
          <SelectRow
            label="Prevent Duplicate Downloads"
            description="Detection mode used to block duplicate requests and warn on existing files"
            value={settings?.prevent_duplicate_downloads || 'url_type'}
            onChange={(v) => {
              updateSetting('prevent_duplicate_downloads', v);
              if (v === 'download_archive') {
                fetchArchiveStatus();
              }
            }}
            options={[
              { label: 'Disabled (Off) — Allow duplicate downloads', value: 'off' },
              { label: 'By URL & Media Type (Recommended) — Video and Audio separate', value: 'url_type' },
              { label: 'By URL — Block any duplicate link regardless of type', value: 'url' },
              { label: 'Download Archive (yt-dlp) — Track IDs in archive.txt', value: 'download_archive' },
              { label: 'By Exact Configuration — Block matching format IDs & commands', value: 'config' },
            ]}
            icon={CopyCheck}
          />
        ),
      },
      {
        id: 'download_archive_path',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Download Archive File Path',
        desc: 'Text file path on disk where yt-dlp records completed extractor IDs',
        keywords: 'archive download_archive path file txt ids recorded skip duplicate',
        render: () => (
          <PathInputRow
            label="Download Archive File Path"
            description="Text file on disk where yt-dlp records every downloaded extractor + ID"
            value={settings?.download_archive_path || 'data/download_archive.txt'}
            onChange={(v) => updateSetting('download_archive_path', v)}
            placeholder="data/download_archive.txt"
            icon={Archive}
            badge="yt-dlp native"
          />
        ),
      },
      {
        id: 'concurrent_fragments',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Concurrent Fragment Connections',
        desc: 'Parallel chunk threads per download stream for DASH and HLS video',
        keywords: 'fragments chunk dash hls parallel threads connections split speed',
        render: () => (
          <StepperInput
            label="Concurrent Fragment Connections"
            description="Parallel chunk threads per download stream for DASH and HLS video"
            value={settings?.concurrent_fragments ?? 5}
            onChange={(v) => updateSetting('concurrent_fragments', v)}
            min={1}
            max={25}
            step={1}
            icon={Wifi}
          />
        ),
      },
      {
        id: 'enable_browser_download',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Direct Browser Download',
        desc: 'Display a download button on finished video cards to save files directly to device',
        keywords: 'browser download direct client device docker remote local save file disk',
        render: () => (
          <ToggleRow
            enabled={!!settings?.enable_browser_download}
            onChange={(v) => updateSetting('enable_browser_download', v)}
            label="Direct Browser Download"
            description="Display a download button on finished video cards to save files directly to your device"
            icon={Download}
          />
        ),
      },
      {
        id: 'auto_cleanup_timer',
        tab: 'downloading',
        category: 'Downloading & Limits',
        title: 'Auto-Cleanup Timer',
        desc: 'Automatically remove finished downloads and delete media files from storage after set time',
        keywords: 'cleanup auto clean timer delete remove storage disk purge prune',
        render: () => (
          <SelectRow
            label="Auto-Cleanup Timer"
            description="Automatically remove finished downloads and delete media files after specified time"
            value={settings?.auto_cleanup_preset || 'disabled'}
            onChange={(val) => {
              updateSetting('auto_cleanup_preset', val);
              if (val === 'disabled') updateSetting('auto_cleanup_timer', 0);
              else if (val === '30m') updateSetting('auto_cleanup_timer', 30);
              else if (val === '1h') updateSetting('auto_cleanup_timer', 60);
              else if (val === '2h') updateSetting('auto_cleanup_timer', 120);
            }}
            options={[
              { label: 'Disabled (Keep files indefinitely)', value: 'disabled' },
              { label: '30 Minutes', value: '30m' },
              { label: '1 Hour', value: '1h' },
              { label: '2 Hours', value: '2h' },
            ]}
            icon={Clock}
          />
        ),
      },
      // Subtitles & Lyrics
      {
        id: 'embed_subtitles',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Embed Closed Captions / Subtitles',
        desc: 'Download and embed subtitle tracks directly into video containers',
        keywords: 'subtitles subs captions cc srt vtt languages translate embed tracks',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.embed_subtitles}
            onChange={(v) => updateSetting('embed_subtitles', v)}
            label="Embed Subtitles"
            description="Download and embed subtitle tracks into video files"
            icon={FileText}
          />
        ),
      },
      {
        id: 'subtitle_languages',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Subtitle Languages',
        desc: 'Comma-separated language codes or regex expressions (e.g. en.*,en,.*-orig)',
        keywords: 'subtitles languages english spanish french codes regex langs tracks',
        render: () => (
          <div className="space-y-1.5 p-3">
            <p className="text-sm font-medium text-zinc-200">Subtitle Languages</p>
            <input
              type="text"
              value={settings?.subtitle_languages || 'en.*,en,.*-orig'}
              onChange={(e) => updateSetting('subtitle_languages', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-700/80 rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono"
            />
          </div>
        ),
      },
      {
        id: 'embed_lyrics',
        tab: 'formats',
        category: 'Formats & Processing',
        title: 'Synced Lyrics Embedding',
        desc: 'Fetch synchronized LRC or unsynced song lyrics and tag them into audio files',
        keywords: 'lyrics lrc synced song words text audio music tag lrc-get',
        render: () => (
          <ToggleSwitch
            enabled={settings?.embed_lyrics !== false}
            onChange={(v) => updateSetting('embed_lyrics', v)}
            label="Embed Synced Lyrics"
            description="Fetch synchronized and unsynced song lyrics into audio metadata"
            icon={Music}
          />
        ),
      },
      // Proof of Origin (PO Token)
      {
        id: 'potoken_settings',
        tab: 'potoken',
        category: 'Proof of Origin (PO Token)',
        title: 'YouTube Proof of Origin (PO Token)',
        desc: 'Bypass YouTube BotGuard challenge and 403 Forbidden errors using PO Tokens',
        keywords: 'pot potoken po token proof of origin youtube botguard challenge 403 bgutil token player gvs visitor origin',
        render: () => (
          <ToggleRow
            enabled={!!settings?.potoken_settings?.enabled}
            onChange={(v) => {
              const current = settings?.potoken_settings || {};
              updateSetting('potoken_settings', { ...current, enabled: v });
            }}
            label="Enable YouTube Proof of Origin"
            description="Mint authentic PO tokens to bypass YouTube player bot detection"
            icon={Cpu}
          />
        ),
      },
      {
        id: 'potoken_mode',
        tab: 'potoken',
        category: 'Proof of Origin (PO Token)',
        title: 'PO Token Provider Mode',
        desc: 'Provider method: BgUtils HTTP Server, No Auth Guest, Authenticated Cookie, or Manual',
        keywords: 'pot potoken bgutil no_auth auth_cookie manual mode provider server',
        render: () => (
          <SelectRow
            label="PO Token Provider Mode"
            description="Method used to acquire and refresh Proof of Origin tokens"
            value={settings?.potoken_settings?.mode || 'no_auth'}
            onChange={(val) => {
              const current = settings?.potoken_settings || {};
              updateSetting('potoken_settings', { ...current, mode: val });
            }}
            options={[
              { label: 'BgUtils HTTP Server (Recommended)', value: 'bgutil_http' },
              { label: 'No Auth (Anonymous BotGuard)', value: 'no_auth' },
              { label: 'Authenticated (Cookie-Paired Session)', value: 'auth_cookie' },
              { label: 'Manual Input (Static Tokens)', value: 'manual' },
            ]}
            icon={Cpu}
          />
        ),
      },
      // JavaScript Engine
      {
        id: 'js_engine',
        tab: 'updates',
        category: 'Updates & System',
        title: 'JavaScript Engine / Runtime',
        desc: 'Runtime interpreter used by yt-dlp to solve YouTube n-sig algorithms (Deno, QuickJS, Node)',
        keywords: 'js javascript engine deno quickjs node runtime interpreter nsig signature',
        render: () => (
          <SelectField
            label="JavaScript Engine"
            description="Runtime used by yt-dlp to solve YouTube n-sig algorithms"
            value={settings?.js_engine || 'nodejs'}
            onChange={(v) => updateSetting('js_engine', v)}
            options={[
              { label: 'Node.js (Standard Node - Container Default)', value: 'nodejs' },
              { label: 'Deno (Fastest)', value: 'deno' },
              { label: 'PhantomJS (Legacy)', value: 'phantomjs' },
            ]}
            icon={Cpu}
          />
        ),
      },
      // Security & Cookies
      {
        id: 'prefer_insecure',
        tab: 'network',
        category: 'Network & Proxy',
        title: 'Allow Insecure HTTPS / SSL',
        desc: 'Bypass SSL / TLS certificate validation errors on legacy or self-signed sites',
        keywords: 'ssl tls certificate insecure https verify cert bypass ignore',
        render: () => (
          <ToggleSwitch
            enabled={!!settings?.prefer_insecure}
            onChange={(v) => updateSetting('prefer_insecure', v)}
            label="Allow Insecure SSL"
            description="Bypass SSL certificate verification for expired or self-signed certs"
            icon={Shield}
          />
        ),
      },
      {
        id: 'cookies_enabled',
        tab: 'cookies',
        category: 'Cookies & Accounts',
        title: 'Enable Netscape Cookies',
        desc: 'Pass imported browser cookies to yt-dlp for private or premium streams',
        keywords: 'cookies netscape session login account auth authenticate premium private',
        render: () => (
          <ToggleSwitch
            enabled={settings?.cookies_enabled !== false}
            onChange={(v) => updateSetting('cookies_enabled', v)}
            label="Enable Netscape Cookies"
            description="Use saved session cookies to authenticate downloads"
            icon={KeyRound}
          />
        ),
      },
    ];

    // Smart multi-term token search: every typed word must match anywhere in title, desc, category, or keywords
    const terms = q.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return items;

    return items.filter((item) => {
      const fullText = `${item.title} ${item.desc} ${item.category} ${item.keywords || ''}`.toLowerCase();
      return terms.every((t) => fullText.includes(t));
    });
  }, [searchQuery, settings, updateSetting]);

  // If loading and no settings yet
  if (isLoading && !settings) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
        <p className="text-xs text-zinc-400 font-medium">Loading application settings...</p>
      </div>
    );
  }

  // ─── Tab Content Renderers ───────────────────────────────────────────

  const renderGeneralTab = () => (
    <div className="space-y-6">
      <SettingsGroup title="General Preferences">
        <ToggleSwitch
          id="setting-incognito_mode"
          enabled={!!settings?.incognito_mode}
          onChange={(v) => updateSetting('incognito_mode', v)}
          label="Incognito Mode"
          description="Downloads won't be saved to the database or show up in history logs"
          icon={IncognitoIcon}
          badge="Privacy"
          badgeColor="bg-purple-500/15 text-purple-300 border-purple-500/30"
        />

        <ToggleSwitch
          id="setting-save_search_history"
          enabled={settings?.save_search_history !== false}
          onChange={(v) => updateSetting('save_search_history', v)}
          label="Search History"
          description="Save searched URLs and queries for quick auto-complete suggestions"
          icon={History}
        />

        <ToggleSwitch
          id="setting-notifications_enabled"
          enabled={settings?.notifications_enabled !== false}
          onChange={(v) => updateSetting('notifications_enabled', v)}
          label="Completion Notifications"
          description="Show desktop notifications and play alert sound when downloads finish"
          icon={Bell}
        />

        <SelectField
          id="setting-theme"
          label="Interface Theme"
          description="Color scheme and visual theme for the web UI"
          value={settings?.theme || 'dark'}
          onChange={(v) => updateSetting('theme', v)}
          options={[
            { label: 'Dark (Default)', value: 'dark' },
            { label: 'OLED Pure Black', value: 'oled' },
            { label: 'System Theme', value: 'system' },
            { label: 'Light', value: 'light' },
          ]}
          icon={Palette}
        />
      </SettingsGroup>

      <SettingsGroup title="Quick Download Defaults">
        <ToggleSwitch
          id="setting-quick_download"
          enabled={!!settings?.quick_download}
          onChange={(v) => updateSetting('quick_download', v)}
          label="Quick Download Mode"
          description="Bypass manual format selection and immediately start downloading with preferred quality"
          icon={DownloadCloud}
        />

        <SelectField
          id="setting-default_video_quality"
          label="Default Video Quality"
          description="Resolution used when quick downloading video tracks"
          value={settings?.default_video_quality || 'best'}
          onChange={(v) => updateSetting('default_video_quality', v)}
          options={[
            { label: 'Best Available', value: 'best' },
            { label: '4K Ultra HD (2160p)', value: '2160' },
            { label: '2K Quad HD (1440p)', value: '1440' },
            { label: '1080p Full HD', value: '1080' },
            { label: '720p HD', value: '720' },
            { label: '480p SD', value: '480' },
            { label: '360p Low', value: '360' },
          ]}
          icon={Film}
        />

        <SelectField
          id="setting-default_audio_quality"
          label="Default Audio Quality"
          description="Bitrate target used when extracting audio tracks"
          value={settings?.default_audio_quality || 'best'}
          onChange={(v) => updateSetting('default_audio_quality', v)}
          options={[
            { label: 'Best (320 kbps)', value: 'best' },
            { label: 'High (256 kbps)', value: '256' },
            { label: 'Medium (192 kbps)', value: '192' },
            { label: 'Low (128 kbps)', value: '128' },
          ]}
          icon={Volume2}
        />
      </SettingsGroup>

      <SettingsGroup title="History & Logs" description="Clear saved download logs, diagnostic traces, and search history">
        {historyClearMessage && (
          <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            historyClearMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {historyClearMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{historyClearMessage.text}</span>
          </div>
        )}
        
        {logsClearMessage && (
          <div className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            logsClearMessage.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' : 'bg-red-500/10 border-red-500/20 text-red-400'
          }`}>
            {logsClearMessage.type === 'success' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            <span>{logsClearMessage.text}</span>
          </div>
        )}

        {/* Clear History Row */}
        <div className="p-4 sm:px-4.5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/20 transition-colors">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-zinc-800/60 text-zinc-400 flex-shrink-0 mt-0.5">
              <History size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200">Clear History</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Remove finished, cancelled, and errored download history records and saved search history queries
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pl-11 sm:pl-0">
            {!showClearHistoryConfirm ? (
              <button
                type="button"
                onClick={() => setShowClearHistoryConfirm(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Clear History
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-fade-in">
                <span className="text-xs text-zinc-400">Confirm?</span>
                <button
                  type="button"
                  onClick={() => setShowClearHistoryConfirm(false)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearHistory}
                  disabled={isClearingHistory}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white"
                >
                  {isClearingHistory ? 'Clearing...' : 'Yes, Clear'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Clear Logs Row */}
        <div className="p-4 sm:px-4.5 sm:py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-800/20 transition-colors border-t border-zinc-800/50">
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            <div className="p-2 rounded-xl bg-zinc-800/60 text-zinc-400 flex-shrink-0 mt-0.5">
              <TerminalSquare size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-200">Clear Execution Logs</p>
              <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                Delete all saved terminal logs, yt-dlp diagnostic files, and in-memory trace logs
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 pl-11 sm:pl-0">
            {!showClearLogsConfirm ? (
              <button
                type="button"
                onClick={() => setShowClearLogsConfirm(true)}
                className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors flex items-center gap-1.5"
              >
                <Trash2 size={14} /> Clear Logs
              </button>
            ) : (
              <div className="flex items-center gap-2 animate-fade-in">
                <span className="text-xs text-zinc-400">Confirm?</span>
                <button
                  type="button"
                  onClick={() => setShowClearLogsConfirm(false)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleClearLogs}
                  disabled={isClearingLogs}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-red-500 hover:bg-red-600 text-white"
                >
                  {isClearingLogs ? 'Deleting...' : 'Yes, Delete'}
                </button>
              </div>
            )}
          </div>
        </div>
      </SettingsGroup>
    </div>
  );

  const renderDirectoriesTab = () => (
    <div className="space-y-6">
      <SettingsGroup title="Storage Locations">
        <PathInputSetting
          id="setting-download_dir"
          label="Download Directory"
          description="Default folder where completed downloads are saved. If empty, uses your system Downloads folder."
          value={settings?.download_dir}
          onChange={(v) => updateSetting('download_dir', v)}
          placeholder="~/Downloads (System Default)"
          onBrowse={() => handleSelectFolder('download_dir')}
          onReset={() => updateSetting('download_dir', '')}
          icon={Folder}
        />

        <PathInputSetting
          id="setting-temp_dir"
          label="Staging / Temporary Path"
          description="Working folder where chunks and fragments are temporarily buffered before finalizing."
          value={settings?.temp_dir}
          onChange={(v) => updateSetting('temp_dir', v)}
          placeholder="System Temp Directory"
          onBrowse={() => handleSelectFolder('temp_dir')}
          onReset={() => updateSetting('temp_dir', '')}
          icon={Layers}
        />
      </SettingsGroup>

      <SettingsGroup title="Organization & Filename Formatting">
        <ToggleSwitch
          id="setting-create_subdirectories"
          enabled={!!settings?.create_subdirectories}
          onChange={(v) => updateSetting('create_subdirectories', v)}
          label="Create Subdirectories"
          description="Organize downloads into dedicated subdirectories based on artist, playlist, or date"
          icon={Folder}
        >
          {settings?.create_subdirectories && (
            <div className="pl-0 sm:pl-11 space-y-2 border-t border-zinc-800/60 pt-3">
              <p className="text-xs font-medium text-zinc-300">Subdirectory Template</p>
              <input
                type="text"
                value={settings?.subdirectory_template || '%(uploader)s'}
                onChange={(e) => updateSetting('subdirectory_template', e.target.value)}
                placeholder="%(uploader)s"
                className="w-full bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl px-3.5 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
              />
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <span className="text-[11px] text-zinc-500 mr-1">Insert token:</span>
                {SUBDIR_TOKENS.map((t) => (
                  <button
                    key={t.token}
                    type="button"
                    onClick={() =>
                      handleAppendToken('subdirectory_template', settings?.subdirectory_template, t.token)
                    }
                    className="text-[11px] font-mono px-2 py-0.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-cyan-400 border border-zinc-700/50 hover:border-cyan-500/40 transition-colors"
                    title={t.desc}
                  >
                    +{t.token}
                  </button>
                ))}
              </div>
            </div>
          )}
        </ToggleSwitch>

        <SettingsRow id="setting-custom_filename_template">
          <div className="space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 mt-0.5 flex-shrink-0">
                <FileText size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">Output Filename Template</span>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Clickable tokens will be replaced with metadata extracted from each media URL
                </p>
              </div>
            </div>

            <div className="space-y-3 pl-0 sm:pl-11">
              <div className="relative">
                <input
                  type="text"
                  data-settings-key="custom_filename_template"
                  value={filenameTemplate}
                  onChange={handleFilenameChange}
                  onBlur={() => commitFilenameTemplate(filenameTemplate)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.target.blur(); } }}
                  className="w-full bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
                />
                <button
                  type="button"
                  onClick={handleFilenameReset}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-700/60 hover:border-zinc-600"
                  title="Reset to %(title)s.%(ext)s"
                >
                  Reset
                </button>
              </div>

              {/* Clickable Token Chips */}
              <div>
                <p className="text-xs font-semibold text-zinc-400 mb-2 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-cyan-400" /> Click to append token:
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {FILENAME_TOKENS.map((tokenObj) => (
                    <button
                      key={tokenObj.token}
                      type="button"
                      onClick={() => handleFilenameTokenAppend(tokenObj.token)}
                      className="group px-2.5 py-1 rounded-lg bg-zinc-800/60 hover:bg-cyan-500/10 border border-zinc-700/50 hover:border-cyan-500/40 transition-all text-left"
                      title={tokenObj.desc}
                    >
                      <span className="text-xs font-mono font-medium text-cyan-300 group-hover:text-cyan-200">
                        {tokenObj.token}
                      </span>
                      <span className="text-[10px] text-zinc-400 ml-1.5">({tokenObj.label})</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Realtime Filename Preview */}
              <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs">
                <span className="text-zinc-500 font-medium">Live Preview: </span>
                <span className="font-mono text-cyan-400 font-semibold break-all">
                  {previewFilename(filenameTemplate)}
                </span>
              </div>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>
    </div>
  );

  const renderDownloadingTab = () => (
    <div className="space-y-6">
      <SettingsGroup title="Concurrency & Bandwidth">
        <StepperInput
          id="setting-concurrent_downloads"
          label="Max Concurrent Downloads"
          description="Maximum simultaneous active download workers in the queue (1 to 10)"
          value={settings?.concurrent_downloads ?? 3}
          onChange={(v) => updateSetting('concurrent_downloads', v)}
          min={1}
          max={10}
          step={1}
          icon={DownloadCloud}
        />

        <StepperInput
          id="setting-download_speed_limit"
          label="Download Speed Limit"
          description="Throttle bandwidth limit per download stream (0 = unlimited)"
          value={settings?.download_speed_limit ?? 0}
          onChange={(v) => updateSetting('download_speed_limit', v)}
          min={0}
          max={102400}
          step={1024}
          unit="KB/s"
          presets={SPEED_PRESETS}
          icon={Sliders}
        />

        <StepperInput
          id="setting-concurrent_fragments"
          label="Concurrent Fragment Connections"
          description="Parallel chunk threads per download stream for DASH and HLS video"
          value={settings?.concurrent_fragments ?? 5}
          onChange={(v) => updateSetting('concurrent_fragments', v)}
          min={1}
          max={25}
          step={1}
          icon={Wifi}
        />
      </SettingsGroup>

      <SettingsGroup title="Resilience & Retries">
        <ToggleSwitch
          id="setting-continue_downloads"
          enabled={settings?.continue_downloads !== false}
          onChange={(v) => updateSetting('continue_downloads', v)}
          label="Resume Incomplete Downloads"
          description="Continue partially downloaded files instead of restarting from the beginning"
          icon={DownloadCloud}
        />

        <StepperInput
          id="setting-retries"
          label="Auto-Retry Count"
          description="Number of times yt-dlp will automatically retry dropped HTTP streams"
          value={settings?.retries ?? 10}
          onChange={(v) => updateSetting('retries', v)}
          min={0}
          max={50}
          step={1}
          icon={RotateCcw}
        />

        <StepperInput
          id="setting-retry_sleep"
          label="Retry Delay"
          description="Duration in seconds to pause between reconnection attempts"
          value={settings?.retry_sleep ?? 5}
          onChange={(v) => updateSetting('retry_sleep', v)}
          min={0}
          max={60}
          step={1}
          unit="seconds"
          icon={RotateCcw}
        />

        <ToggleSwitch
          id="setting-log_downloads"
          enabled={settings?.log_downloads !== false}
          onChange={(v) => updateSetting('log_downloads', v)}
          label="Log Downloads"
          description={
            settings?.incognito_mode 
              ? "Create a log file for each download (currently suppressed by Incognito Mode)" 
              : "Create a log file for each download"
          }
          icon={FileText}
          badge={settings?.incognito_mode ? "Incognito Active" : undefined}
          badgeColor={settings?.incognito_mode ? "bg-purple-500/15 text-purple-300 border-purple-500/30" : undefined}
        />
      </SettingsGroup>

      <SettingsGroup 
        title="Direct File Download & Auto-Cleanup" 
        description="Configure client device file downloads and automated server storage cleanup"
        badge="Docker & Remote"
        badgeColor="bg-blue-500/10 text-blue-400 border-blue-500/30"
      >
        <ToggleRow
          id="setting-enable_browser_download"
          enabled={!!settings?.enable_browser_download}
          onChange={(v) => updateSetting('enable_browser_download', v)}
          label="Direct Browser Download"
          description="Display a download button on finished video cards to save files directly to your device. Essential for Docker containers and remote server setups."
          icon={Download}
        />

        <div className={`transition-all duration-300 border-t border-zinc-800/50 ${
          !settings?.enable_browser_download 
            ? 'opacity-40 pointer-events-none select-none grayscale' 
            : 'opacity-100'
        }`}>
          <SelectRow
            id="setting-auto_cleanup_timer"
            label="Auto-Cleanup Timer"
            description="Automatically remove finished downloads from the list and delete media files from server storage after the specified time"
            value={settings?.auto_cleanup_preset || (settings?.auto_cleanup_timer ? (settings.auto_cleanup_timer === 30 ? '30m' : settings.auto_cleanup_timer === 60 ? '1h' : settings.auto_cleanup_timer === 120 ? '2h' : 'custom') : 'disabled')}
            onChange={(val) => {
              if (val === 'disabled') {
                updateSetting('auto_cleanup_preset', 'disabled');
                updateSetting('auto_cleanup_timer', 0);
              } else if (val === '30m') {
                updateSetting('auto_cleanup_preset', '30m');
                updateSetting('auto_cleanup_timer', 30);
              } else if (val === '1h') {
                updateSetting('auto_cleanup_preset', '1h');
                updateSetting('auto_cleanup_timer', 60);
              } else if (val === '2h') {
                updateSetting('auto_cleanup_preset', '2h');
                updateSetting('auto_cleanup_timer', 120);
              } else if (val === 'custom') {
                updateSetting('auto_cleanup_preset', 'custom');
                if (!settings?.auto_cleanup_timer) {
                  updateSetting('auto_cleanup_timer', 15);
                }
              }
            }}
            disabled={!settings?.enable_browser_download}
            options={[
              { label: 'Disabled (Keep files indefinitely)', value: 'disabled' },
              { label: '30 Minutes', value: '30m' },
              { label: '1 Hour', value: '1h' },
              { label: '2 Hours', value: '2h' },
              { label: 'Custom Duration', value: 'custom' },
            ]}
            icon={Clock}
          />

          {(settings?.auto_cleanup_preset === 'custom' || (!['disabled', '30m', '1h', '2h'].includes(settings?.auto_cleanup_preset) && (settings?.auto_cleanup_timer || 0) > 0 && ![0, 30, 60, 120].includes(settings?.auto_cleanup_timer))) && (
            <StepperRow
              label="Custom Cleanup Timer"
              description="Minutes before finished downloads and files are purged from the system"
              value={settings?.auto_cleanup_timer || 15}
              onChange={(v) => updateSetting('auto_cleanup_timer', Math.max(1, parseInt(v) || 1))}
              min={1}
              max={10080}
              step={5}
              unit="minutes"
              icon={Clock}
              disabled={!settings?.enable_browser_download}
            />
          )}
        </div>
      </SettingsGroup>

      <SettingsGroup 
        title="Duplicate Prevention" 
        description="Prevent redundant downloads and track completed media"
        badge="Protection"
        badgeColor="bg-amber-500/10 text-amber-400 border-amber-500/30"
      >
        <SelectRow
          id="setting-prevent_duplicate_downloads"
          label="Prevent Duplicate Downloads"
          description="Detection mode used to block duplicate requests and warn on existing files"
          value={settings?.prevent_duplicate_downloads || 'url_type'}
          onChange={(v) => {
            updateSetting('prevent_duplicate_downloads', v);
            if (v === 'download_archive') {
              fetchArchiveStatus();
            }
          }}
          options={[
            { label: 'Disabled (Off) — Allow duplicate downloads', value: 'off' },
            { label: 'By URL & Media Type (Recommended) — Video and Audio separate', value: 'url_type' },
            { label: 'By URL — Block any duplicate link regardless of type', value: 'url' },
            { label: 'Download Archive (yt-dlp) — Track IDs in archive.txt', value: 'download_archive' },
            { label: 'By Exact Configuration — Block matching format IDs & commands', value: 'config' },
          ]}
          icon={CopyCheck}
        />

        {settings?.prevent_duplicate_downloads === 'download_archive' && (
          <div className="pt-2 pb-1 space-y-3">
            <PathInputRow
              id="setting-download_archive_path"
              label="Download Archive File Path"
              description="Text file on disk where yt-dlp records every downloaded extractor + ID"
              value={settings?.download_archive_path || 'data/download_archive.txt'}
              onChange={(v) => updateSetting('download_archive_path', v)}
              placeholder="data/download_archive.txt"
              icon={Archive}
              badge="yt-dlp native"
            />

            {/* Live Archive Status Card */}
            <div className="p-4 rounded-xl bg-zinc-900/80 border border-zinc-800/80 space-y-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                    <Archive size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-zinc-200">Archive Statistics</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700/50">
                        {archiveStatus?.entry_count ?? 0} {archiveStatus?.entry_count === 1 ? 'item' : 'items'}
                      </span>
                    </div>
                    <p className="text-xs text-zinc-400">
                      File: <code className="text-zinc-300 font-mono text-[11px]">{archiveStatus?.path || 'data/download_archive.txt'}</code>
                      {archiveStatus?.size_bytes ? ` (${(archiveStatus.size_bytes / 1024).toFixed(1)} KB)` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-stretch sm:self-auto">
                  <button
                    type="button"
                    onClick={handleToggleArchiveEntries}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center gap-1.5 border border-zinc-700/60"
                  >
                    {loadingArchiveEntries ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                    <span>{showArchiveEntries ? 'Hide Entries' : 'View Entries'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowClearArchiveConfirm(true)}
                    disabled={isClearingArchive || !archiveStatus?.entry_count}
                    className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 hover:bg-red-500/20 text-red-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5 border border-red-500/30"
                  >
                    {isClearingArchive ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    <span>Clear Archive</span>
                  </button>
                </div>
              </div>

              {/* Archive Feedback notification */}
              {archiveFeedback && (
                <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  archiveFeedback.type === 'success' 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {archiveFeedback.type === 'success' ? <Check size={12} /> : <AlertCircle size={12} />}
                  <span>{archiveFeedback.text}</span>
                </div>
              )}

              {/* Expandable Entries List */}
              {showArchiveEntries && (
                <div className="mt-3 pt-3 border-t border-zinc-800/80 space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400 pb-1">
                    <span>Recent Recorded Video IDs (max 100)</span>
                    <span>{archiveEntries.length} entries shown</span>
                  </div>
                  {archiveEntries.length === 0 ? (
                    <div className="p-3 text-center text-xs text-zinc-400 bg-zinc-950/40 rounded-lg">
                      No records in archive file yet.
                    </div>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                      {archiveEntries.map((e, idx) => (
                        <div key={idx} className="flex items-center justify-between px-2.5 py-1 rounded bg-zinc-950/60 border border-zinc-800/50">
                          <span className="text-cyan-400">{e.extractor}</span>
                          <span className="text-zinc-300 font-semibold">{e.id}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Confirmation Modal for Clearing Archive */}
              {showClearArchiveConfirm && (
                <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 space-y-2.5">
                  <p className="text-xs text-red-200">
                    Are you sure you want to clear the yt-dlp download archive? Videos previously recorded may be redownloaded if duplicate prevention relies on this archive.
                  </p>
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowClearArchiveConfirm(false)}
                      className="px-2.5 py-1 rounded text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleClearArchive}
                      className="px-2.5 py-1 rounded text-xs bg-red-600 hover:bg-red-500 text-white font-medium transition-colors"
                    >
                      Confirm Clear
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </SettingsGroup>
    </div>
  );

  const renderFormatsTab = () => (
    <div className="space-y-6">
      <SettingsGroup title="Preferred Containers & Codecs">
        <SelectField
          id="setting-default_video_container"
          label="Default Video Container"
          description="Target container for merged video streams"
          value={settings?.default_video_container || 'auto'}
          onChange={(v) => updateSetting('default_video_container', v)}
          options={[
            { label: 'Auto (Best Match)', value: 'auto' },
            { label: 'MP4 (Universal compatibility)', value: 'mp4' },
            { label: 'MKV (Matroska - Multi-subs/audio)', value: 'mkv' },
            { label: 'WEBM (Google WebM / VP9)', value: 'webm' },
          ]}
          icon={Film}
        />

        <SelectField
          id="setting-default_audio_container"
          label="Default Audio Container"
          description="Target format when downloading audio-only streams"
          value={settings?.default_audio_container || 'mp3'}
          onChange={(v) => updateSetting('default_audio_container', v)}
          options={[
            { label: 'MP3 (Universal compatibility)', value: 'mp3' },
            { label: 'M4A (Apple AAC)', value: 'm4a' },
            { label: 'OPUS (Modern & efficient)', value: 'opus' },
            { label: 'FLAC (Lossless Studio Quality)', value: 'flac' },
          ]}
          icon={Volume2}
        />

        <SelectField
          id="setting-preferred_video_codec"
          label="Preferred Video Codec"
          description="Prioritize streams encoded with this video codec"
          value={settings?.preferred_video_codec || 'auto'}
          onChange={(v) => updateSetting('preferred_video_codec', v)}
          options={[
            { label: 'Auto (Highest Quality)', value: 'auto' },
            { label: 'AV1 (av01 - Next-Gen Efficiency)', value: 'av01' },
            { label: 'VP9 (YouTube Web standard)', value: 'vp9' },
            { label: 'H.264 (avc1 - Universal hardware support)', value: 'h264' },
          ]}
          icon={Cpu}
        />

        <SelectField
          id="setting-preferred_audio_codec"
          label="Preferred Audio Codec"
          description="Prioritize streams encoded with this audio codec"
          value={settings?.preferred_audio_codec || 'auto'}
          onChange={(v) => updateSetting('preferred_audio_codec', v)}
          options={[
            { label: 'Auto (Best)', value: 'auto' },
            { label: 'AAC (High compatibility)', value: 'aac' },
            { label: 'Opus (High quality)', value: 'opus' },
            { label: 'MP3 (LAME standard)', value: 'mp3' },
            { label: 'Vorbis (Ogg)', value: 'vorbis' },
          ]}
          icon={Volume2}
        />
      </SettingsGroup>

      <SettingsGroup title="Post-Processing & Embedding">
        <ToggleSwitch
          id="setting-embed_metadata"
          enabled={settings?.embed_metadata !== false}
          onChange={(v) => updateSetting('embed_metadata', v)}
          label="Embed Metadata Tags"
          description="Write artist, title, album, and release date ID3 tags into the output file"
          icon={FileText}
        />

        <ToggleSwitch
          id="setting-embed_thumbnail"
          enabled={settings?.embed_thumbnail !== false}
          onChange={(v) => updateSetting('embed_thumbnail', v)}
          label="Embed Thumbnail Artwork"
          description="Save high-resolution video thumbnail as embedded album artwork"
          icon={Film}
        />

        <ToggleSwitch
          id="setting-embed_chapters"
          enabled={settings?.embed_chapters !== false}
          onChange={(v) => updateSetting('embed_chapters', v)}
          label="Embed Chapters"
          description="Mux video chapter markers into container for quick media player navigation"
          icon={Layers}
        />

        <ToggleSwitch
          id="setting-embed_subtitles"
          enabled={settings?.embed_subtitles !== false}
          onChange={(v) => updateSetting('embed_subtitles', v)}
          label="Embed Subtitles"
          description="Mux closed captions and translated subtitles directly into the video file"
          icon={FileText}
        >
          {settings?.embed_subtitles !== false && (
            <div id="setting-subtitle_languages" data-setting-id="setting-subtitle_languages" className="pl-0 sm:pl-11 pt-2 border-t border-zinc-800/60 space-y-1.5 rounded-lg transition-all">
              <p className="text-xs font-medium text-zinc-300">Subtitle Languages (Regex)</p>
              <input
                type="text"
                value={settings?.subtitle_languages || 'en.*,en,.*-orig'}
                onChange={(e) => updateSetting('subtitle_languages', e.target.value)}
                placeholder="en.*,en,.*-orig"
                className="w-full bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 focus:outline-none focus:border-cyan-500/60 shadow-inner"
              />
              <p className="text-[11px] text-zinc-500">
                Comma-separated regex patterns (e.g. <code>en.*,es,.*-orig</code>)
              </p>
            </div>
          )}
        </ToggleSwitch>

        <ToggleSwitch
          id="setting-embed_lyrics"
          enabled={settings?.embed_lyrics !== false}
          onChange={(v) => updateSetting('embed_lyrics', v)}
          label="Embed Synced LRC Lyrics"
          description="Fetch and embed synchronized time-stamped lyrics into audio files"
          icon={Volume2}
        />
      </SettingsGroup>
    </div>
  );

  const renderSponsorBlockTab = () => {
    const isSponsorBlockEnabled = Boolean(settings?.sponsorblock_remove || settings?.remove_sponsorblock_default);
    const selectedCats = settings?.sponsorblock_categories || ['sponsor', 'selfpromo', 'interaction'];

    const handleToggleCategory = (catId) => {
      if (!isSponsorBlockEnabled) return;
      let updated;
      if (selectedCats.includes(catId)) {
        updated = selectedCats.filter((c) => c !== catId);
      } else {
        updated = [...selectedCats, catId];
      }
      updateSetting('sponsorblock_categories', updated);
    };

    const handleSelectAll = () => {
      if (!isSponsorBlockEnabled) return;
      updateSetting(
        'sponsorblock_categories',
        SPONSORBLOCK_CATEGORIES.map((c) => c.id)
      );
    };

    const handleResetCategories = () => {
      if (!isSponsorBlockEnabled) return;
      updateSetting('sponsorblock_categories', ['sponsor', 'selfpromo', 'interaction']);
    };

    return (
      <div className="space-y-6">
        <SettingsGroup title="SponsorBlock Integration">
          <ToggleSwitch
            id="setting-sponsorblock_remove"
            enabled={isSponsorBlockEnabled}
            onChange={(v) => {
              updateSetting('sponsorblock_remove', v);
              updateSetting('remove_sponsorblock_default', v);
            }}
            label="Auto-Remove Sponsor Segments"
            description="Cut out promotional segments, self-promotions, and intros using the crowd-sourced SponsorBlock API"
            icon={Shield}
            badge="Recommended"
          />
        </SettingsGroup>

        {/* Child Options: Grayed out and unclickable when main toggle is OFF */}
        <div
          className={`transition-all duration-300 ${
            !isSponsorBlockEnabled
              ? 'opacity-35 pointer-events-none select-none filter grayscale-[40%]'
              : 'opacity-100'
          }`}
        >
          <SettingsGroup
            title="Categories to Cut"
            description="Select which segments to automatically excise from downloaded media"
            headerAction={
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={!isSponsorBlockEnabled}
                  onClick={handleSelectAll}
                  className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Select All
                </button>
                <button
                  type="button"
                  disabled={!isSponsorBlockEnabled}
                  onClick={handleResetCategories}
                  className="text-xs px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reset Default
                </button>
              </div>
            }
          >
            {SPONSORBLOCK_CATEGORIES.map((cat) => {
              const isChecked = selectedCats.includes(cat.id);
              return (
                <div
                  key={cat.id}
                  onClick={() => handleToggleCategory(cat.id)}
                  className={`p-4 sm:px-5 flex items-start sm:items-center justify-between gap-3 select-none transition-colors ${
                    isSponsorBlockEnabled ? 'cursor-pointer hover:bg-zinc-800/30' : 'cursor-not-allowed'
                  }`}
                  role="checkbox"
                  aria-checked={isChecked}
                  aria-disabled={!isSponsorBlockEnabled}
                >
                  <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                    <div className={`mt-0.5 sm:mt-0 flex-shrink-0 ${isChecked ? 'text-cyan-400' : 'text-zinc-600'}`}>
                      {isChecked ? <CheckSquare size={18} /> : <Square size={18} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-zinc-200">{cat.label}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded border ${cat.badge}`}>
                          {cat.id}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">{cat.desc}</p>
                    </div>
                  </div>

                  <div className="flex-shrink-0 ml-2">
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${
                        isChecked
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                          : 'bg-zinc-800/60 text-zinc-500 border-zinc-700/40'
                      }`}
                    >
                      {isChecked ? 'Active' : 'Ignored'}
                    </span>
                  </div>
                </div>
              );
            })}
          </SettingsGroup>
        </div>
      </div>
    );
  };

  const renderNetworkTab = () => (
    <div className="space-y-6">
      <SettingsGroup title="Proxy & Connection">
        <SettingsRow id="setting-socks5_proxy">
          <div className="space-y-2">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 mt-0.5 flex-shrink-0">
                <Wifi size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">Proxy URL</span>
                <p className="text-xs text-zinc-400 mt-0.5">Route requests through an HTTP, HTTPS, or SOCKS5 proxy server</p>
              </div>
            </div>
            <div className="pl-0 sm:pl-11 space-y-1.5">
              <input
                type="text"
                value={settings?.socks5_proxy || settings?.proxy_url || ''}
                onChange={(e) => {
                  updateSetting('socks5_proxy', e.target.value);
                  updateSetting('proxy_url', e.target.value);
                }}
                placeholder="socks5://127.0.0.1:1080 or http://user:pass@127.0.0.1:8080"
                className="w-full bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl px-3.5 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
              />
              <p className="text-[11px] text-zinc-500">
                Format: <code>protocol://[user:password@]host[:port]</code> (Leave empty for direct connection)
              </p>
            </div>
          </div>
        </SettingsRow>

        <StepperInput
          id="setting-socket_timeout"
          label="Socket Timeout"
          description="Timeout limit in seconds before aborting stalled connections"
          value={settings?.socket_timeout || 30}
          onChange={(v) => updateSetting('socket_timeout', v)}
          min={5}
          max={180}
          step={5}
          unit="sec"
          icon={Wifi}
        />

        <ToggleSwitch
          id="setting-force_ipv4"
          enabled={!!settings?.force_ipv4}
          onChange={(v) => updateSetting('force_ipv4', v)}
          label="Force IPv4"
          description="Force all socket connections through IPv4 (resolves IPv6 ISP blocking and rate limits)"
          icon={Wifi}
        />

        <ToggleSwitch
          id="setting-prefer_insecure"
          enabled={!!settings?.prefer_insecure}
          onChange={(v) => updateSetting('prefer_insecure', v)}
          label="Allow Insecure HTTPS / SSL"
          description="Bypass SSL / TLS certificate validation errors on legacy or self-signed sites"
          icon={Shield}
        />
      </SettingsGroup>

      <SettingsGroup title="Identification & Geo-Bypass">
        <SettingsRow id="setting-custom_user_agent">
          <div className="space-y-2">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 mt-0.5 flex-shrink-0">
                <Globe size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">Custom User-Agent</span>
                <p className="text-xs text-zinc-400 mt-0.5">Custom HTTP User-Agent string sent with web requests</p>
              </div>
            </div>
            <div className="pl-0 sm:pl-11 space-y-2">
              <input
                type="text"
                value={settings?.custom_user_agent || ''}
                onChange={(e) => updateSetting('custom_user_agent', e.target.value)}
                placeholder="Default yt-dlp User-Agent"
                className="w-full bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl px-3.5 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500/60 focus:ring-1 focus:ring-cyan-500/30 transition-all shadow-inner"
              />
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-zinc-500">Presets:</span>
                {USER_AGENT_PRESETS.map((ua) => (
                  <button
                    key={ua.label}
                    type="button"
                    onClick={() => updateSetting('custom_user_agent', ua.value)}
                    className="text-[10px] px-2 py-0.5 rounded-md bg-zinc-800/70 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors"
                  >
                    {ua.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </SettingsRow>

        <SelectField
          id="setting-impersonate_target"
          label="Browser Impersonation (TLS Anti-Bot)"
          description="Mimics real browser TLS signatures (JA3/JA4) via curl-cffi to bypass Datacenter/VPS IP blocks"
          value={settings?.impersonate_target || 'chrome'}
          onChange={(v) => updateSetting('impersonate_target', v)}
          options={[
            { label: 'Chrome (Recommended - Real Browser TLS Fingerprint)', value: 'chrome' },
            { label: 'Safari (Apple WebKit TLS Fingerprint)', value: 'safari' },
            { label: 'Edge (Microsoft Edge TLS Fingerprint)', value: 'edge' },
            { label: 'Disabled (Raw Python requests)', value: 'none' },
          ]}
          icon={Shield}
        />

        <ToggleSwitch
          id="setting-geo_bypass"
          enabled={settings?.geo_bypass !== false}
          onChange={(v) => updateSetting('geo_bypass', v)}
          label="Geographic Restriction Bypass"
          description="Simulate client IP and country headers to bypass region-locked media"
          icon={Globe}
        >
          {settings?.geo_bypass !== false && (
            <div className="pl-0 sm:pl-11 pt-2 border-t border-zinc-800/60 flex items-center gap-3">
              <div className="w-48">
                <p className="text-xs font-medium text-zinc-300 mb-1">Country Code (ISO 3166-1)</p>
                <input
                  type="text"
                  maxLength={2}
                  value={settings?.geo_bypass_country || 'US'}
                  onChange={(e) => updateSetting('geo_bypass_country', e.target.value.toUpperCase())}
                  placeholder="US"
                  className="w-full bg-zinc-950/80 border border-zinc-700/70 rounded-xl px-3 py-1.5 text-sm font-mono uppercase text-zinc-200 text-center focus:outline-none focus:border-cyan-500/60"
                />
              </div>
              <p className="text-xs text-zinc-500 mt-4">e.g. US, GB, DE, JP</p>
            </div>
          )}
        </ToggleSwitch>
      </SettingsGroup>
    </div>
  );

  const renderCookiesTab = () => (
    <div className="space-y-6">
      {/* Feedback Toast */}
      {cookieFeedback && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 ${
            cookieFeedback.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {cookieFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          <span>{cookieFeedback.text}</span>
        </div>
      )}

      {/* Manual Upload & Paste */}
      <SettingsGroup title="Netscape Cookies Import">
        <SettingsRow id="setting-netscape_cookies">
          <div className="space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-cyan-400 mt-0.5 flex-shrink-0">
                <Upload size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-semibold text-zinc-100">Import Netscape Cookie File</span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Exported from browser extensions like "Get cookies.txt LOCALLY" or "EditThisCookie"
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2.5 pl-0 sm:pl-11 pt-1 flex-wrap">
              <input
                type="file"
                ref={fileInputRef}
                accept=".txt"
                onChange={handleCookieFileUpload}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={parsingCookies}
                className="px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/70 text-xs font-semibold transition-colors flex items-center gap-1.5 disabled:opacity-50"
              >
                {parsingCookies ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                Upload cookies.txt File
              </button>

              <button
                type="button"
                onClick={() => setShowCookiePasteModal(!showCookiePasteModal)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-zinc-700/60 text-xs font-medium transition-colors flex items-center gap-1.5"
              >
                <FileText size={14} />
                {showCookiePasteModal ? 'Hide Text Area' : 'Paste Raw Netscape Text'}
              </button>

              {settings?.site_cookies?.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllCookies}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-medium transition-colors flex items-center gap-1"
                >
                  <Trash2 size={13} />
                  Clear All
                </button>
              )}
            </div>

            {/* Collapsible Raw Cookie Textarea */}
            {showCookiePasteModal && (
              <div className="pl-0 sm:pl-11 pt-3 space-y-2 border-t border-zinc-800/60 animate-fade-in">
                <textarea
                  value={pastedCookies}
                  onChange={(e) => setPastedCookies(e.target.value)}
                  placeholder="# Netscape HTTP Cookie File&#10;# http://curl.haxx.se/rfc/cookie_spec.html&#10;.youtube.com   TRUE   /   TRUE   1742000000   LOGIN_INFO   ..."
                  className="w-full h-32 bg-zinc-950/80 border border-zinc-700/70 hover:border-zinc-600 rounded-xl p-3 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500/60"
                />
                <button
                  type="button"
                  onClick={handlePasteCookiesSubmit}
                  disabled={!pastedCookies.trim() || parsingCookies}
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-zinc-950 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  {parsingCookies ? 'Parsing...' : 'Parse & Save Cookies'}
                </button>
              </div>
            )}
          </div>
        </SettingsRow>
      </SettingsGroup>

      {/* Saved Site Accounts */}
      <SettingsGroup
        id="setting-cookies_enabled"
        title={`Saved Site Cookies (${settings?.site_cookies?.length || 0})`}
        description="Active authentication tokens used for authenticated downloads"
      >
        {settings?.site_cookies && settings.site_cookies.length > 0 ? (
          settings.site_cookies.map((cookie) => (
            <div
              key={cookie.id}
              className="flex items-center justify-between p-4 sm:px-5 hover:bg-zinc-800/20 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-2.5 h-2.5 rounded-full ${
                    cookie.enabled ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50' : 'bg-zinc-600'
                  }`}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-100">{cookie.domain}</span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded uppercase ${
                        cookie.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-zinc-800 text-zinc-400'
                      }`}
                    >
                      {cookie.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {cookie.cookie_count || 0} cookies • {cookie.last_updated || 'Active'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleVerifySiteCookie(cookie.id)}
                  disabled={verifyingSiteId === cookie.id}
                  className="text-xs px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                  title="Test cookie extraction with yt-dlp"
                >
                  {verifyingSiteId === cookie.id ? (
                    <Loader2 size={12} className="animate-spin text-cyan-400" />
                  ) : null}
                  {verifyingSiteId === cookie.id ? 'Verifying...' : 'Verify'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteSiteCookie(cookie.id)}
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Delete cookie"
                >
                  <Trash2 size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => handleToggleSiteCookie(cookie.id)}
                  className={`toggle-switch flex-shrink-0 ${cookie.enabled ? 'active' : ''}`}
                  role="switch"
                  aria-checked={cookie.enabled}
                  title={cookie.enabled ? 'Active (Click to disable)' : 'Disabled (Click to enable)'}
                />
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-center">
            <KeyRound size={24} className="mx-auto text-zinc-600 mb-2" />
            <p className="text-xs text-zinc-400 font-medium">No saved account cookies yet.</p>
            <p className="text-[11px] text-zinc-500 mt-1 max-w-sm mx-auto">
              Upload or paste a Netscape format cookies.txt file above to access age-restricted, premium, and member-only videos.
            </p>
          </div>
        )}
      </SettingsGroup>
    </div>
  );

  const renderPoTokenTab = () => {
    const isEnabled = Boolean(poSettings.enabled);
    const activeMode = poSettings.mode || 'no_auth';
    const status = poSettings.token_status || 'idle';
    const clients = poSettings.player_clients || ['ios', 'android', 'mweb', 'web'];
    const availableClients = ['ios', 'android', 'mweb', 'web', 'tv_embedded'];
    const hasCookies = (settings?.site_cookies && settings.site_cookies.length > 0) || Boolean(settings?.cookies_content?.trim());

    return (
      <div className="space-y-6">
        {/* Feedback Alert */}
        {potokenFeedback && (
          <div
            className={`p-3.5 rounded-xl border text-xs flex items-center gap-2.5 transition-all ${
              potokenFeedback.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-red-500/10 border-red-500/30 text-red-300'
            }`}
          >
            {potokenFeedback.type === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
            <span>{potokenFeedback.text}</span>
          </div>
        )}

        {/* Master Toggle & Status Header */}
        <SettingsGroup title="Proof of Origin Engine">
          <SettingsRow
            id="setting-potoken_settings"
            onClick={() => handleUpdatePoSetting('enabled', !isEnabled)}
            className="cursor-pointer select-none"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className={`p-2.5 rounded-xl border flex-shrink-0 transition-colors ${
                  isEnabled
                    ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400'
                    : 'bg-zinc-800/60 border-zinc-700/50 text-zinc-500'
                }`}>
                  <Cpu size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-zinc-100">
                      Proof of Origin (PO Token) Bypass
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                      !isEnabled
                        ? 'bg-zinc-800 border-zinc-700 text-zinc-400'
                        : status === 'ready' || status === 'connected'
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
                        : status === 'error'
                        ? 'bg-red-500/15 border-red-500/30 text-red-300'
                        : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                    }`}>
                      {!isEnabled
                        ? 'Disabled'
                        : status === 'ready'
                        ? 'Tokens Verified'
                        : status === 'connected'
                        ? 'Daemon Connected'
                        : status === 'error'
                        ? 'Error'
                        : 'Idle'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1 max-w-xl">
                    Circumvents YouTube BotGuard challenges, HTTP 429 throttling, and player signature blocks by synthesizing valid web and mobile Proof of Origin tokens with rotating player client profiles.
                  </p>
                </div>
              </div>
              <ToggleSwitch
                checked={isEnabled}
                onChange={(val) => handleUpdatePoSetting('enabled', val)}
                aria-label="Toggle Proof of Origin"
              />
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* Master Disabled Prompt Banner */}
        {!isEnabled && (
          <div className="p-3.5 px-4 rounded-2xl bg-zinc-900/50 border border-zinc-800/80 text-xs text-zinc-400 flex items-center justify-between gap-3 shadow-sm">
            <div className="flex items-center gap-2.5">
              <Info size={16} className="text-zinc-500 flex-shrink-0" />
              <span>Proof of Origin is disabled. Turn on the switch above to activate token generation, select provider modes, and configure client priority.</span>
            </div>
            <button
              type="button"
              onClick={() => handleUpdatePoSetting('enabled', true)}
              className="px-3 py-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold whitespace-nowrap transition-colors"
            >
              Enable Now
            </button>
          </div>
        )}

        {/* Child Options: Greyed out and unclickable when Master Toggle is OFF */}
        <div className={`space-y-6 transition-all duration-300 ${
          !isEnabled
            ? 'opacity-35 pointer-events-none select-none filter grayscale-[40%]'
            : 'opacity-100'
        }`}>
          {/* 4 Generation Modes */}
          <SettingsGroup id="setting-potoken_mode" title="Token Generation & Provider Mode">
            <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                {
                  id: 'no_auth',
                  label: '"No Auth" (Guest)',
                  badge: 'Headless BotGuard',
                  desc: 'Mints anonymous guest PO tokens & visitor data server-side without requiring YouTube credentials.',
                  icon: Shield,
                },
                {
                  id: 'bgutil_http',
                  label: 'BgUtils Provider',
                  badge: 'Automated Daemon',
                  desc: 'Connects to a running bgutil-ytdlp-pot-provider daemon (port 4416) for real-time token serving.',
                  icon: TerminalSquare,
                },
                {
                  id: 'auth_cookie',
                  label: '"Auth" with Cookies',
                  badge: 'Signed-In Account',
                  desc: 'Pairs your imported YouTube account cookies with signed streaming tokens for 4K and members content.',
                  icon: KeyRound,
                },
                {
                  id: 'manual',
                  label: 'Manual Paste',
                  badge: 'Direct Input',
                  desc: 'Manually input or paste GVS, Player, and Subtitle tokens along with custom visitor data.',
                  icon: Sliders,
                },
              ].map((m) => {
                const Icon = m.icon;
                const isSelected = activeMode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleUpdatePoSetting('mode', m.id)}
                    className={`p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_15px_rgba(6,182,212,0.12)]'
                        : 'bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/40 text-zinc-400'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Icon size={16} className={isSelected ? 'text-cyan-400' : 'text-zinc-500'} />
                          <span className={`text-xs font-bold ${isSelected ? 'text-cyan-200' : 'text-zinc-200'}`}>
                            {m.label}
                          </span>
                        </div>
                        <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full border ${
                          isSelected
                            ? 'bg-cyan-500/20 border-cyan-500/30 text-cyan-300'
                            : 'bg-zinc-800 border-zinc-700 text-zinc-500'
                        }`}>
                          {m.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 leading-relaxed">
                        {m.desc}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Mode Specific Settings Row */}
            {activeMode === 'bgutil_http' && (
              <SettingsRow>
                <div className="space-y-3 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <span className="text-xs font-semibold text-zinc-200">BgUtils Daemon Base URL</span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        Endpoint of the running bgutil HTTP daemon (runs on 127.0.0.1:4416 or remote host).
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={poSettings.bgutil_base_url || 'http://127.0.0.1:4416'}
                        onChange={(e) => handleUpdatePoSetting('bgutil_base_url', e.target.value)}
                        placeholder="http://127.0.0.1:4416"
                        className="px-3 py-1.5 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500 font-mono w-56"
                      />
                      <button
                        type="button"
                        onClick={() => handleTestBgUtilsProvider(poSettings.bgutil_base_url)}
                        disabled={testingBgUtils}
                        className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-semibold text-zinc-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        {testingBgUtils ? <Loader2 size={13} className="animate-spin text-cyan-400" /> : <TerminalSquare size={13} />}
                        Test Connection
                      </button>
                    </div>
                  </div>

                  {bgUtilsTestResult && (
                    <div className={`p-3 rounded-xl border text-xs flex flex-col gap-2.5 ${
                      bgUtilsTestResult.connected
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                        : 'bg-red-500/10 border-red-500/30 text-red-300'
                    }`}>
                      <div className="flex items-center gap-2">
                        {bgUtilsTestResult.connected ? <CheckCircle2 size={15} /> : <AlertCircle size={15} className="flex-shrink-0" />}
                        <span className="font-medium">{bgUtilsTestResult.message}</span>
                      </div>

                      {!bgUtilsTestResult.connected && (
                        <div className="mt-1 pt-2.5 border-t border-red-500/20 text-[11px] text-zinc-400 space-y-2">
                          <p>
                            The BgUtils HTTP provider daemon is not running on <code className="text-red-300 font-mono">127.0.0.1:4416</code>. If you have Docker or Node, you can start it with:
                          </p>
                          <div className="p-2 rounded bg-zinc-950 font-mono text-[10px] text-zinc-300 select-all border border-zinc-800">
                            docker run -d -p 4416:4416 brainio/bgutil-ytdlp-pot-provider
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1">
                            <span className="text-zinc-400">Or use built-in guest token minting (no daemon or setup needed):</span>
                            <button
                              type="button"
                              onClick={() => handleUpdatePoSetting('mode', 'no_auth')}
                              className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 font-semibold text-[11px] transition-colors whitespace-nowrap self-start sm:self-auto"
                            >
                              Switch to "No Auth" (Guest)
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </SettingsRow>
            )}

            {(activeMode === 'no_auth' || activeMode === 'auth_cookie') && (
              <SettingsRow>
                <div className="space-y-3 w-full">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 w-full">
                    <div>
                      <span className="text-xs font-semibold text-zinc-200">
                        {activeMode === 'no_auth' ? 'Guest BotGuard Token Minting' : 'Authenticated Cookie PO Token Pair'}
                      </span>
                      <p className="text-[11px] text-zinc-400 mt-0.5">
                        {activeMode === 'no_auth'
                          ? 'Executes BotGuard challenge against YouTube to generate visitor data and streaming tokens.'
                          : 'Extracts session visitor data from your saved Netscape cookies and binds them to streaming tokens.'}
                      </p>
                      {poSettings.last_generated && (
                        <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
                          <Clock size={11} /> Last generated: {poSettings.last_generated}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (activeMode === 'auth_cookie' && !hasCookies) {
                            setPotokenFeedback({
                              type: 'error',
                              text: 'No cookies found. Please import cookies in "Cookies & Accounts" first.'
                            });
                            return;
                          }
                          handleGeneratePoTokens(activeMode);
                        }}
                        disabled={generatingPoToken}
                        className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-cyan-900/20 active:scale-98 transition-all disabled:opacity-50"
                      >
                        {generatingPoToken ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Sparkles size={14} />
                        )}
                        {generatingPoToken ? 'Minting Tokens...' : 'Regenerate Tokens'}
                      </button>
                    </div>
                  </div>

                  {activeMode === 'auth_cookie' && !hasCookies && (
                    <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <AlertCircle size={15} className="flex-shrink-0 text-amber-400" />
                        <span>No saved account cookies found. You must import or paste cookies in "Cookies & Accounts" to pair with authenticated PO tokens.</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleSelectCategory('cookies')}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                      >
                        <KeyRound size={13} /> Go to Cookies & Accounts
                      </button>
                    </div>
                  )}
                </div>
              </SettingsRow>
            )}
        </SettingsGroup>

        {/* Token Inspection & Manual Fields */}
        <SettingsGroup title="Active Proof of Origin Tokens">
          {/* Visitor Data */}
          <SettingsRow>
            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Visitor Data (visitorData)</span>
                {poSettings.visitor_data && (
                  <button
                    type="button"
                    onClick={() => handleCopyPoToken(poSettings.visitor_data, 'visitor')}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    {copiedField === 'visitor' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedField === 'visitor' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              {activeMode === 'manual' ? (
                <input
                  type="text"
                  value={poSettings.visitor_data || ''}
                  onChange={(e) => handleUpdatePoSetting('visitor_data', e.target.value)}
                  placeholder="e.g. Cgt2bE9iVkp3d3lyQS..."
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 break-all select-all">
                  {poSettings.visitor_data || <span className="text-zinc-600 italic">No visitor data generated yet. Click 'Regenerate Tokens' above.</span>}
                </div>
              )}
            </div>
          </SettingsRow>

          {/* Player PO Token */}
          <SettingsRow>
            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">Player PO Token (player_token)</span>
                {poSettings.player_token && (
                  <button
                    type="button"
                    onClick={() => handleCopyPoToken(poSettings.player_token, 'player')}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    {copiedField === 'player' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedField === 'player' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              {activeMode === 'manual' ? (
                <input
                  type="text"
                  value={poSettings.player_token || ''}
                  onChange={(e) => handleUpdatePoSetting('player_token', e.target.value)}
                  placeholder="Enter manual Player PO Token"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 break-all select-all">
                  {poSettings.player_token || <span className="text-zinc-600 italic">No player token generated yet.</span>}
                </div>
              )}
            </div>
          </SettingsRow>

          {/* GVS PO Token */}
          <SettingsRow>
            <div className="space-y-1.5 w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-200">GVS Stream PO Token (gvs_token)</span>
                {poSettings.gvs_token && (
                  <button
                    type="button"
                    onClick={() => handleCopyPoToken(poSettings.gvs_token, 'gvs')}
                    className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                  >
                    {copiedField === 'gvs' ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                    {copiedField === 'gvs' ? 'Copied!' : 'Copy'}
                  </button>
                )}
              </div>
              {activeMode === 'manual' ? (
                <input
                  type="text"
                  value={poSettings.gvs_token || ''}
                  onChange={(e) => handleUpdatePoSetting('gvs_token', e.target.value)}
                  placeholder="Enter manual GVS Stream PO Token"
                  className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-zinc-200 font-mono focus:outline-none focus:border-cyan-500"
                />
              ) : (
                <div className="p-2.5 rounded-lg bg-zinc-950/80 border border-zinc-800 text-[11px] font-mono text-zinc-300 break-all select-all">
                  {poSettings.gvs_token || <span className="text-zinc-600 italic">No GVS token generated yet.</span>}
                </div>
              )}
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* YouTube Player Clients & Strict PO Enforcement */}
        <SettingsGroup title="YouTube Player Clients & Priority">
          <SettingsRow>
            <div className="space-y-3 w-full">
              <div>
                <span className="text-xs font-semibold text-zinc-200">Active Player Client Profiles</span>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  Mobile clients (<code className="text-cyan-400">ios</code>, <code className="text-cyan-400">android</code>) are known to bypass browser bot detection and n-sig challenges. yt-dlp tests these clients in order.
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-1">
                {availableClients.map((client) => {
                  const isChecked = clients.includes(client);
                  return (
                    <button
                      key={client}
                      type="button"
                      onClick={() => handleTogglePoClient(client)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                        isChecked
                          ? 'bg-cyan-500/15 border-cyan-500/40 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.1)]'
                          : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {isChecked ? <CheckSquare size={13} className="text-cyan-400" /> : <Square size={13} className="text-zinc-600" />}
                      <span className="font-mono">{client}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </SettingsRow>

          <SettingsRow
            onClick={() => handleUpdatePoSetting('use_only_po_token', !poSettings.use_only_po_token)}
            className="cursor-pointer select-none"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <span className="text-xs font-semibold text-zinc-200">Use Only PO Token</span>
                <p className="text-[11px] text-zinc-400 mt-0.5 max-w-xl">
                  Enforces strict Proof of Origin execution without falling back to unprotected or legacy web requests.
                </p>
              </div>
              <ToggleSwitch
                checked={Boolean(poSettings.use_only_po_token)}
                onChange={(val) => handleUpdatePoSetting('use_only_po_token', val)}
                aria-label="Toggle Use Only PO Token"
              />
            </div>
          </SettingsRow>
        </SettingsGroup>
        </div>
      </div>
    );
  };

  const renderUpdatesTab = () => (
    <div className="space-y-6">
      {/* Current Version Badge Card */}
      <SettingsGroup title="yt-dlp Engine & Execution">
        <SettingsRow>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex-shrink-0">
                <RefreshCw size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-bold text-zinc-100">yt-dlp Engine</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-300 border border-cyan-500/30">
                    {ytdlpVersion || 'v2025.x'}
                  </span>
                  <span className="text-[10px] uppercase font-bold tracking-wide px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700/40">
                    Channel: {settings?.ytdlp_release_channel || 'stable'}
                  </span>
                </div>
                <p className="text-xs text-zinc-400 mt-1">
                  Web UI Version 1.0.0 • JS Engine: <span className="font-mono text-zinc-300">{settings?.js_engine || 'Deno'}</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleCheckUpdate}
              disabled={updateStatus === 'updating'}
              className="flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-gradient-btn text-white text-xs font-semibold shadow-md shadow-cyan-500/20 transition-all disabled:opacity-50 whitespace-nowrap"
            >
              {updateStatus === 'updating' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : updateStatus === 'success' ? (
                <CheckCircle2 size={14} className="text-emerald-300" />
              ) : (
                <RefreshCw size={14} />
              )}
              {updateStatus === 'updating'
                ? 'Updating...'
                : updateStatus === 'success'
                ? 'Updated!'
                : updateStatus === 'error'
                ? 'Update Failed'
                : 'Check for Updates'}
            </button>
          </div>

          {updateMessage && (
            <p
              className={`mt-3 pt-3 border-t border-zinc-800/60 text-xs ${
                updateStatus === 'error' ? 'text-red-400' : 'text-emerald-400'
              }`}
            >
              {updateMessage}
            </p>
          )}
        </SettingsRow>

        <SelectField
          id="setting-ytdlp_release_channel"
          label="Update Channel"
          description="Source channel used when checking and applying yt-dlp binary updates"
          value={settings?.ytdlp_release_channel || 'stable'}
          onChange={(v) => updateSetting('ytdlp_release_channel', v)}
          options={[
            { label: 'Stable (Official releases from PyPI - Recommended)', value: 'stable' },
            { label: 'Nightly (Daily automated builds with fast website fixes)', value: 'nightly' },
            { label: 'Master (Direct git master branch)', value: 'master' },
          ]}
          icon={RefreshCw}
        />

        <SelectField
          id="setting-js_engine"
          label="JavaScript Engine"
          description="Used by yt-dlp to solve YouTube PO (Proof of Origin) botguard tokens"
          value={settings?.js_engine || 'nodejs'}
          onChange={(v) => updateSetting('js_engine', v)}
          options={[
            { label: 'NodeJS (System node runtime - Container Default)', value: 'nodejs' },
            { label: 'Deno (Fastest & sandboxed)', value: 'deno' },
            { label: 'PhantomJS (Legacy)', value: 'phantomjs' },
          ]}
          icon={Cpu}
        />
      </SettingsGroup>

      <SettingsGroup title="Data Management">
        <SettingsRow>
          <div className="space-y-3">
            <div className="flex items-start gap-3.5">
              <div className="p-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 text-zinc-400 mt-0.5 flex-shrink-0">
                <DownloadCloud size={16} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-zinc-200">Backup & Restore</span>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Export or restore your full settings, download history, and site cookies as a zip file
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 pl-0 sm:pl-11 pt-1 flex-wrap">
              <button
                type="button"
                onClick={handleBackup}
                className="px-3.5 py-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/70 text-xs font-semibold transition-colors flex items-center gap-1.5"
              >
                <DownloadCloud size={14} /> Export Backup (.zip)
              </button>

              <label className="cursor-pointer px-3.5 py-2 rounded-xl bg-zinc-800/60 hover:bg-zinc-700/60 text-zinc-300 border border-zinc-700/60 text-xs font-medium transition-colors flex items-center gap-1.5">
                <Upload size={14} /> Import Backup (.zip)
                <input type="file" accept=".zip" className="hidden" onChange={handleRestore} />
              </label>
            </div>
          </div>
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title="Danger Zone" className="border-red-900/30">
        <div className="p-4 sm:px-5 bg-red-950/10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-red-400">Reset All Settings</p>
              <p className="text-xs text-zinc-400 mt-0.5">
                Restore all configurations, limits, and templates to factory defaults
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowResetConfirm(true)}
              className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-semibold transition-colors whitespace-nowrap"
            >
              Reset to Defaults
            </button>
          </div>

          {/* Confirmation prompt */}
          {showResetConfirm && (
            <div className="mt-3 pt-3 border-t border-red-900/40 flex items-center justify-between gap-3 animate-fade-in">
              <p className="text-xs text-zinc-300">Are you sure? This cannot be undone.</p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="text-xs px-3 py-1 rounded-lg bg-zinc-800 text-zinc-400 hover:text-zinc-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleResetSettings}
                  disabled={isResetting}
                  className="text-xs px-3 py-1 rounded-lg bg-red-500 hover:bg-red-600 text-white font-semibold"
                >
                  {isResetting ? 'Resetting...' : 'Yes, Reset'}
                </button>
              </div>
            </div>
          )}
        </div>
      </SettingsGroup>
    </div>
  );

  const renderActiveTabContent = () => {
    switch (activeTab) {
      case 'general':
        return renderGeneralTab();
      case 'directories':
        return renderDirectoriesTab();
      case 'downloading':
        return renderDownloadingTab();
      case 'formats':
        return renderFormatsTab();
      case 'sponsorblock':
        return renderSponsorBlockTab();
      case 'network':
        return renderNetworkTab();
      case 'cookies':
        return renderCookiesTab();
      case 'potoken':
        return renderPoTokenTab();
      case 'updates':
        return renderUpdatesTab();
      default:
        return renderGeneralTab();
    }
  };

  return (
    <div className="h-full max-w-5xl mx-auto space-y-4">
      {/* Sleek Minimalist Header: Title + Save Status + Compact Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pb-1">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Settings size={20} className="text-cyan-400" />
            <h1 className="text-lg sm:text-xl font-bold text-zinc-100 tracking-tight">Settings</h1>
          </div>

          {/* Real-time Saving Indicator */}
          <AnimatePresence mode="wait">
            {isSaving ? (
              <motion.div
                key="saving"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-medium"
              >
                <Loader2 size={12} className="animate-spin" />
                <span>Saving...</span>
              </motion.div>
            ) : (
              <motion.div
                key="saved"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 text-xs font-medium"
              >
                <Check size={12} className="text-emerald-400" />
                <span>Saved</span>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Compact, Sleek Search Bar */}
        <div className="relative w-full sm:w-72 md:w-80">
          <Search size={16} strokeWidth={2.4} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500 dark:text-cyan-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setSearchQuery('');
            }}
            placeholder="Search settings (e.g. log, duplicate, speed, codec, token)..."
            className="w-full bg-zinc-950/70 border border-zinc-800 hover:border-zinc-700 rounded-xl pl-9 pr-8 py-2 px-3.5 text-xs sm:text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-zinc-400 hover:text-zinc-200 transition-colors"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {/* If Search Query is Active: Show Search Results */}
      {searchResults !== null ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1 pb-1 border-b border-zinc-800/60">
            <span className="text-xs font-medium text-zinc-400">
              Found <strong className="text-cyan-400 font-semibold">{searchResults.length}</strong> matching setting{searchResults.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="text-xs text-cyan-400 hover:underline transition-colors flex items-center gap-1"
            >
              <X size={12} />
              <span>Exit Search</span>
            </button>
          </div>

          {searchResults.length > 0 ? (
            <div className="glass rounded-2xl divide-y divide-zinc-800/60 overflow-hidden border border-zinc-800/80">
              {searchResults.map((item) => (
                <div key={item.id} className="relative hover:bg-zinc-800/20 transition-colors">
                  <div className="flex items-center justify-between px-4 pt-3 pb-0.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-zinc-800/90 text-cyan-400 uppercase tracking-wider border border-zinc-700/50">
                      {item.category}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleJumpToSetting(item.tab, item.id, item.title)}
                      className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1.5 transition-all px-2.5 py-1 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 hover:border-cyan-500/50 shadow-sm"
                      title={`Jump directly to ${item.title} in ${item.category}`}
                    >
                      <span>Jump to setting</span>
                      <ChevronRight size={12} />
                    </button>
                  </div>
                  {item.render()}
                </div>
              ))}
            </div>
          ) : (
            <div className="glass rounded-2xl py-10 px-4 text-center border border-zinc-800/60 space-y-3">
              <Search size={28} className="mx-auto text-zinc-600 mb-1" />
              <p className="text-sm font-medium text-zinc-200">No settings found matching "{searchQuery}"</p>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto">Try searching for keywords like:</p>
              <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-md mx-auto pt-1">
                {['Log Downloads', 'Duplicate', 'PO Token', 'Archive', 'Speed Limit', 'Cookies', 'Subtitles', 'Codec', 'Proxy'].map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    onClick={() => setSearchQuery(kw)}
                    className="px-2.5 py-1 rounded-lg text-xs bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/50 transition-colors"
                  >
                    {kw}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="mt-2 px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold transition-colors"
              >
                Clear Search
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Mobile Page-Based Navigation (< md screens) */}
          <div className="block md:hidden">
            {mobileCategory === null ? (
              /* Mobile Category List Page */
              <div className="space-y-2.5">
                <div className="px-1 pb-1">
                  <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Settings Categories</p>
                </div>
                {TABS.map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => handleSelectCategory(tab.id)}
                      className="w-full flex items-center justify-between gap-3.5 p-3.5 rounded-2xl bg-zinc-900/80 hover:bg-zinc-850 active:scale-[0.99] border border-zinc-800/80 hover:border-zinc-700/80 transition-all text-left shadow-sm group"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0 group-hover:scale-105 transition-transform">
                          <Icon size={20} />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-zinc-100 group-hover:text-cyan-300 transition-colors">
                            {tab.label}
                          </p>
                          <p className="text-xs text-zinc-400 truncate max-w-[220px] xs:max-w-xs mt-0.5">
                            {tab.desc}
                          </p>
                        </div>
                      </div>
                      <ChevronRight size={18} className="text-zinc-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </button>
                  );
                })}
              </div>
            ) : (
              /* Mobile Specific Category Page */
              <div className="space-y-4">
                {/* Top Navigation Bar with Back Button */}
                <div className="flex items-center justify-between pb-2 border-b border-zinc-800/60">
                  <button
                    type="button"
                    onClick={handleBackToCategoryList}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-cyan-400 hover:text-cyan-300 hover:bg-zinc-850 text-xs font-semibold transition-all active:scale-95 shadow-sm"
                  >
                    <ChevronLeft size={16} />
                    <span>Settings</span>
                  </button>
                  <span className="text-xs font-medium text-zinc-400 truncate max-w-[180px]">
                    {TABS.find((t) => t.id === mobileCategory)?.label}
                  </span>
                </div>

                {/* Category Content Card */}
                <div className="glass rounded-2xl p-4 sm:p-5">
                  <div className="mb-4 pb-3 border-b border-zinc-800/60">
                    <div className="flex items-center gap-2.5">
                      {(() => {
                        const activeTabObj = TABS.find((t) => t.id === mobileCategory);
                        const TabIcon = activeTabObj?.icon;
                        return TabIcon ? <TabIcon size={20} className="text-cyan-400 shrink-0" /> : null;
                      })()}
                      <h2 className="text-base sm:text-lg font-bold text-zinc-100">
                        {TABS.find((t) => t.id === mobileCategory)?.label}
                      </h2>
                    </div>
                    <p className="text-xs text-zinc-400 mt-1">
                      {TABS.find((t) => t.id === mobileCategory)?.desc}
                    </p>
                  </div>

                  {/* Settings controls */}
                  {renderActiveTabContent()}

                  {/* Bottom Back Button */}
                  <button
                    type="button"
                    onClick={handleBackToCategoryList}
                    className="w-full mt-6 py-2.5 px-4 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-zinc-100 text-xs font-semibold flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm"
                  >
                    <ChevronLeft size={15} />
                    <span>Back to All Settings</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Master-Detail View (>= md screens) */}
          <div className="hidden md:flex flex-row gap-5 items-start">
            {/* Sidebar Navigation */}
            <div className="w-64 flex-shrink-0 flex flex-col gap-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileCategory(tab.id);
                    }}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all text-left whitespace-nowrap ${
                      isActive
                        ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.1)]'
                        : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 border border-transparent'
                    }`}
                  >
                    <Icon size={18} className={isActive ? 'text-cyan-400' : 'text-zinc-500'} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{tab.label}</p>
                    </div>
                    {isActive && <ChevronRight size={14} className="text-cyan-400" />}
                  </button>
                );
              })}
            </div>

            {/* Main Tab Panel */}
            <div className="flex-1 w-full min-w-0">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.18 }}
                className="glass rounded-2xl p-5 sm:p-6"
              >
                {/* Category Header */}
                <div className="mb-5 pb-3.5 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2.5">
                    {(() => {
                      const activeTabObj = TABS.find((t) => t.id === activeTab);
                      const TabIcon = activeTabObj?.icon;
                      return TabIcon ? <TabIcon size={20} className="text-cyan-400" /> : null;
                    })()}
                    <h2 className="text-lg font-bold text-zinc-100">
                      {TABS.find((t) => t.id === activeTab)?.label}
                    </h2>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {TABS.find((t) => t.id === activeTab)?.desc}
                  </p>
                </div>

                {/* Tab Body */}
                {renderActiveTabContent()}
              </motion.div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
