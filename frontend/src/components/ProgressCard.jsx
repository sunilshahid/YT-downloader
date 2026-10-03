import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, CheckCircle2, AlertCircle, Loader2, Ban, Zap, Clock, HardDrive,
  Hourglass, Pause, Play, RefreshCw, Terminal, TerminalSquare, Trash2,
  Folder, Music, Video, Copy, Check, Download,
  ArrowUpToLine, ArrowDownToLine
} from 'lucide-react';
import IncognitoIcon from './IncognitoIcon';

const API_BASE = typeof window !== 'undefined' && window.location ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://127.0.0.1:8000';

// State configuration for badges and styling
const statusConfig = {
  downloading: {
    label: 'Active',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
    cardBorder: 'border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.12)]',
    stripColor: 'bg-cyan-500 shadow-[0_0_10px_rgba(6,182,212,0.4)]',
    icon: Loader2,
    iconSpin: true
  },
  processing: {
    label: 'Processing',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
    cardBorder: 'border-violet-500/30 shadow-[0_0_15px_rgba(139,92,246,0.12)]',
    stripColor: 'bg-violet-500 shadow-[0_0_10px_rgba(139,92,246,0.4)]',
    icon: Loader2,
    iconSpin: true
  },
  paused: {
    label: 'Paused',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    cardBorder: 'border-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.10)]',
    stripColor: 'bg-amber-500 shadow-[0_0_10px_rgba(245,158,11,0.4)]',
    icon: Pause,
    iconSpin: false
  },
  queued: {
    label: 'Queued',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
    cardBorder: 'border-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.08)]',
    stripColor: 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]',
    icon: Hourglass,
    iconSpin: false
  },
  scheduled: {
    label: 'Scheduled',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
    cardBorder: 'border-blue-500/30 shadow-[0_0_15px_rgba(59,130,246,0.10)]',
    stripColor: 'bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.4)]',
    icon: Clock,
    iconSpin: false
  },
  finished: {
    label: 'Finished',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
    cardBorder: 'border-emerald-500/30 shadow-[0_0_15px_rgba(16,185,129,0.10)]',
    stripColor: 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.4)]',
    icon: CheckCircle2,
    iconSpin: false
  },
  error: {
    label: 'Errored',
    badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30',
    cardBorder: 'border-red-500/30 shadow-[0_0_15px_rgba(239,68,68,0.12)]',
    stripColor: 'bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]',
    icon: AlertCircle,
    iconSpin: false
  },
  cancelled: {
    label: 'Cancelled',
    badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700/60',
    cardBorder: 'border-zinc-800 shadow-[0_0_10px_rgba(113,113,122,0.05)]',
    stripColor: 'bg-zinc-600 shadow-[0_0_8px_rgba(113,113,122,0.3)]',
    icon: Ban,
    iconSpin: false
  }
};

// Formats duration in seconds to mm:ss or hh:mm:ss
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds <= 0) return null;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Formats bytes to human-readable size
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return null;
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

