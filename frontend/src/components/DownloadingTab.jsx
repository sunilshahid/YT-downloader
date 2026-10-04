import { useMemo, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Download, History, Inbox, Layers, Trash2, HardDrive, CheckSquare, Square, 
  X, CalendarClock, Ban, AlertTriangle, CheckCircle2, Search, 
  SortDesc, SortAsc, Play, Pause, RotateCcw, Copy, Check, 
  ArrowUpToLine, ArrowDownToLine
} from 'lucide-react';
import ProgressCard from './ProgressCard';

const API_BASE = typeof window !== 'undefined' && window.location 
  ? (window.location.port === '5173' ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin)
  : 'http://127.0.0.1:8000';

const tabs = [
  { 
    id: 'all', 
    label: 'All', 
    icon: Inbox, 
    color: 'text-zinc-200',
    activeBorder: 'border-zinc-500/50',
    activeBg: 'bg-zinc-800/80',
    badgeClass: 'bg-zinc-700/60 text-zinc-200 border border-zinc-600/50',
    glowColor: 'rgba(212, 212, 216, 0.25)',
    stripColor: 'bg-zinc-300'
  },
  { 
    id: 'running', 
    label: 'Running', 
    icon: Download, 
    color: 'text-cyan-400',
    activeBorder: 'border-cyan-500/50',
    activeBg: 'bg-cyan-500/10',
    badgeClass: 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30',
    glowColor: 'rgba(6, 182, 212, 0.25)',
    stripColor: 'bg-cyan-400'
  },
  { 
    id: 'queued', 
    label: 'Queued', 
    icon: Layers, 
    color: 'text-amber-400',
    activeBorder: 'border-amber-500/50',
    activeBg: 'bg-amber-500/10',
    badgeClass: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    glowColor: 'rgba(245, 158, 11, 0.25)',
    stripColor: 'bg-amber-400'
  },
  { 
    id: 'scheduled', 
    label: 'Scheduled', 
    icon: CalendarClock, 
    color: 'text-blue-400',
    activeBorder: 'border-blue-500/50',
    activeBg: 'bg-blue-500/10',
    badgeClass: 'bg-blue-500/15 text-blue-400 border border-blue-500/30',
    glowColor: 'rgba(59, 130, 246, 0.25)',
    stripColor: 'bg-blue-400'
  },
  { 
    id: 'finished', 
    label: 'Finished', 
    icon: CheckCircle2, 
    color: 'text-emerald-400',
    activeBorder: 'border-emerald-500/50',
    activeBg: 'bg-emerald-500/10',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    glowColor: 'rgba(16, 185, 129, 0.25)',
    stripColor: 'bg-emerald-400'
  },
  { 
    id: 'cancelled', 
    label: 'Cancelled', 
    icon: Ban, 
    color: 'text-zinc-400',
    activeBorder: 'border-zinc-500/50',
    activeBg: 'bg-zinc-500/10',
    badgeClass: 'bg-zinc-800 text-zinc-400 border border-zinc-700',
    glowColor: 'rgba(161, 161, 170, 0.2)',
    stripColor: 'bg-zinc-400'
  },
  { 
    id: 'error', 
    label: 'Errored', 
    icon: AlertTriangle, 
    color: 'text-red-400',
    activeBorder: 'border-red-500/50',
    activeBg: 'bg-red-500/10',
    badgeClass: 'bg-red-500/15 text-red-400 border border-red-500/30',
    glowColor: 'rgba(239, 68, 68, 0.25)',
    stripColor: 'bg-red-400'
  }
];

// Helper to parse speed strings like '12.4MiB/s' or '850KiB/s' into bytes/sec for accurate sorting
const parseSpeed = (speedStr) => {
  if (!speedStr) return 0;
  const clean = speedStr.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '').trim().toLowerCase();
  const match = clean.match(/([\d.]+)\s*([a-z]+)\/s/i);
  if (!match) return 0;
  const val = parseFloat(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith('g')) return val * 1024 * 1024 * 1024;
  if (unit.startsWith('m')) return val * 1024 * 1024;
  if (unit.startsWith('k')) return val * 1024;
  if (unit.startsWith('b')) return val;
  return val;
};

