import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Loader2, Download, Link2, Clock, Eye, User, X, History, Trash2, Check, Music, Sparkles, AlertTriangle, CopyCheck, RotateCcw, ExternalLink } from 'lucide-react';
import FormatSelector, { calculateDownloadSize } from './FormatSelector';
import CustomDateTimePicker from './CustomDateTimePicker';
import IncognitoIcon from './IncognitoIcon';

const API_BASE = typeof window !== 'undefined' && window.location ? `${window.location.protocol}//${window.location.hostname}:8000` : 'http://127.0.0.1:8000';

export default function HomeTab({ settings, onNavigate }) {
  const [url, setUrl] = useState('');
  const [lastFetchedUrl, setLastFetchedUrl] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef(null);
  const [videoInfo, setVideoInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [selectedAudio, setSelectedAudio] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [scheduledFor, setScheduledFor] = useState('');
  const [showScheduler, setShowScheduler] = useState(false);
  const [duplicateModalData, setDuplicateModalData] = useState(null);
  
  // Search History
  const [searchHistory, setSearchHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchSearchHistory();
  }, [settings?.incognito_mode, settings?.save_search_history]);

  const fetchSearchHistory = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/search-history`);
      if (res.ok) {
        const data = await res.json();
        setSearchHistory(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.warn('Could not fetch search history:', e);
    }
  };

  const clearHistory = async (e) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`${API_BASE}/api/search-history`, { method: 'DELETE' });
      setSearchHistory([]);
    } catch (e) {
      console.warn('Could not clear search history:', e);
    }
  };

  const saveToHistory = async (q) => {
    if (settings?.incognito_mode || settings?.save_search_history === false) return;
    const cleanQ = (q || '').trim();
    if (!cleanQ) return;
    try {
      await fetch(`${API_BASE}/api/search-history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: cleanQ })
      });
      fetchSearchHistory();
    } catch (e) {
      console.warn('Could not save search history:', e);
    }
  };


  const fetchFormats = async (urlToFetch = url) => {
    const targetUrl = urlToFetch.trim();
    if (!targetUrl) return;
    
    // If called directly from paste, ensure input box shows it
    if (urlToFetch !== url) setUrl(targetUrl);
    
    setLastFetchedUrl(targetUrl);
    setLoading(true);
    setError(null);
    setVideoInfo(null);
    setSelectedVideo(null);
    setSelectedAudio(null);
    setDownloadSuccess(false);
    setAdvancedOptions(DEFAULT_ADVANCED_OPTIONS);

    try {
      if (!settings?.incognito_mode && settings?.save_search_history !== false) {
        saveToHistory(targetUrl);
      }
      const res = await fetch(`${API_BASE}/api/formats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || 'Failed to fetch formats');
      }
      const data = await res.json();
      setVideoInfo(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const DEFAULT_ADVANCED_OPTIONS = {
    cut: null, // {start: '', end: ''}
    crop: null, // {x:0, y:0, w:0, h:0, ref_w:1920, ref_h:1080}
    sponsorblock: null, // ['sponsor', 'intro', ...]
    sponsorblock_action: 'remove', // 'remove' | 'mark'
    subtitles: null, // {embed: false, write_auto: false, write_subs: false, langs: 'en', sub_format: 'srt'}
    embed_chapters: null, // bool
    split_chapters: null, // bool
    remove_audio: null, // bool
    recode_video: null, // str
    recode_audio: null, // str
    extra_commands: null, // str
    filename_template: null, // str
    live_from_start: null, // bool
    wait_for_video: null, // int
    audio_quality: null, // str
    embed_thumbnail: null, // bool
    write_thumbnail: null // bool
  };

  const [activeMode, setActiveMode] = useState('video');
  const [advancedOptions, setAdvancedOptions] = useState(DEFAULT_ADVANCED_OPTIONS);


  const handleDownload = async (scheduleDateOverride = null) => {
    if (!videoInfo && !url.trim()) return;
    setDownloading(true);
    setError(null);
    const isAudioOnlyMode = activeMode === 'audio';
    
    // Ignore React SyntheticEvent objects if passed by onClick
    const override = typeof scheduleDateOverride === 'string' ? scheduleDateOverride : null;
    const finalSchedule = override || scheduledFor;
    
    const downloadUrl = videoInfo ? videoInfo.webpage_url : url.trim();
    const downloadTitle = videoInfo?.title || null;
    const downloadThumb = videoInfo?.thumbnail || null;
    
    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: downloadUrl,
          video_format_id: isAudioOnlyMode ? null : selectedVideo,
          audio_format_id: selectedAudio,
          quick_download: !selectedVideo && !selectedAudio,
          audio_only: isAudioOnlyMode,
          scheduled_for: finalSchedule ? new Date(finalSchedule).toISOString() : null,
          title: downloadTitle,
          thumbnail: downloadThumb,
          advanced_options: advancedOptions
        }),
      });
      if (res.ok) {
        setDownloadSuccess(true);
        if (onNavigate) {
          onNavigate('running');
        }
        setTimeout(() => setDownloadSuccess(false), 3000);
      } else {
        const errData = await res.json().catch(() => ({}));
        if (res.status === 409 || errData.is_duplicate || errData.detail === 'duplicate') {
          setDuplicateModalData({
            url: downloadUrl,
            video_format_id: isAudioOnlyMode ? null : selectedVideo,
            audio_format_id: selectedAudio,
            quick_download: !selectedVideo && !selectedAudio,
            audio_only: isAudioOnlyMode,
            scheduled_for: finalSchedule ? new Date(finalSchedule).toISOString() : null,
            title: downloadTitle || errData.duplicate_info?.title,
            thumbnail: downloadThumb || errData.duplicate_info?.thumbnail,
            advanced_options: advancedOptions,
            info: errData.duplicate_info || {},
            message: errData.message || errData.duplicate_info?.message || 'This media item has already been downloaded or is currently in progress.',
          });
        } else {
          setError(errData.detail || 'Download request failed');
        }
      }
    } catch (err) {
      console.error('Download error:', err);
      setError(err.message || 'Network error starting download');
    } finally {
      setDownloading(false);
    }
  };

  const handleForceDownload = async () => {
    if (!duplicateModalData) return;
    const payload = {
      url: duplicateModalData.url,
      video_format_id: duplicateModalData.video_format_id,
      audio_format_id: duplicateModalData.audio_format_id,
      quick_download: duplicateModalData.quick_download,
      audio_only: duplicateModalData.audio_only,
      scheduled_for: duplicateModalData.scheduled_for,
      title: duplicateModalData.title,
      thumbnail: duplicateModalData.thumbnail,
      advanced_options: duplicateModalData.advanced_options,
      force: true,
    };
    setDuplicateModalData(null);
    setDownloading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setDownloadSuccess(true);
        if (onNavigate) {
          onNavigate('running');
        }
        setTimeout(() => setDownloadSuccess(false), 3000);
      } else {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || 'Failed to force download');
      }
    } catch (err) {
      setError(err.message || 'Error forcing download');
    } finally {
      setDownloading(false);
    }
  };

  // Calculate dynamic download button details
  const downloadDetails = useMemo(() => {
    if (!videoInfo) {
      return {
        label: 'Download',
        isAudio: activeMode === 'audio',
      };
    }

    if (activeMode === 'audio') {
      // Audio container
      const containerOverride = advancedOptions?.recode_audio && advancedOptions.recode_audio !== 'none'
        ? advancedOptions.recode_audio.toUpperCase()
        : null;
      
      const selectedAudioFmt = videoInfo.formats?.find(f => f.format_id === selectedAudio);
      const container = containerOverride || (selectedAudioFmt?.ext ? selectedAudioFmt.ext.toUpperCase() : 'MP3');

      // Bitrate
      let bitrateStr = null;
      if (advancedOptions?.audio_quality && advancedOptions.audio_quality !== 'none') {
        bitrateStr = advancedOptions.audio_quality === 'best'
          ? 'Best'
          : (advancedOptions.audio_quality === '0' ? 'VBR 0' : advancedOptions.audio_quality);
      } else if (selectedAudioFmt?.abr) {
        bitrateStr = `${Math.round(selectedAudioFmt.abr)}k`;
      } else if (selectedAudioFmt?.tbr) {
        bitrateStr = `${Math.round(selectedAudioFmt.tbr)}k`;
      }

      // Audio size
      const sizeStr = selectedAudioFmt ? calculateDownloadSize(selectedAudioFmt, videoInfo.duration, [], null, false) : null;

      const details = [];
      if (bitrateStr) details.push(bitrateStr);
      if (sizeStr) details.push(sizeStr);

      const label = details.length > 0 
        ? `Download ${container} (${details.join(' • ')})`
        : `Download ${container}`;

      return {
        label,
        isAudio: true,
      };
    } else {
      // Video mode
      if (!selectedVideo) {
        return {
          label: 'Quick Download',
          isAudio: false,
        };
      }

      const selectedFmt = videoInfo.formats?.find(f => f.format_id === selectedVideo);
      let resLabel = '';
      if (selectedFmt) {
        if (selectedFmt.height) {
          if (selectedFmt.height >= 2160) resLabel = '4K';
          else if (selectedFmt.height >= 1440) resLabel = '1440p';
          else resLabel = `${selectedFmt.height}p`;
        } else if (selectedFmt.resolution) {
          resLabel = selectedFmt.resolution;
        } else if (selectedFmt.format_note) {
          resLabel = selectedFmt.format_note;
        }
      }

      const recodeExt = advancedOptions?.recode_video && advancedOptions.recode_video !== 'none'
        ? advancedOptions.recode_video.toUpperCase()
        : null;

      const ext = recodeExt || (selectedFmt?.ext ? selectedFmt.ext.toUpperCase() : 'MP4');

      // Video size (combined with audio if video-only)
      const audioFormats = videoInfo.formats?.filter(f => f.type === 'audio') || [];
      const sizeStr = calculateDownloadSize(
        selectedFmt,
        videoInfo.duration,
        audioFormats,
        selectedAudio,
        advancedOptions?.remove_audio
      );

      const label = `Download ${resLabel || 'Video'} • ${ext}${sizeStr ? ` (${sizeStr})` : ''}`;

      return {
        label,
        isAudio: false,
      };
    }
  }, [videoInfo, activeMode, selectedVideo, selectedAudio, advancedOptions]);

  const activeOverridesCount = useMemo(() => {
    let count = 0;
    if (advancedOptions?.sponsorblock?.length > 0) count++;
    if (advancedOptions?.subtitles && (advancedOptions.subtitles.embed || advancedOptions.subtitles.write_subs || advancedOptions.subtitles.write_auto)) count++;
    if (advancedOptions?.embed_chapters || advancedOptions?.split_chapters) count++;
    if (advancedOptions?.cut && (advancedOptions.cut.start || advancedOptions.cut.end || advancedOptions.cut.segments?.length > 0)) count++;
    if (advancedOptions?.crop && advancedOptions.crop.w > 0 && advancedOptions.crop.h > 0) count++;
    if (advancedOptions?.remove_audio) count++;
    if (activeMode === 'video' && advancedOptions?.recode_video && advancedOptions.recode_video !== 'none') count++;
    if (advancedOptions?.filename_template?.trim()) count++;
    if (advancedOptions?.extra_commands?.trim()) count++;
    return count;
  }, [advancedOptions, activeMode]);

  const handlePaste = async (e) => {
    let text = e.clipboardData?.getData('text') || '';
    if (text && (text.startsWith('http://') || text.startsWith('https://'))) {
      e.preventDefault();
      
      // Instantly normalize YouTube URLs to prevent brief visual jump to ugly tracking URLs
      try {
        const lowerUrl = text.toLowerCase();
        if (lowerUrl.includes('youtube.com') || lowerUrl.includes('youtu.be')) {
          const match = text.match(/(?:v=|\/shorts\/|\/embed\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
          if (match && match[1]) {
            const isMusic = lowerUrl.includes('music.youtube.com');
            const domain = isMusic ? 'music.youtube.com' : 'www.youtube.com';
            text = `https://${domain}/watch?v=${match[1]}`;
          }
        }
      } catch (err) {}

      setUrl(text);
      // Auto-fetch on paste
      setTimeout(() => {
        fetchFormats(text);
      }, 50);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      setShowHistory(false);
      setIsFocused(false);
      e.target.blur();
      if (url.trim()) {
        fetchFormats();
      }
    }
  };

  const formatViews = (count) => {
    if (!count) return '';
    if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M views`;
    if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K views`;
    return `${count} views`;
  };

  const isGlowing = !loading && (isFocused || Boolean(url && url.trim().length > 0 && url.trim() !== lastFetchedUrl));

  return (
    <div className="min-h-screen flex flex-col items-center pt-16 pb-44 px-4">
      {/* Hero Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-10 flex flex-col items-center"
      >
        <h1 className="text-4xl font-bold mb-2">
          <span className="gradient-text">yt-dlp</span>
          <span className="text-zinc-300"> Downloader</span>
        </h1>
        <p className="text-zinc-500 text-sm">Paste a URL to get started</p>
        {settings?.incognito_mode && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-3.5 inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-purple-500/10 border border-purple-500/25 text-purple-300 text-xs font-medium backdrop-blur-sm shadow-sm shadow-purple-500/10"
          >
            <IncognitoIcon size={14} className="text-purple-400" />
            <span>Incognito Mode Active &bull; Downloads won&apos;t be saved to history</span>
          </motion.div>
        )}
      </motion.div>

      {/* Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="w-full max-w-2xl mb-8"
      >
        <div className="relative group">
          <div className={`absolute inset-0 rounded-2xl ${
            settings?.incognito_mode 
              ? 'bg-gradient-to-r from-purple-500/20 to-violet-500/20' 
              : 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20'
          } blur-xl opacity-0 group-focus-within:opacity-100 transition-opacity duration-500`} />
          <div className="relative flex items-center glass rounded-2xl overflow-hidden border border-zinc-700/60 focus-within:border-cyan-500/60 transition-colors shadow-lg">
            {settings?.incognito_mode ? (
              <IncognitoIcon className="ml-4 text-purple-400 dark:text-purple-400 flex-shrink-0" size={20} strokeWidth={2.4} />
            ) : (
              <Link2 className="ml-4 text-cyan-500 dark:text-cyan-400 flex-shrink-0" size={20} strokeWidth={2.4} />
            )}
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                setIsFocused(true);
                setShowHistory(true);
              }}
              onBlur={() => {
                setIsFocused(false);
                setTimeout(() => setShowHistory(false), 200);
              }}
              placeholder={settings?.incognito_mode ? "Paste video URL (Incognito mode active)..." : "Paste video URL here..."}
              className="flex-1 min-w-0 bg-transparent px-4 py-4 text-zinc-100 placeholder-zinc-500 outline-none text-sm font-medium"
            />
            {url && (
              <button 
                onClick={() => { 
                  setUrl(''); 
                  setVideoInfo(null); 
                  setError(null); 
                  setLastFetchedUrl(''); 
                  inputRef.current?.focus();
                }} 
                className="text-zinc-400 hover:text-zinc-200 px-3 py-2 transition-colors mr-1"
                title="Clear input"
              >
                <X size={18} strokeWidth={2.4} />
              </button>
            )}
            <button
              onClick={() => {
                inputRef.current?.blur();
                setIsFocused(false);
                if (url.trim()) {
                  fetchFormats();
                }
              }}
              disabled={loading}
              className={`flex items-center gap-2 px-6 py-4 font-semibold text-sm transition-all duration-300 select-none border-l disabled:cursor-not-allowed shrink-0 ${
                isGlowing
                  ? (settings?.incognito_mode
                      ? 'bg-gradient-to-r from-purple-500/25 via-violet-500/20 to-purple-500/25 text-purple-200 hover:text-white border-l-purple-500/70 shadow-[0_0_20px_rgba(168,85,247,0.45)] hover:shadow-[0_0_30px_rgba(168,85,247,0.65)] cursor-pointer'
                      : 'bg-gradient-to-r from-cyan-500/25 via-sky-500/20 to-blue-500/25 text-cyan-200 hover:text-white border-l-cyan-500/70 shadow-[0_0_20px_rgba(6,182,212,0.45)] hover:shadow-[0_0_30px_rgba(6,182,212,0.65)] cursor-pointer')
                  : 'bg-zinc-850/80 text-zinc-500 border-l-zinc-700/50 cursor-not-allowed opacity-60'
              }`}
              title="Inspect formats & options"
            >
              {loading ? (
                <Loader2 size={18} strokeWidth={2.4} className="animate-spin text-zinc-400" />
              ) : (
                <Search 
                  size={18} 
                  strokeWidth={isGlowing ? 2.5 : 2.2} 
                  className={
                    isGlowing 
                      ? (settings?.incognito_mode ? "text-purple-300 drop-shadow-[0_0_8px_rgba(168,85,247,0.6)]" : "text-cyan-400 drop-shadow-[0_0_8px_rgba(6,182,212,0.6)]")
                      : "text-zinc-500"
                  } 
                />
              )}
              <span className={`text-sm tracking-wide ${isGlowing ? 'font-bold' : 'font-medium'}`}>Fetch</span>
            </button>
          </div>
          {/* Search History Dropdown */}
          <AnimatePresence>
            {showHistory && searchHistory.length > 0 && !videoInfo && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                onMouseDown={(e) => e.preventDefault()}
                className="absolute top-full left-0 right-0 mt-2 z-50 glass rounded-2xl border border-zinc-800 overflow-hidden shadow-2xl"
              >
                <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/50">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-400 flex items-center gap-2"><History size={14}/> Recent Searches</span>
                    {settings?.incognito_mode && (
                      <span className="text-[10px] text-purple-400/80 font-normal bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">Incognito (Paused)</span>
                    )}
                    {settings?.save_search_history === false && (
                      <span className="text-[10px] text-zinc-400 font-normal bg-zinc-800 px-2 py-0.5 rounded border border-zinc-700">Disabled</span>
                    )}
                  </div>
                  <button 
                    onClick={clearHistory} 
                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors px-2 py-1 rounded hover:bg-red-500/10"
                  >
                    <Trash2 size={12}/> Clear
                  </button>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {searchHistory.map((item, idx) => (
                    <div 
                      key={idx}
                      onClick={() => { 
                        setUrl(item); 
                        setShowHistory(false); 
                        fetchFormats(item);
                      }}
                      className="px-4 py-3 text-sm text-zinc-300 hover:bg-zinc-800/80 cursor-pointer truncate flex items-center justify-between group transition-colors"
                    >
                      <div className="flex items-center gap-3 truncate">
                        <Search size={14} className="text-zinc-500 group-hover:text-cyan-400 transition-colors shrink-0" />
                        <span className="truncate">{item}</span>
                      </div>
                      <span className="text-[11px] text-zinc-500 group-hover:text-zinc-400 shrink-0 ml-2">Inspect &rarr;</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full max-w-2xl mb-6 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading Skeleton */}
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="w-full max-w-2xl"
          >
            <div className="glass rounded-2xl p-4 sm:p-6 space-y-4">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="w-full sm:w-52 aspect-video rounded-xl bg-zinc-800 shimmer shrink-0" />
                <div className="flex-1 space-y-3">
                  <div className="h-5 bg-zinc-800 rounded-lg shimmer w-3/4" />
                  <div className="h-4 bg-zinc-800 rounded-lg shimmer w-1/2" />
                  <div className="h-4 bg-zinc-800 rounded-lg shimmer w-1/3" />
                </div>
              </div>
              <div className="flex gap-2">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-10 w-20 bg-zinc-800 rounded-full shimmer" />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Info + Format Selector */}
      <AnimatePresence>
        {videoInfo && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-2xl"
          >
            {/* Video Card */}
            <div className="glass rounded-2xl p-4 sm:p-6 mb-6">
              <div className="flex flex-col sm:flex-row gap-4 sm:gap-5">
                {videoInfo.thumbnail && (
                  <img
                    src={videoInfo.thumbnail}
                    alt={videoInfo.title}
                    className="w-full sm:w-52 aspect-video object-cover rounded-xl flex-shrink-0"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <h2 className="text-base sm:text-lg font-semibold text-white truncate mb-2">
                    {videoInfo.title}
                  </h2>
                  <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
                    {videoInfo.uploader && (
                      <span className="flex items-center gap-1">
                        <User size={13} />
                        {videoInfo.uploader}
                      </span>
                    )}
                    {videoInfo.duration_string && (
                      <span className="flex items-center gap-1">
                        <Clock size={13} />
                        {videoInfo.duration_string}
                      </span>
                    )}
                    {videoInfo.view_count && (
                      <span className="flex items-center gap-1">
                        <Eye size={13} />
                        {formatViews(videoInfo.view_count)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <FormatSelector
              formats={videoInfo.formats}
              duration={videoInfo.duration}
              webpageUrl={videoInfo.webpage_url}
              thumbnail={videoInfo.thumbnail}
              selectedVideo={selectedVideo}
              selectedAudio={selectedAudio}
              onSelectVideo={setSelectedVideo}
              onSelectAudio={setSelectedAudio}
              activeMode={activeMode}
              setActiveMode={setActiveMode}
              advancedOptions={advancedOptions}
              setAdvancedOptions={setAdvancedOptions}
              settings={settings}
            />

            {/* Download Action Area & Scheduler */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="mt-8 mb-6 flex flex-col items-center justify-center gap-2.5 w-full"
            >
              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={() => handleDownload()}
                  disabled={downloading}
                  className={`inline-flex items-center justify-center gap-2.5 px-6 py-2.5 rounded-xl font-medium text-sm text-white shadow-lg transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
                    downloadDetails.isAudio
                      ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-emerald-500/20'
                      : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 shadow-cyan-500/20'
                  }`}
                >
                  {downloading ? (
                    <Loader2 size={16} className="animate-spin text-white shrink-0" />
                  ) : downloadSuccess ? (
                    <Check size={16} className="text-white stroke-[3] shrink-0" />
                  ) : downloadDetails.isAudio ? (
                    <Music size={16} className="text-white shrink-0" />
                  ) : (
                    <Download size={16} className="text-white shrink-0" />
                  )}

                  <span className="truncate">
                    {downloadSuccess ? 'Added to Queue!' : downloadDetails.label}
                  </span>

                  {activeOverridesCount > 0 && !downloadSuccess && (
                    <span className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-black/30 text-white border border-white/20 shrink-0">
                      +{activeOverridesCount}
                    </span>
                  )}
                </button>

                {/* Schedule Button */}
                <button
                  type="button"
                  onClick={() => setShowScheduler(!showScheduler)}
                  className={`p-2.5 rounded-xl border transition-all shadow-sm flex items-center justify-center shrink-0 ${
                    scheduledFor
                      ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/60 shadow-lg shadow-cyan-500/20 ring-2 ring-cyan-500/40'
                      : 'border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-400 hover:text-white'
                  }`}
                  title={scheduledFor ? 'Change scheduled time' : 'Schedule download'}
                >
                  <Clock size={16} className={scheduledFor ? 'text-cyan-400 animate-pulse' : ''} />
                </button>
              </div>

              <AnimatePresence>
                {showScheduler && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                  >
                    <motion.div
                      initial={{ scale: 0.9, opacity: 0, y: 20 }}
                      animate={{ scale: 1, opacity: 1, y: 0 }}
                      exit={{ scale: 0.9, opacity: 0, y: 20 }}
                    >
                      <CustomDateTimePicker 
                        value={scheduledFor}
                        onChange={(val) => { 
                          setScheduledFor(val); 
                          setShowScheduler(false); 
                          handleDownload(val);
                        }}
                        onClose={() => setShowScheduler(false)}
                      />
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>
              
              {scheduledFor && (
                <div className="flex items-center gap-2 px-3.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-medium">
                  <Clock size={12} className="text-cyan-400" />
                  <span>Scheduled: {new Date(scheduledFor).toLocaleString()}</span>
                  <button 
                    type="button"
                    onClick={() => setScheduledFor('')}
                    className="ml-1 text-zinc-400 hover:text-red-400 transition-colors"
                    title="Remove schedule"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Duplicate Download Warning Modal (YTDLnis Parity) */}
      <AnimatePresence>
        {duplicateModalData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0, y: 16 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 16 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl overflow-hidden p-6 space-y-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 flex-shrink-0 mt-0.5">
                  <AlertTriangle size={22} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-base font-bold text-zinc-100">Duplicate Detected</h3>
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                      {duplicateModalData.info?.mode === 'download_archive' ? 'Archive Match' : duplicateModalData.info?.status || 'Already Exists'}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-1">
                    {duplicateModalData.message}
                  </p>
                </div>
              </div>

              {/* Item Card Preview */}
              {(duplicateModalData.title || duplicateModalData.thumbnail) && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80">
                  {duplicateModalData.thumbnail && (
                    <img
                      src={duplicateModalData.thumbnail}
                      alt="Thumbnail"
                      className="w-16 h-10 object-cover rounded-lg border border-zinc-800 flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-zinc-200 line-clamp-1">
                      {duplicateModalData.title || duplicateModalData.url}
                    </p>
                    <p className="text-[11px] text-zinc-400">
                      Type: <span className="text-cyan-400">{duplicateModalData.isAudioOnly ? 'Audio Only' : 'Video + Audio'}</span>
                    </p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2.5 pt-2 border-t border-zinc-800/80">
                {duplicateModalData.info?.status === 'finished' && onNavigate && (
                  <button
                    type="button"
                    onClick={() => {
                      setDuplicateModalData(null);
                      onNavigate('finished');
                    }}
                    className="px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={13} />
                    <span>View in History</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setDuplicateModalData(null)}
                  className="px-3.5 py-2 rounded-xl text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleForceDownload}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-black shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-1.5"
                >
                  <RotateCcw size={13} />
                  <span>Download Anyway</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