// Determines media type badge info
function getMediaType(download) {
  if (download.custom_command || download.request?.custom_command) {
    return { label: 'Terminal', icon: Terminal, badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30' };
  }
  const isAudio = download.audio_only ||
    download.request?.audio_only ||
    (download.format_info && /(audio|mp3|m4a|flac|opus|aac|wav|ogg)/i.test(download.format_info)) ||
    (download.filename && /\.(mp3|m4a|flac|opus|aac|wav|ogg)$/i.test(download.filename));
  if (isAudio) {
    return { label: 'Music / Audio', icon: Music, badgeClass: 'bg-pink-500/15 text-pink-300 border-pink-500/30' };
  }
  return { label: 'Video', icon: Video, badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' };
}

// Extracts format tag chips: resolution/quality, container (1080P · MP4), file size (145.2 MB)
function getFormatChips(download) {
  const chips = [];
  const rawFormat = (download.format_info || '').trim();
  const filename = download.filename || '';
  const extMatch = filename.match(/\.([a-z0-9]+)$/i);
  const ext = extMatch ? extMatch[1].toUpperCase() : null;

  // Resolution detection
  let resolution = null;
  const resMatch = rawFormat.match(/(2160p|4k|1440p|2k|1080p|720p|480p|360p|240p|144p)/i);
  if (resMatch) {
    resolution = resMatch[1].toUpperCase();
  } else if (/(audio|mp3|m4a|flac|opus)/i.test(rawFormat) || download.audio_only) {
    resolution = 'AUDIO';
  }

  // Container detection
  let container = ext;
  if (!container && rawFormat) {
    const contMatch = rawFormat.match(/(mp4|mkv|webm|mp3|m4a|flac|opus|ogg|wav)/i);
    if (contMatch) container = contMatch[1].toUpperCase();
  }

  if (resolution && container) {
    chips.push({ text: `${resolution} · ${container}`, isHighlight: true });
  } else if (resolution) {
    chips.push({ text: resolution, isHighlight: true });
  } else if (container) {
    chips.push({ text: container, isHighlight: true });
  } else if (rawFormat && rawFormat.length <= 15) {
    chips.push({ text: rawFormat, isHighlight: false });
  }

  // File size chip
  if (download.filesize) {
    chips.push({ text: download.filesize, isHighlight: false });
  } else if (download.total_bytes && download.total_bytes > 0) {
    chips.push({ text: formatBytes(download.total_bytes), isHighlight: false });
  }

  return chips;
}

// Maps live status text or state to the exact requested parity phase badge with icon
function getLivePhase(download, queuePosition) {
  if (download.status === 'paused') {
    return {
      icon: '⏸️',
      label: 'Download paused',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30'
    };
  }

  if (download.status === 'error') {
    return {
      icon: '❌',
      label: 'Error occurred (click to inspect log)',
      badgeClass: 'bg-red-500/15 text-red-300 border-red-500/30 cursor-pointer hover:bg-red-500/25',
      isError: true
    };
  }

  if (download.status === 'cancelled') {
    return {
      icon: '🚫',
      label: 'Download cancelled',
      badgeClass: 'bg-zinc-800 text-zinc-400 border-zinc-700/60'
    };
  }

  if (download.status === 'finished') {
    return {
      icon: '✅',
      label: 'Download complete',
      badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
    };
  }

  if (download.status === 'scheduled') {
    const dateStr = download.scheduled_for
      ? new Date(download.scheduled_for).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';
    return {
      icon: '🕒',
      label: `Scheduled for ${dateStr || 'later'}`,
      badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30'
    };
  }

  if (download.status === 'queued') {
    return {
      icon: '⏳',
      label: queuePosition ? `Waiting in queue (#${queuePosition})` : 'Waiting in queue...',
      badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
    };
  }

  // Active downloading or processing: map live_status_text to YTDLnis parity phases
  const text = (download.live_status_text || '').toLowerCase();

  if (text.includes('extracting metadata') || text.includes('extract') || text.includes('info') || text.includes('webpage')) {
    return {
      icon: '🔍',
      label: 'Extracting metadata...',
      badgeClass: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30 animate-pulse'
    };
  }

  if (text.includes('sponsor') || text.includes('sponsorblock')) {
    return {
      icon: '🛡️',
      label: 'Removing SponsorBlock segments...',
      badgeClass: 'bg-sky-500/15 text-sky-300 border-sky-500/30 animate-pulse'
    };
  }

  if (text.includes('thumbnail') || text.includes('artwork')) {
    return {
      icon: '🖼️',
      label: 'Embedding thumbnail artwork...',
      badgeClass: 'bg-pink-500/15 text-pink-300 border-pink-500/30 animate-pulse'
    };
  }

  if (text.includes('tag') || text.includes('metadata') || text.includes('id3')) {
    return {
      icon: '🏷️',
      label: 'Adding ID3/MP4 metadata tags...',
      badgeClass: 'bg-purple-500/15 text-purple-300 border-purple-500/30 animate-pulse'
    };
  }

  if (text.includes('merg') || text.includes('ffmpeg') || text.includes('converting')) {
    return {
      icon: '🔄',
      label: 'Merging formats with FFmpeg...',
      badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30 animate-pulse'
    };
  }

  if (text.includes('audio stream') || text.includes('extractaudio') || (download.audio_only && download.status === 'downloading')) {
    return {
      icon: '🎵',
      label: 'Downloading audio stream...',
      badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse'
    };
  }

  if (download.status === 'downloading') {
    return {
      icon: '⚡',
      label: 'Downloading video stream...',
      badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse'
    };
  }

  if (download.status === 'processing') {
    return {
      icon: '🔄',
      label: download.live_status_text || 'Merging formats with FFmpeg...',
      badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30 animate-pulse'
    };
  }

  return {
    icon: '⚡',
    label: 'Downloading stream...',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30 animate-pulse'
  };
}

export default function ProgressCard({ download, queuePosition, selected = false, onSelect = null, onMoveToTop = null, onMoveToBottom = null, settings = null }) {
  const [showLog, setShowLog] = useState(false);
  const [logContent, setLogContent] = useState('');
  const [loadingLog, setLoadingLog] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [downloadingFile, setDownloadingFile] = useState(false);
  const [streamPercent, setStreamPercent] = useState(null);
  const [streamStatus, setStreamStatus] = useState(null);
  const logContainerRef = useRef(null);

  const config = statusConfig[download.status] || statusConfig.queued;
  const StatusIcon = config.icon;
  const mediaType = useMemo(() => getMediaType(download), [download]);
  const MediaTypeIcon = mediaType.icon;
  const formatChips = useMemo(() => getFormatChips(download), [download]);
  const livePhase = useMemo(() => getLivePhase(download, queuePosition), [download, queuePosition]);

  // Clean filename and display title
  const filename = download.filename ? download.filename.split(/[\\/]/).pop() : null;
  const displayTitle = download.title || filename || download.url;
  const channelOrUploader = download.uploader || download.channel || download.artist;
  const durationFormatted = download.duration_string || formatDuration(download.duration);

  // Clean Speed, ETA, and Size metrics
  const cleanSpeed = useMemo(() => {
    if (!download.speed) return null;
    // eslint-disable-next-line no-control-regex
    return download.speed.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim();
  }, [download.speed]);

  const cleanEta = useMemo(() => {
    if (!download.eta) return null;
    // eslint-disable-next-line no-control-regex
    return download.eta.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').replace(/^ETA\s*/i, '').trim();
  }, [download.eta]);
  
  const downloadedFormatted = download.downloaded_bytes ? formatBytes(download.downloaded_bytes) : null;
  const totalFormatted = download.total_bytes ? formatBytes(download.total_bytes) : null;
  const sizeMetric = downloadedFormatted && totalFormatted
    ? `${downloadedFormatted} / ${totalFormatted}`
    : (download.filesize || totalFormatted || downloadedFormatted || null);

  // Monospace terminal snippet text
  const terminalSnippetText = useMemo(() => {
    if (download.live_status_text) return download.live_status_text;
    if (download.status === 'downloading') {
      const parts = [`[download] ${(download.percent || 0).toFixed(1)}%`];
      if (download.filesize) parts.push(`of ${download.filesize}`);
      if (cleanSpeed) parts.push(`at ${cleanSpeed}`);
      if (cleanEta) parts.push(`ETA ${cleanEta}`);
      return parts.join(' ');
    }
    if (download.status === 'error' && download.error_message) {
      return `[error] ${download.error_message}`;
    }
    return `[yt-dlp] ${download.status.toUpperCase()}`;
  }, [download.live_status_text, download.status, download.percent, download.filesize, cleanSpeed, cleanEta, download.error_message]);

  // Fetch execution log
  const fetchLog = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/download/${download.id}/log`);
      const data = await res.json();
      if (data.status === 'success') {
        setLogContent(data.log || '');
      } else {
        setLogContent(data.log || 'No log entries recorded yet.');
      }
    } catch (err) {
      console.error('Fetch log error:', err);
      setLogContent('Network error while loading log file.');
    } finally {
      setLoadingLog(false);
    }
  }, [download.id]);

  const handleShowLog = () => {
    setShowLog(true);
    setLoadingLog(true);
    fetchLog();
  };

  // Real-time log polling while modal is open and download is active
  useEffect(() => {
    if (!showLog) return;
    if (download.status === 'downloading' || download.status === 'processing') {
      const interval = setInterval(fetchLog, 1500);
      return () => clearInterval(interval);
    }
  }, [showLog, download.status, fetchLog]);

  // Auto-scroll log modal to bottom
  useEffect(() => {
    if (showLog && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [showLog, logContent]);

  // Copy logs to clipboard
  const handleCopyLogs = async () => {
    if (!logContent) return;
    try {
      await navigator.clipboard.writeText(logContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy logs:', err);
    }
  };

  // Download log file
  const handleDownloadLogFile = () => {
    if (!logContent) return;
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const cleanName = (download.title || download.id).replace(/[^a-zA-Z0-9_-]/g, '_');
    a.download = `${cleanName}_execution.log`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Action handlers
  const handleCancel = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/cancel`, { method: 'POST' });
    } catch (err) {
      console.error('Cancel error:', err);
    }
  };

  const handlePause = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/pause`, { method: 'POST' });
    } catch (err) {
      console.error('Pause error:', err);
    }
  };

  const handleResume = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/resume`, { method: 'POST' });
    } catch (err) {
      console.error('Resume error:', err);
    }
  };

  const handleRetry = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/retry`, { method: 'POST' });
    } catch (err) {
      console.error('Retry error:', err);
    }
  };

  const handleDownloadFile = async (e) => {
    if (e) e.preventDefault();
    if (downloadingFile) return;

    const targetUrl = `${API_BASE}/api/downloads/${download.id}/file`;
    const defaultName = filename || `${download.title || 'video'}.mp4`;

    // 1. Direct Native Disk Streaming via File System Access API (Zero RAM, Real-time disk writing)
    if (typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function') {
      try {
        const ext = defaultName.split('.').pop() || 'mp4';
        const fileHandle = await window.showSaveFilePicker({
          suggestedName: defaultName,
          types: [{
            description: 'Media File',
            accept: { [`video/${ext}`]: [`.${ext}`], [`audio/${ext}`]: [`.${ext}`] }
          }]
        });

        setDownloadingFile(true);
        setStreamPercent(0);
        setStreamStatus('saving');

        const res = await fetch(targetUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const contentLength = +res.headers.get('content-length') || 0;
        let loaded = 0;

        const progressStream = new TransformStream({
          transform(chunk, controller) {
            loaded += chunk.length;
            if (contentLength > 0) {
              setStreamPercent(Math.round((loaded / contentLength) * 100));
            }
            controller.enqueue(chunk);
          }
        });

        const writable = await fileHandle.createWritable();
        await res.body.pipeThrough(progressStream).pipeTo(writable);

        setStreamStatus('complete');
        setTimeout(() => {
          setDownloadingFile(false);
          setStreamPercent(null);
          setStreamStatus(null);
        }, 3000);
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          // User cancelled the file picker dialog
          setDownloadingFile(false);
          setStreamPercent(null);
          setStreamStatus(null);
          return;
        }
        console.warn('Native disk stream failed, falling back to browser download:', err);
      }
    }

    // 2. Fallback for browsers without File System Access API: Native direct attachment navigation
    setDownloadingFile(true);
    window.location.href = targetUrl;
    setTimeout(() => {
      setDownloadingFile(false);
      setStreamPercent(null);
      setStreamStatus(null);
    }, 4000);
  };

  const handleOpen = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/open`, { method: 'POST' });
    } catch (err) {
      console.error('Open error:', err);
    }
  };

  const handleOpenFolder = async () => {
    try {
      await fetch(`${API_BASE}/api/download/${download.id}/open-folder`, { method: 'POST' });
    } catch (err) {
      console.error('Open folder error:', err);
    }
  };

  const handleMoveQueue = async (direction) => {
    try {
      await fetch(`${API_BASE}/api/queue/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ download_id: download.id, position: direction })
      });
    } catch (err) {
      console.error('Move queue error:', err);
    }
  };

  const handleRemove = async (deleteFile = false) => {
    try {
      await fetch(`${API_BASE}/api/downloads?ids=${download.id}&delete_file=${deleteFile}`, { method: 'DELETE' });
    } catch (err) {
      console.error('Remove error:', err);
    }
  };

  // Syntax coloring parser for execution log modal lines
  const renderLogLines = (text) => {
    if (!text) return <span className="text-zinc-500 italic">No log entries recorded yet.</span>;
    const lines = text.split('\n');
    let inCommandBlock = false;

    return lines.map((line, idx) => {
      const trimmed = line.trim();

      // Divider Lines
      if (trimmed.startsWith('===') || trimmed.startsWith('---')) {
        inCommandBlock = false;
        return (
          <div key={idx} className="my-1 border-t border-zinc-800/80 text-zinc-700/60 font-mono text-[9px] select-none tracking-widest overflow-hidden">
            {line}
          </div>
        );
      }

      // Command Block toggle
      if (trimmed.startsWith('[COMMAND]')) {
        inCommandBlock = true;
        return (
          <div key={idx} className="text-amber-300 font-bold bg-amber-500/10 border-l-2 border-amber-400 px-2 py-1 rounded-r mt-2 font-mono">
            {line}
          </div>
        );
      }

      if (inCommandBlock && (trimmed.startsWith('yt-dlp') || trimmed.startsWith('--') || trimmed.startsWith('-') || line.startsWith('  '))) {
        return (
          <div key={idx} className="font-mono text-cyan-300 bg-zinc-900/70 border-l-2 border-cyan-500/60 pl-3 py-0.5 whitespace-pre break-all hover:bg-zinc-900">
            {line}
          </div>
        );
      } else if (inCommandBlock && !trimmed.startsWith('yt-dlp') && !line.startsWith('  ')) {
        inCommandBlock = false;
      }

      // Pre-Execution Tags
      if (trimmed.startsWith('[SESSION]')) {
        return (
          <div key={idx} className="text-sky-400 font-semibold bg-sky-950/20 px-2 py-0.5 rounded leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[TARGET]')) {
        return (
          <div key={idx} className="text-teal-300 font-medium px-1.5 py-0.5 leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[CONFIG]')) {
        return (
          <div key={idx} className="text-indigo-300/90 px-1.5 py-0.5 leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[EXECUTION]')) {
        return (
          <div key={idx} className="text-cyan-300 font-bold px-1.5 py-1 bg-cyan-950/20 rounded border-l-2 border-cyan-400 my-1 whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }

      // Post-Execution Tags
      if (
        trimmed.startsWith('[POSTPROCESS]') ||
        trimmed.includes('[Merger]') ||
        trimmed.includes('[Metadata]') ||
        trimmed.includes('[ThumbnailsConvertor]') ||
        trimmed.includes('[EmbedThumbnail]') ||
        trimmed.includes('[ExtractAudio]') ||
        trimmed.includes('Deleting original file')
      ) {
        return (
          <div key={idx} className="text-purple-300 font-medium px-1.5 py-0.5 bg-purple-950/20 rounded leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[VERIFY]')) {
        return (
          <div key={idx} className="text-emerald-300 font-semibold px-1.5 py-0.5 bg-emerald-950/20 rounded leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[CLEANUP]')) {
        return (
          <div key={idx} className="text-zinc-500 italic px-1.5 py-0.5 leading-relaxed whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }

      // Completion & Summary Banners
      if (trimmed.startsWith('[COMPLETE]') || trimmed.startsWith('[SUMMARY]')) {
        return (
          <div key={idx} className="text-emerald-400 font-bold bg-emerald-950/40 border-l-2 border-emerald-400 px-2 py-0.5 rounded-r my-0.5 whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[CANCELLED]') || trimmed.startsWith('[PAUSED]')) {
        return (
          <div key={idx} className="text-amber-300 font-bold bg-amber-950/40 border-l-2 border-amber-400 px-2 py-0.5 rounded-r my-0.5 whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }
      if (trimmed.startsWith('[ERROR]') || trimmed.startsWith('[TRACEBACK]') || /Traceback|\[error\]/i.test(line)) {
        return (
          <div key={idx} className="text-red-400 font-semibold bg-red-950/50 border-l-2 border-red-500 px-2 py-0.5 rounded-r my-0.5 whitespace-pre-wrap break-all">
            {line}
          </div>
        );
      }

      // Standard Log Classes
      let colorClass = 'text-zinc-300';
      if (line.includes('[download]') || /\b\d+(\.\d+)?%\b/.test(line)) {
        colorClass = 'text-cyan-400 font-medium';
      } else if (/WARNING|\[warning\]|\[WARN\]/i.test(line)) {
        colorClass = 'text-amber-300';
      } else if (/INFO|\[info\]/i.test(line)) {
        colorClass = 'text-emerald-400';
      } else if (/\[(ffmpeg|merger|extractaudio|fixup)\]/i.test(line)) {
        colorClass = 'text-violet-400';
      } else if (/\[(metadata|embedthumbnail|thumbnailsconvertor|modifychapters)\]/i.test(line)) {
        colorClass = 'text-pink-400';
      } else if (/\[sponsorblock\]/i.test(line)) {
        colorClass = 'text-sky-400';
      }

      return (
        <div key={idx} className={`leading-relaxed hover:bg-zinc-900/60 px-1.5 rounded transition-colors whitespace-pre-wrap break-all ${colorClass}`}>
          {line || ' '}
        </div>
      );
    });
  };

  const percentClamped = Math.min(Math.max(download.percent || 0, 0), 100);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className={`relative glass rounded-2xl p-4 sm:p-5 border transition-all duration-300 overflow-hidden ${
        config.cardBorder
      } ${selected ? 'ring-2 ring-cyan-500/60 bg-cyan-950/20' : ''}`}
    >
      {/* 1. Subtle Background Thumbnail Glow */}
      {download.thumbnail && !imgError && (
        <div
          className="absolute inset-0 bg-cover bg-center opacity-[0.06] pointer-events-none scale-105 filter blur-md"
          style={{ backgroundImage: `url(${download.thumbnail})` }}
        />
      )}

      {/* Status Color Left Accent Strip */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 sm:w-1.5 rounded-l-2xl z-20 transition-all duration-300 ${
          config.stripColor || 'bg-zinc-600'
        }`}
      />

      {/* Checkbox Overlay for Selection */}
      {onSelect && (
        <button
          onClick={onSelect}
          className={`absolute top-3.5 right-3.5 sm:top-4 sm:right-4 z-20 w-5 h-5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
            selected
              ? 'bg-cyan-500 border-cyan-400 shadow-md shadow-cyan-500/20'
              : 'bg-zinc-900/80 border-zinc-700 hover:border-cyan-500/60'
          }`}
          title={selected ? 'Deselect' : 'Select'}
        >
          {selected && <Check size={14} className="stroke-[3] text-black" />}
        </button>
      )}

      {/* Foreground Content */}
      <div className="relative z-10">
        <div className="flex flex-col sm:flex-row gap-4 sm:gap-5 items-start">
          {/* Thumbnail Container with Badges */}
          <div className="relative shrink-0 w-full sm:w-40 aspect-video sm:aspect-auto sm:h-24 rounded-xl overflow-hidden shadow-lg border border-zinc-800 bg-zinc-900">
            {download.thumbnail && !imgError ? (
              <img
                src={download.thumbnail}
                alt={displayTitle}
                onError={() => setImgError(true)}
                className={`w-full h-full object-cover transition-transform duration-300 hover:scale-105 ${
                  download.status === 'finished' && download.file_exists_on_disk === false ? 'grayscale opacity-60' : ''
                }`}
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-zinc-900/90 text-zinc-600">
                <MediaTypeIcon size={28} />
              </div>
            )}

            {/* Media Type Badge (Top-Left of Thumbnail) */}
            <div className="absolute top-2 left-2">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 backdrop-blur-md shadow-md ${mediaType.badgeClass}`}>
                <MediaTypeIcon size={10} />
                {mediaType.label}
              </span>
            </div>

            {/* Incognito Badge (Top-Right of Thumbnail) */}
            {download.is_incognito && (
              <div className="absolute top-2 right-2">
                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 backdrop-blur-md shadow-md bg-purple-900/80 text-purple-200 border-purple-500/50">
                  <IncognitoIcon size={10} className="text-purple-300" />
                  Incognito
                </span>
              </div>
            )}

            {/* State Badge (Bottom-Left of Thumbnail) */}
            <div className="absolute bottom-2 left-2">
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border flex items-center gap-1 backdrop-blur-md shadow-md ${config.badgeClass}`}>
                <StatusIcon size={10} className={config.iconSpin ? 'animate-spin' : ''} />
                {config.label}
              </span>
            </div>

            {/* Duration Badge (Bottom-Right of Thumbnail) */}
            {durationFormatted && (
              <div className="absolute bottom-2 right-2">
                <span className="px-1.5 py-0.5 rounded bg-black/80 text-white font-mono text-[10px] font-semibold tracking-tight backdrop-blur-sm border border-white/10">
                  {durationFormatted}
                </span>
              </div>
            )}
          </div>

          {/* Details Column */}
          <div className="flex-1 min-w-0 w-full">
            {/* Title & Channel Row */}
            <div className="pr-8">
              <h3 className="text-base font-bold text-white truncate leading-snug tracking-tight" title={displayTitle}>
                {displayTitle}
              </h3>
              {(channelOrUploader || durationFormatted) && (
                <div className="flex items-center gap-2 mt-0.5 text-xs text-zinc-400 truncate">
                  {channelOrUploader && (
                    <span className="truncate font-medium text-zinc-300">
                      {channelOrUploader}
                    </span>
                  )}
                  {channelOrUploader && durationFormatted && (
                    <span className="text-zinc-600">•</span>
                  )}
                  {durationFormatted && (
                    <span className="font-mono text-zinc-400">{durationFormatted}</span>
                  )}
                </div>
              )}
            </div>

            {/* Format Tag Chips Row */}
            {formatChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {formatChips.map((chip, idx) => (
                  <span
                    key={idx}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-mono font-semibold border ${
                      chip.isHighlight
                        ? 'bg-zinc-800/90 text-cyan-300 border-cyan-500/30 shadow-sm'
                        : 'bg-zinc-900/80 text-zinc-300 border-zinc-700/60'
                    }`}
                  >
                    {chip.text}
                  </span>
                ))}
                {filename && (
                  <span className="text-[11px] text-zinc-500 font-mono truncate max-w-[200px]" title={filename}>
                    {filename}
                  </span>
                )}
              </div>
            )}

            {/* Live Phase Badge */}
            <div className="mt-2.5 flex items-center gap-2">
              <div
                onClick={livePhase.isError ? handleShowLog : undefined}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all ${livePhase.badgeClass}`}
              >
                <span>{livePhase.icon}</span>
                <span>{livePhase.label}</span>
              </div>
            </div>

            {/* Live Metrics Row (Downloading / Processing / Paused) */}
            {(download.status === 'downloading' || download.status === 'processing' || download.status === 'paused') && (
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  {cleanSpeed && (
                    <span className="px-2 py-0.5 rounded-md bg-cyan-500/10 border border-cyan-500/25 text-cyan-300 font-semibold flex items-center gap-1 font-mono">
                      <Zap size={12} className="text-cyan-400" />
                      {cleanSpeed}
                    </span>
                  )}
                  {cleanEta && (
                    <span className="px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/25 text-violet-300 font-semibold flex items-center gap-1 font-mono">
                      <Clock size={12} className="text-violet-400" />
                      ETA {cleanEta}
                    </span>
                  )}
                  {sizeMetric && (
                    <span className="px-2 py-0.5 rounded-md bg-zinc-800/80 border border-zinc-700/70 text-zinc-300 font-medium flex items-center gap-1 font-mono">
                      <HardDrive size={12} className="text-zinc-400" />
                      {sizeMetric}
                    </span>
                  )}
                </div>

                <div className="text-sm font-black font-mono text-white tracking-tight ml-auto">
                  {percentClamped.toFixed(1)}%
                </div>
              </div>
            )}

            {/* Glowing Linear Progress Bar */}
            {(download.status === 'downloading' || download.status === 'processing' || download.status === 'paused') && (
              <div className="mt-2 w-full h-2 bg-zinc-900/90 rounded-full overflow-hidden border border-zinc-800 p-[1px]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    download.status === 'paused'
                      ? 'bg-amber-500/80'
                      : download.status === 'processing'
                      ? 'bg-violet-500'
                      : percentClamped === 0
                      ? 'w-full bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent animate-pulse'
                      : 'progress-bar-fill'
                  }`}
                  style={{ width: percentClamped === 0 ? '100%' : `${percentClamped}%` }}
                />
              </div>
            )}

            {/* Live Terminal Status Row (Running downloads only) */}
            {(download.status === 'downloading' || download.status === 'processing') && (
              <div className="mt-2.5 flex items-center gap-1.5 min-w-0 px-0.5">
                <Terminal
                  size={12}
                  className="text-cyan-400 shrink-0"
                />
                <span
                  className="font-mono text-[11px] text-zinc-400 truncate"
                  title={download.live_status_text || terminalSnippetText || 'Active download process...'}
                >
                  {download.live_status_text || terminalSnippetText || 'Active download process...'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Context-Aware Action Buttons Row */}
        <div className="mt-4 pt-3 border-t border-zinc-800/60 flex flex-wrap items-center justify-end gap-2">
          {/* DOWNLOADING ACTIONS */}
          {download.status === 'downloading' && (
            <>
              <button
                onClick={handlePause}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Pause size={14} /> Pause
              </button>
              <button
                onClick={handleShowLog}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
                title="View execution log"
              >
                <TerminalSquare size={14} /> View Log
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <X size={14} /> Cancel
              </button>
            </>
          )}

          {/* PROCESSING ACTIONS */}
          {download.status === 'processing' && (
            <>
              <button
                onClick={handleShowLog}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
                title="View execution log"
              >
                <TerminalSquare size={14} /> View Log
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Force cancel processing"
              >
                <X size={14} /> Force Cancel
              </button>
            </>
          )}

          {/* PAUSED ACTIONS */}
          {download.status === 'paused' && (
            <>
              <button
                onClick={handleResume}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Play size={14} /> Resume
              </button>
              <button
                onClick={handleShowLog}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
                title="View execution log"
              >
                <TerminalSquare size={14} /> View Log
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <X size={14} /> Cancel
              </button>
            </>
          )}

          {/* QUEUED ACTIONS */}
          {download.status === 'queued' && (
            <>
              <button
                onClick={() => handleMoveQueue('top')}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Move to top of queue"
              >
                <ArrowUpToLine size={14} /> Move to Top
              </button>
              <button
                onClick={() => handleMoveQueue('bottom')}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Move to bottom of queue"
              >
                <ArrowDownToLine size={14} /> Move to Bottom
              </button>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <X size={14} /> Cancel
              </button>
            </>
          )}

          {/* SCHEDULED ACTIONS */}
          {download.status === 'scheduled' && (
            <>
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <X size={14} /> Cancel
              </button>
              <button
                onClick={() => handleRemove(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <Trash2 size={14} /> Remove
              </button>
            </>
          )}

          {/* FINISHED ACTIONS */}
          {download.status === 'finished' && (
            <>
              {download.file_exists_on_disk !== false ? (
                <>
                  <button
                    onClick={handleOpen}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                    title="Open downloaded file"
                  >
                    <Play size={14} /> Open File
                  </button>
                  <button
                    onClick={handleOpenFolder}
                    className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
                    title="Open folder in File Explorer"
                  >
                    <Folder size={14} /> Open Folder
                  </button>
                </>
              ) : null}

              <button
                onClick={handleRetry}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Re-download file"
              >
                <RefreshCw size={14} /> Re-download
              </button>

              {(settings?.enable_browser_download || settings?.browser_download) && download.file_exists_on_disk !== false && (
                <button
                  type="button"
                  onClick={handleDownloadFile}
                  disabled={downloadingFile && streamStatus === 'saving'}
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium transition-all shadow-sm flex items-center gap-1.5 ${
                    streamStatus === 'complete'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : downloadingFile
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                      : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  }`}
                  title="Stream file directly to this device (native disk stream)"
                >
                  {streamStatus === 'complete' ? (
                    <>
                      <Check size={14} className="text-emerald-400 stroke-[2.5]" />
                      <span>Saved to disk!</span>
                    </>
                  ) : downloadingFile ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-blue-400" />
                      <span>{streamPercent !== null ? `Streaming ${streamPercent}%...` : 'Streaming...'}</span>
                    </>
                  ) : (
                    <>
                      <Download size={14} />
                      <span>Download</span>
                    </>
                  )}
                </button>
              )}
              <button
                onClick={handleShowLog}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <TerminalSquare size={14} /> View Log
              </button>
              <button
                onClick={() => handleRemove(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Delete from list"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}

          {/* CANCELLED / ERRORED ACTIONS */}
          {(download.status === 'error' || download.status === 'cancelled') && (
            <>
              <button
                onClick={handleRetry}
                className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <RefreshCw size={14} /> Retry
              </button>
              <button
                onClick={handleShowLog}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 border border-zinc-700/60 flex items-center gap-1.5 transition-all shadow-sm"
              >
                <TerminalSquare size={14} /> View Log
              </button>
              <button
                onClick={() => handleRemove(false)}
                className="px-3 py-1.5 rounded-xl text-xs font-medium bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 border border-zinc-700/60 hover:border-red-500/30 flex items-center gap-1.5 transition-all shadow-sm"
                title="Delete from list"
              >
                <Trash2 size={14} /> Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Execution Log Modal Portal */}
      {createPortal(
        <AnimatePresence>
          {showLog && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLog(false)}
              className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-6"
            >
              <motion.div
                initial={{ scale: 0.95, y: 15 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.95, y: 15 }}
                onClick={(e) => e.stopPropagation()}
                className="glass rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col border border-zinc-700/80 shadow-2xl overflow-hidden bg-zinc-950"
              >
                {/* Modal Header with Mac dots & controls */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b border-zinc-800 bg-zinc-900/80">
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Mac Terminal Dots */}
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 h-3 rounded-full bg-red-500/80 border border-red-400/40" />
                      <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-400/40" />
                      <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-400/40" />
                    </div>

                    <div className="flex items-center gap-2 min-w-0">
                      <TerminalSquare size={18} className="text-cyan-400 shrink-0" />
                      <span className="text-sm font-bold text-white truncate">
                        Execution Log
                      </span>
                      <span className="hidden sm:inline text-xs text-zinc-500 truncate max-w-xs font-mono">
                        ({displayTitle})
                      </span>
                    </div>
                  </div>

                  {/* Header Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopyLogs}
                      disabled={!logContent || loadingLog}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Copy log to clipboard"
                    >
                      {copied ? (
                        <>
                          <Check size={14} className="text-emerald-400" />
                          <span className="text-emerald-400 font-semibold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          <span>Copy Logs</span>
                        </>
                      )}
                    </button>

                    <button
                      onClick={handleDownloadLogFile}
                      disabled={!logContent || loadingLog}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      title="Download raw log file"
                    >
                      <Download size={14} />
                      <span className="hidden sm:inline">Download Log File</span>
                    </button>

                    <button
                      onClick={() => setShowLog(false)}
                      className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="Close"
                    >
                      <X size={18} />
                    </button>
                  </div>
                </div>

                {/* Modal Log Content */}
                <div
                  ref={logContainerRef}
                  className="flex-1 p-4 overflow-y-auto bg-black font-mono text-xs text-zinc-300 select-text space-y-0.5"
                >
                  {loadingLog ? (
                    <div className="flex flex-col items-center justify-center h-48 text-zinc-500 gap-2">
                      <Loader2 className="animate-spin text-cyan-400" size={24} />
                      <p>Loading execution log...</p>
                    </div>
                  ) : (
                    renderLogLines(logContent)
                  )}
                </div>

                {/* Modal Footer / Status Bar */}
                <div className="p-3 border-t border-zinc-800 bg-zinc-900/60 flex items-center justify-between text-[11px] text-zinc-400 font-mono">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1.5">
                      <span className={`w-2 h-2 rounded-full ${
                        download.status === 'downloading' || download.status === 'processing'
                          ? 'bg-cyan-400 animate-pulse'
                          : download.status === 'finished'
                          ? 'bg-emerald-400'
                          : download.status === 'error'
                          ? 'bg-red-400'
                          : 'bg-zinc-500'
                      }`} />
                      Status: <strong className="text-zinc-200 uppercase">{download.status}</strong>
                    </span>
                    {(download.status === 'downloading' || download.status === 'processing') && (
                      <span className="text-cyan-400 text-[10px] hidden sm:inline">
                        (Live polling real-time stream)
                      </span>
                    )}
                  </div>

                  <div className="text-zinc-500">
                    {logContent ? `${logContent.split('\n').length} lines` : '0 lines'}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </motion.div>
  );
}