export default function DownloadingTab({ downloads, activeTab: propActiveTab, onTabChange: propOnTabChange, settings = null }) {
  const [localActiveTab, setLocalActiveTab] = useState('running');
  const activeTab = propActiveTab !== undefined ? propActiveTab : localActiveTab;
  const setActiveTab = propOnTabChange || setLocalActiveTab;
  
  // Selection State
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState('history'); // 'history' or 'storage'

  // Search & Sort State
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'name', 'size', 'speed'
  const [sortAsc, setSortAsc] = useState(false);

  // Queue custom priority ordering
  const [customQueueOrder, setCustomQueueOrder] = useState([]);

  // Toast feedback state
  const [toastMessage, setToastMessage] = useState('');
  const toastTimer = useRef(null);

  const showToast = (msg) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToastMessage('');
    }, 2500);
  };

  const downloadList = useMemo(() => {
    let list = Object.values(downloads || {});
    
    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(d => 
        (d.title && d.title.toLowerCase().includes(q)) || 
        (d.url && d.url.toLowerCase().includes(q)) ||
        (d.filename && d.filename.toLowerCase().includes(q))
      );
    }
    
    // Sort
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'date') {
        cmp = (a.started_at || '').localeCompare(b.started_at || '');
      } else if (sortBy === 'name') {
        const nameA = a.title || a.filename || a.url || '';
        const nameB = b.title || b.filename || b.url || '';
        cmp = nameA.localeCompare(nameB);
      } else if (sortBy === 'size') {
        const sizeA = a.total_bytes || a.downloaded_bytes || 0;
        const sizeB = b.total_bytes || b.downloaded_bytes || 0;
        cmp = sizeA - sizeB;
      } else if (sortBy === 'speed') {
        const speedA = parseSpeed(a.speed);
        const speedB = parseSpeed(b.speed);
        cmp = speedA - speedB;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [downloads, searchQuery, sortBy, sortAsc]);

  // Tab grouping
  const grouped = useMemo(() => {
    return {
      all: downloadList,
      running: downloadList.filter(d => ['downloading', 'processing', 'paused'].includes(d.status)),
      queued: downloadList.filter(d => d.status === 'queued'),
      scheduled: downloadList.filter(d => d.status === 'scheduled'),
      finished: downloadList.filter(d => d.status === 'finished'),
      cancelled: downloadList.filter(d => d.status === 'cancelled'),
      error: downloadList.filter(d => d.status === 'error'),
    };
  }, [downloadList]);

  // Active items respecting queue order if in queued tab
  const activeItems = useMemo(() => {
    const raw = grouped[activeTab] || [];
    if (activeTab === 'queued' && customQueueOrder.length > 0) {
      return [...raw].sort((a, b) => {
        const idxA = customQueueOrder.indexOf(a.id);
        const idxB = customQueueOrder.indexOf(b.id);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return 0;
      });
    }
    return raw;
  }, [grouped, activeTab, customQueueOrder]);

  // Selected download objects
  const selectedItems = useMemo(() => {
    return downloadList.filter(d => selectedIds.has(d.id));
  }, [downloadList, selectedIds]);

  // Status checks on selected items
  const hasPausedSelected = useMemo(() => {
    return selectedItems.some(d => d.status === 'paused');
  }, [selectedItems]);

  const hasActiveSelected = useMemo(() => {
    return selectedItems.some(d => d.status === 'downloading' || d.status === 'processing');
  }, [selectedItems]);

  const hasFailedOrCancelledSelected = useMemo(() => {
    return selectedItems.some(d => d.status === 'cancelled' || d.status === 'error');
  }, [selectedItems]);

  const hasQueuedSelected = useMemo(() => {
    return selectedItems.some(d => d.status === 'queued');
  }, [selectedItems]);

  // Running tab global status checks
  const activeDownloadsInRunning = useMemo(() => {
    return grouped.running.filter(d => d.status === 'downloading' || d.status === 'processing');
  }, [grouped.running]);

  const pausedDownloadsInRunning = useMemo(() => {
    return grouped.running.filter(d => d.status === 'paused');
  }, [grouped.running]);

  // Selection handlers
  const handleSelect = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) newSelected.delete(id);
    else newSelected.add(id);
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === activeItems.length && activeItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(activeItems.map(d => d.id)));
    }
  };

  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
    setSelectedIds(new Set());
  };

  // Context-aware actions for CAB
  const handleResumeSelected = async () => {
    const targets = selectedItems.filter(d => d.status === 'paused');
    if (targets.length === 0) return;
    await Promise.allSettled(
      targets.map(d => fetch(`${API_BASE}/api/download/${d.id}/resume`, { method: 'POST' }))
    );
    showToast(`Resumed ${targets.length} download${targets.length > 1 ? 's' : ''}`);
  };

  const handlePauseSelected = async () => {
    const targets = selectedItems.filter(d => d.status === 'downloading' || d.status === 'processing');
    if (targets.length === 0) return;
    await Promise.allSettled(
      targets.map(d => fetch(`${API_BASE}/api/download/${d.id}/pause`, { method: 'POST' }))
    );
    showToast(`Paused ${targets.length} download${targets.length > 1 ? 's' : ''}`);
  };

  const handleRetrySelected = async () => {
    const targets = selectedItems.filter(d => d.status === 'cancelled' || d.status === 'error');
    if (targets.length === 0) return;
    await Promise.allSettled(
      targets.map(d => fetch(`${API_BASE}/api/download/${d.id}/retry`, { method: 'POST' }))
    );
    showToast(`Retrying ${targets.length} download${targets.length > 1 ? 's' : ''}`);
  };

  const handleCopyUrls = async () => {
    const urls = selectedItems.map(d => d.url).filter(Boolean);
    if (urls.length === 0) return;
    try {
      await navigator.clipboard.writeText(urls.join('\n'));
      showToast(`Copied ${urls.length} URL${urls.length > 1 ? 's' : ''} to clipboard!`);
    } catch (err) {
      console.error('Clipboard copy failed:', err);
      showToast('Failed to copy to clipboard');
    }
  };

  const executeDelete = async () => {
    if (selectedIds.size === 0) return;
    try {
      const idsParam = Array.from(selectedIds).join(',');
      const deleteFile = deleteMode === 'storage';
      await fetch(`${API_BASE}/api/downloads?ids=${idsParam}&delete_file=${deleteFile}`, {
        method: 'DELETE'
      });
      const count = selectedIds.size;
      setSelectedIds(new Set());
      setShowConfirm(false);
      showToast(`Deleted ${count} download${count > 1 ? 's' : ''}`);
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Failed to delete downloads');
    }
  };

  // Global controls in Running tab
  const handlePauseAll = async () => {
    if (activeDownloadsInRunning.length === 0) return;
    await Promise.allSettled(
      activeDownloadsInRunning.map(d => fetch(`${API_BASE}/api/download/${d.id}/pause`, { method: 'POST' }))
    );
    showToast(`Paused all ${activeDownloadsInRunning.length} downloads`);
  };

  const handleResumeAll = async () => {
    if (pausedDownloadsInRunning.length === 0) return;
    await Promise.allSettled(
      pausedDownloadsInRunning.map(d => fetch(`${API_BASE}/api/download/${d.id}/resume`, { method: 'POST' }))
    );
    showToast(`Resumed all ${pausedDownloadsInRunning.length} downloads`);
  };

  // Queue reordering
  const handleMoveQueued = async (downloadId, position) => {
    setCustomQueueOrder(prev => {
      const currentQueueIds = grouped.queued.map(d => d.id);
      const order = prev.length > 0 ? [...prev] : [...currentQueueIds];
      const filtered = order.filter(id => id !== downloadId);
      if (position === 'top') {
        return [downloadId, ...filtered];
      } else {
        return [...filtered, downloadId];
      }
    });

    try {
      await fetch(`${API_BASE}/api/queue/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ download_id: downloadId, position })
      });
      showToast(position === 'top' ? 'Moved to top of queue' : 'Moved to bottom of queue');
    } catch (err) {
      console.error('Queue reorder error:', err);
    }
  };

  const handleMoveSelectedQueued = async (position) => {
    const queuedSelected = Array.from(selectedIds).filter(id => {
      const item = downloadList.find(d => d.id === id);
      return item && item.status === 'queued';
    });
    if (queuedSelected.length === 0) return;

    setCustomQueueOrder(prev => {
      const currentQueueIds = grouped.queued.map(d => d.id);
      const order = prev.length > 0 ? [...prev] : [...currentQueueIds];
      const remaining = order.filter(id => !queuedSelected.includes(id));
      if (position === 'top') {
        return [...queuedSelected, ...remaining];
      } else {
        return [...remaining, ...queuedSelected];
      }
    });

    for (const id of queuedSelected) {
      try {
        await fetch(`${API_BASE}/api/queue/reorder`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ download_id: id, position })
        });
      } catch (e) {}
    }
    showToast(position === 'top' ? `Moved ${queuedSelected.length} to top` : `Moved ${queuedSelected.length} to bottom`);
  };

  return (
    <div className="min-h-screen pt-16 pb-32 px-4 max-w-5xl mx-auto relative">
      {/* Top Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-6"
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">Downloads</h1>
            <p className="text-zinc-500 text-sm">Manage queue, active tasks, and history</p>
          </div>
          
          {/* Search & Sort Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
            <div className="relative w-full sm:w-52 md:w-60">
              <Search size={16} strokeWidth={2.4} className="absolute left-3 top-1/2 -translate-y-1/2 text-cyan-500 dark:text-cyan-400 pointer-events-none" />
              <input 
                type="text" 
                placeholder="Search downloads..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-9 pr-8 py-2 text-xs sm:text-sm text-white focus:outline-none focus:border-cyan-500/50 placeholder-zinc-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white p-0.5"
                  title="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="flex-1 sm:flex-initial bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-2 text-xs sm:text-sm text-zinc-300 focus:outline-none focus:border-cyan-500/50 cursor-pointer"
              >
                <option value="date">Date Added</option>
                <option value="name">Name</option>
                <option value="size">Size</option>
                <option value="speed">Speed</option>
              </select>
              
              <button 
                onClick={() => setSortAsc(!sortAsc)}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-zinc-400 hover:text-white transition-colors shrink-0"
                title={sortAsc ? "Ascending" : "Descending"}
              >
                {sortAsc ? <SortAsc size={17} /> : <SortDesc size={17} />}
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating Context-Aware Action Bar (CAB) */}
      <div className="fixed top-4 sm:top-6 left-0 right-0 z-50 flex justify-center px-4 pointer-events-none">
        <AnimatePresence>
          {selectedIds.size > 0 && (
            <motion.div
              key="downloading-cab"
              initial={{ opacity: 0, y: -20, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.98 }}
              transition={{ duration: 0.18 }}
              className="w-full max-w-3xl pointer-events-auto"
            >
              <div className="glass rounded-2xl p-2 sm:p-2.5 flex items-center justify-between gap-2 shadow-2xl border border-cyan-500/40 glow-cyan backdrop-blur-xl">
                {/* Header Info: Clear + Count + Select All / Deselect All */}
                <div className="flex items-center gap-1.5 sm:gap-2.5 pl-0.5 sm:pl-1 shrink-0">
                  <button 
                    onClick={() => setSelectedIds(new Set())} 
                    className="p-1 sm:p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
                    title="Clear selection"
                  >
                    <X size={16} />
                  </button>
                  <div className="flex items-baseline gap-1">
                    <span className="font-bold text-white text-xs sm:text-sm whitespace-nowrap">
                      {selectedIds.size}
                    </span>
                    <span className="text-zinc-400 text-xs hidden sm:inline">selected</span>
                  </div>
                  <div className="h-3.5 w-px bg-zinc-700/80 mx-0.5" />
                  <button
                    onClick={handleSelectAll}
                    className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap"
                  >
                    {selectedIds.size === activeItems.length && activeItems.length > 0 ? 'Clear All' : 'Select All'}
                  </button>
                </div>

                {/* Context Aware Action Buttons */}
                <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-end flex-1 min-w-0">
                  {hasPausedSelected && (
                    <button
                      onClick={handleResumeSelected}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                      title="Resume paused items"
                    >
                      <Play size={13} className="fill-current shrink-0" />
                      <span className="hidden sm:inline">Resume</span>
                    </button>
                  )}

                  {hasActiveSelected && (
                    <button
                      onClick={handlePauseSelected}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                      title="Pause active items"
                    >
                      <Pause size={13} className="fill-current shrink-0" />
                      <span className="hidden sm:inline">Pause</span>
                    </button>
                  )}

                  {hasFailedOrCancelledSelected && (
                    <button
                      onClick={handleRetrySelected}
                      className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 text-violet-300 border border-violet-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                      title="Retry failed or cancelled items"
                    >
                      <RotateCcw size={13} className="shrink-0" />
                      <span className="hidden sm:inline">Retry</span>
                    </button>
                  )}

                  {hasQueuedSelected && (
                    <>
                      <button
                        onClick={() => handleMoveSelectedQueued('top')}
                        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-cyan-300 border border-zinc-700 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                        title="Move selected queued items to top"
                      >
                        <ArrowUpToLine size={13} className="shrink-0" />
                        <span className="hidden md:inline">Top</span>
                      </button>
                      <button
                        onClick={() => handleMoveSelectedQueued('bottom')}
                        className="flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 border border-zinc-700 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                        title="Move selected queued items to bottom"
                      >
                        <ArrowDownToLine size={13} className="shrink-0" />
                        <span className="hidden md:inline">Bottom</span>
                      </button>
                    </>
                  )}

                  <button
                    onClick={handleCopyUrls}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                    title="Copy URLs to clipboard"
                  >
                    <Copy size={13} className="shrink-0" />
                    <span className="hidden sm:inline">Copy URLs</span>
                  </button>

                  <button
                    onClick={() => setShowConfirm(true)}
                    className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 text-xs font-semibold transition-all active:scale-95 shadow-sm whitespace-nowrap shrink-0"
                    title="Delete selected items"
                  >
                    <Trash2 size={13} className="shrink-0" />
                    <span className="hidden sm:inline">Delete</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Tabs with Distinct Live Category Badges */}
      <div className="flex items-center overflow-x-auto flex-nowrap gap-1.5 sm:gap-2 mb-4 pb-1.5 pt-1 px-1 scrollbar-none no-scrollbar touch-pan-x">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const count = grouped[tab.id]?.length || 0;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              style={isActive ? { boxShadow: `0 0 14px -1px ${tab.glowColor}` } : undefined}
              className={`shrink-0 relative flex items-center gap-1.5 sm:gap-2 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl transition-all whitespace-nowrap border select-none ${
                isActive 
                  ? `bg-zinc-850 ${tab.activeBorder} ${tab.activeBg} text-white` 
                  : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
              }`}
            >
              {/* Active Indicator Strip of relevant colour */}
              {isActive && (
                <div 
                  className={`absolute bottom-0 left-2.5 right-2.5 h-[2.5px] rounded-t-full ${tab.stripColor}`}
                  style={{ boxShadow: `0 0 8px ${tab.glowColor}` }}
                />
              )}

              <Icon size={14} className={`shrink-0 ${isActive ? tab.color : 'text-zinc-500'}`} />
              <span className="text-xs sm:text-sm font-medium">
                {tab.label}
              </span>
              {count > 0 && (
                <span className={`px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold transition-colors ${
                  isActive 
                    ? tab.badgeClass 
                    : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sub-Header Actions Row: Select All & Running Global Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 px-1">
        {activeItems.length > 0 ? (
          <button 
            onClick={handleSelectAll} 
            className="text-zinc-400 hover:text-white flex items-center gap-2 py-1 transition-colors"
          >
            {selectedIds.size === activeItems.length && activeItems.length > 0 ? (
              <CheckSquare size={18} className="text-cyan-400" />
            ) : (
              <Square size={18} />
            )}
            <span className="text-sm font-medium">
              {selectedIds.size === activeItems.length ? 'Deselect All' : 'Select All'}
            </span>
            {activeItems.length > 0 && (
              <span className="text-xs text-zinc-500 font-normal">
                ({activeItems.length} {activeItems.length === 1 ? 'item' : 'items'})
              </span>
            )}
          </button>
        ) : <div />}

        {/* Running Tab Global Controls */}
        {activeTab === 'running' && (activeDownloadsInRunning.length > 0 || pausedDownloadsInRunning.length > 0) && (
          <div className="flex items-center gap-2 ml-auto">
            {activeDownloadsInRunning.length > 0 && (
              <button
                onClick={handlePauseAll}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
                title="Pause all active running downloads"
              >
                <Pause size={14} className="fill-current" />
                <span>Pause All ({activeDownloadsInRunning.length})</span>
              </button>
            )}
            {pausedDownloadsInRunning.length > 0 && (
              <button
                onClick={handleResumeAll}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-bold transition-all active:scale-95 shadow-sm"
                title="Resume all paused downloads"
              >
                <Play size={14} className="fill-current" />
                <span>Resume All ({pausedDownloadsInRunning.length})</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Downloads List */}
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {activeItems.length > 0 ? (
            activeItems.map((d, idx) => (
              <ProgressCard 
                key={d.id} 
                download={d} 
                queuePosition={d.status === 'queued' ? idx + 1 : null} 
                selected={selectedIds.has(d.id)}
                onSelect={() => handleSelect(d.id)}
                onMoveToTop={d.status === 'queued' ? () => handleMoveQueued(d.id, 'top') : null}
                onMoveToBottom={d.status === 'queued' ? () => handleMoveQueued(d.id, 'bottom') : null}
                settings={settings}
              />
            ))
          ) : (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-2xl p-10 text-center border border-zinc-800"
            >
              <Inbox size={48} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-400 font-medium text-sm">No items found</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {showConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setShowConfirm(false)}
          >
            <motion.div 
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.92, y: 20 }}
              className="glass rounded-2xl p-6 max-w-md w-full border border-zinc-700 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2.5">
                <AlertTriangle className="text-amber-400" size={22} /> Confirm Deletion
              </h3>
              <p className="text-zinc-400 text-sm mb-5">
                You have selected <strong className="text-white">{selectedIds.size}</strong> download{selectedIds.size > 1 ? 's' : ''}. Choose how you would like to delete them:
              </p>

              {/* Delete Mode Options */}
              <div className="space-y-3 mb-6">
                <label 
                  onClick={() => setDeleteMode('history')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    deleteMode === 'history' 
                      ? 'bg-zinc-800/80 border-cyan-500/50 ring-1 ring-cyan-500/30' 
                      : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="deleteMode" 
                    checked={deleteMode === 'history'} 
                    onChange={() => setDeleteMode('history')}
                    className="mt-1 accent-cyan-500 cursor-pointer" 
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                      <Trash2 size={15} className="text-zinc-400" />
                      Delete from History only
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                      Removes records from download list. Keeps all downloaded files safely stored on your disk.
                    </p>
                  </div>
                </label>

                <label 
                  onClick={() => setDeleteMode('storage')}
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    deleteMode === 'storage' 
                      ? 'bg-red-500/10 border-red-500/50 ring-1 ring-red-500/30' 
                      : 'bg-zinc-900/40 border-zinc-800 hover:bg-zinc-800/40'
                  }`}
                >
                  <input 
                    type="radio" 
                    name="deleteMode" 
                    checked={deleteMode === 'storage'} 
                    onChange={() => setDeleteMode('storage')}
                    className="mt-1 accent-red-500 cursor-pointer" 
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-red-400 flex items-center gap-1.5">
                      <HardDrive size={15} className="text-red-400" />
                      Delete from Storage too
                    </div>
                    <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                      Permanently deletes the downloaded media files from your hard drive and clears records.
                    </p>
                  </div>
                </label>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowConfirm(false)}
                  className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white font-medium text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={executeDelete}
                  className={`px-5 py-2.5 rounded-xl font-bold text-sm transition-all active:scale-95 shadow-lg ${
                    deleteMode === 'storage'
                      ? 'bg-red-500 hover:bg-red-400 text-black shadow-red-500/20'
                      : 'bg-cyan-500 hover:bg-cyan-400 text-black shadow-cyan-500/20'
                  }`}
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual Toast Notification Feedback */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-zinc-900/95 border border-cyan-500/40 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl backdrop-blur-md glow-cyan"
          >
            <Check size={15} className="text-cyan-400" />
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
