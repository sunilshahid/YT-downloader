import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import {
  Scissors,
  Crop,
  Check,
  RotateCcw,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronLeft,
  ChevronRight,
  Volume2,
  VolumeX,
  Trash2,
  AlertCircle,
  Info,
  Film,
  Clock,
  Zap,
  Plus,
  Edit3,
  Magnet
} from 'lucide-react';

/* ─────────────────────────────────────────────────────────────
   Time Formatting & Extraction Utilities
───────────────────────────────────────────────────────────── */
function parseTimeToSeconds(val) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s) return null;

  if (!isNaN(s)) {
    return parseFloat(s);
  }

  const parts = s.split(':').map((p) => parseFloat(p));
  if (parts.some((p) => isNaN(p))) return null;

  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 1) {
    return parts[0];
  }
  return null;
}

function formatSecondsToTime(totalSec) {
  if (totalSec === null || totalSec === undefined || isNaN(totalSec) || totalSec < 0) return '00:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function formatTimecodeWithFrames(totalSec, fps = 30) {
  if (totalSec === null || totalSec === undefined || isNaN(totalSec) || totalSec < 0) return '00:00:00';
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = Math.floor(totalSec % 60);
  const frames = Math.floor((totalSec % 1) * fps);
  const secStr = secs.toString().padStart(2, '0');
  const frameStr = frames.toString().padStart(2, '0');
  if (hrs > 0) {
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secStr}:${frameStr}`;
  }
  return `${mins.toString().padStart(2, '0')}:${secStr}:${frameStr}`;
}

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.trim();
  const vMatch = clean.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/i);
  if (vMatch && vMatch[1]) return vMatch[1];
  const shortsMatch = clean.match(/youtube\.com\/shorts\/([^"&?\/ ]{11})/i);
  if (shortsMatch && shortsMatch[1]) return shortsMatch[1];
  return null;
}

/* ─────────────────────────────────────────────────────────────
   Main TrimCropModal Component
───────────────────────────────────────────────────────────── */
export default function TrimCropModal({
  options = {},
  onChangeCut = () => {},
  onChangeCrop = () => {},
  onClose = () => {},
  activeMode = 'video',
  duration = null,
  webpageUrl = '',
  thumbnail = ''
}) {
  const [tab, setTab] = useState('cut'); // 'cut' | 'crop'

  // Video duration resolution
  const rawDuration = typeof duration === 'number' && duration > 0 ? duration : (typeof duration === 'string' && !isNaN(duration) ? parseFloat(duration) : null);
  const [videoDuration, setVideoDuration] = useState(rawDuration || 0);

  useEffect(() => {
    if (rawDuration && rawDuration > 0) {
      setVideoDuration(rawDuration);
    }
  }, [rawDuration]);

  const numDuration = videoDuration > 0 ? videoDuration : null;
  const durationStr = numDuration ? formatSecondsToTime(numDuration) : null;

  /* ─────────────────────────────────────────────────────────────
     Cut / Trim State (Include / Exclude & Multi-Cut)
  ───────────────────────────────────────────────────────────── */
  const initialCuts = useMemo(() => {
    if (options.cut?.segments && Array.isArray(options.cut.segments) && options.cut.segments.length > 0) {
      return options.cut.segments.map((s) => ({ start: s.start || '', end: s.end || '' }));
    }
    if (Array.isArray(options.cut) && options.cut.length > 0) {
      return options.cut.map((s) => ({ start: s.start || '', end: s.end || '' }));
    }
    if (options.cut && (options.cut.start || options.cut.end)) {
      return [{ start: options.cut.start || '', end: options.cut.end || '' }];
    }
    return [];
  }, [options.cut]);

  const [cuts, setCuts] = useState(initialCuts);
  const [selectedCutIndex, setSelectedCutIndex] = useState(null); // null = drafting new cut, number = editing existing cut
  const [newStart, setNewStart] = useState(() => {
    if (initialCuts.length > 0) return initialCuts[0].start;
    return '00:00';
  });
  const [newEnd, setNewEnd] = useState(() => {
    if (initialCuts.length > 0) return initialCuts[0].end;
    return durationStr || '01:00';
  });

  const [cutAction, setCutAction] = useState(() => {
    return (options.cut?.action || options.cut?.mode || 'include').toLowerCase() === 'remove' ? 'remove' : 'include';
  });

  // User-controllable toggle for Auto-Play Included Only
  const [autoPlayIncluded, setAutoPlayIncluded] = useState(true);

  // Scrubber dragging & seek throttling state
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isScrubberSelected, setIsScrubberSelected] = useState(false);
  const [snappedGuideline, setSnappedGuideline] = useState(null); // { time, pct }
  const lastSeekTimestampRef = useRef(0);
  const wasDraggingRef = useRef(false);
  const currentTimeRef = useRef(0);

  /* ─────────────────────────────────────────────────────────────
     Crop Geometry State (Reference: 1920x1080)
  ───────────────────────────────────────────────────────────── */
  const initialCrop = useMemo(() => {
    const c = options.crop;
    if (c && c.w > 0 && c.h > 0) {
      return {
        x: c.x || 0,
        y: c.y || 0,
        w: c.w,
        h: c.h,
        ref_w: c.ref_w || 1920,
        ref_h: c.ref_h || 1080
      };
    }
    return { x: 0, y: 0, w: 1920, h: 1080, ref_w: 1920, ref_h: 1080 };
  }, [options.crop]);

  const [crop, setCrop] = useState(initialCrop);
  const [aspectRatioPreset, setAspectRatioPreset] = useState('free'); // 'free' | '1:1' | '4:3' | '16:9' | '9:16' | '2.40:1'

  /* ─────────────────────────────────────────────────────────────
     Video Playback State
  ───────────────────────────────────────────────────────────── */
  const youtubeId = useMemo(() => extractYouTubeId(webpageUrl), [webpageUrl]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  currentTimeRef.current = currentTime;
  const [isMuted, setIsMuted] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [playerError, setPlayerError] = useState(false);

  const playerRef = useRef(null);
  const iframeContainerId = useMemo(() => `yt-player-${Math.random().toString(36).substring(2, 9)}`, []);
  const cropCanvasRef = useRef(null);
  const dragInfoRef = useRef(null);
  const rangeBarRef = useRef(null);

  /* ─────────────────────────────────────────────────────────────
     Cut Normalization & Merging Engine
  ───────────────────────────────────────────────────────────── */
  const normalizeAndMergeCuts = useCallback((cutList) => {
    if (!cutList || cutList.length === 0) return [];
    const valid = [];
    for (const c of cutList) {
      const sVal = parseTimeToSeconds(c.start);
      const eVal = parseTimeToSeconds(c.end);
      let s = sVal !== null ? sVal : 0;
      let e = eVal !== null ? eVal : (numDuration || Infinity);
      if (numDuration !== null) {
        s = Math.min(s, numDuration);
        if (e !== Infinity) e = Math.min(e, numDuration);
      }
      if (e > s) {
        valid.push({ s, e });
      }
    }
    if (valid.length === 0) return [];
    valid.sort((a, b) => a.s - b.s);

    const merged = [];
    for (const item of valid) {
      if (merged.length === 0) {
        merged.push({ ...item });
      } else {
        const prev = merged[merged.length - 1];
        if (item.s <= prev.e) {
          prev.e = Math.max(prev.e, item.e);
        } else {
          merged.push({ ...item });
        }
      }
    }

    return merged.map((m) => ({
      start: formatSecondsToTime(m.s),
      end: m.e === Infinity ? (durationStr || 'End') : formatSecondsToTime(m.e),
      s: m.s,
      e: m.e
    }));
  }, [numDuration, durationStr]);

  // Merge all cuts that are actively part of the download
  const activeMergedCuts = useMemo(() => {
    let listToMerge = [...cuts];
    // If no cuts added yet, take the current input range as the single cut
    if (listToMerge.length === 0 && (newStart.trim() || newEnd.trim())) {
      listToMerge = [{ start: newStart, end: newEnd }];
    }
    return normalizeAndMergeCuts(listToMerge);
  }, [cuts, newStart, newEnd, normalizeAndMergeCuts]);

  // Active single-range bounds for slider thumbs
  const currentActiveStartSec = useMemo(() => {
    const s = parseTimeToSeconds(newStart);
    return s !== null && s >= 0 ? s : 0;
  }, [newStart]);

  const currentActiveEndSec = useMemo(() => {
    const e = parseTimeToSeconds(newEnd);
    return e !== null && e > currentActiveStartSec ? e : (numDuration || 100);
  }, [newEnd, currentActiveStartSec, numDuration]);

  // Check if current playback time is inside any included segment
  const isInsideIncluded = useMemo(() => {
    if (cutAction !== 'include') return true;
    if (activeMergedCuts.length === 0) return true;
    return activeMergedCuts.some((c) => currentTime >= c.s - 0.1 && currentTime <= c.e + 0.1);
  }, [cutAction, activeMergedCuts, currentTime]);

  // Expected resulting duration
  const resultingDuration = useMemo(() => {
    if (!numDuration) return null;
    if (activeMergedCuts.length === 0) {
      return numDuration;
    }
    let totalCutSec = 0;
    for (const m of activeMergedCuts) {
      totalCutSec += Math.max(0, m.e - m.s);
    }
    if (cutAction === 'include') {
      return Math.min(numDuration, totalCutSec);
    } else {
      return Math.max(0, numDuration - totalCutSec);
    }
  }, [activeMergedCuts, numDuration, cutAction]);

  /* ─────────────────────────────────────────────────────────────
     Validation
  ───────────────────────────────────────────────────────────── */
  const parsedStart = parseTimeToSeconds(newStart);
  const parsedEnd = parseTimeToSeconds(newEnd);

  let validationError = null;
  let validationWarning = null;

  if (parsedStart !== null && parsedStart < 0) {
    validationError = 'Start time cannot be negative.';
  } else if (numDuration !== null && parsedStart !== null && parsedStart >= numDuration) {
    validationError = `Start time (${formatSecondsToTime(parsedStart)}) exceeds video length (${durationStr}).`;
  } else if (parsedStart !== null && parsedEnd !== null && parsedStart >= parsedEnd) {
    validationError = `Start time (${formatSecondsToTime(parsedStart)}) must be earlier than End time (${formatSecondsToTime(parsedEnd)}).`;
  } else if (numDuration !== null && parsedEnd !== null && parsedEnd > numDuration) {
    validationWarning = `End time (${formatSecondsToTime(parsedEnd)}) exceeds video length (${durationStr}). It will be capped.`;
  } else if (cutAction === 'remove' && numDuration !== null && parsedStart === 0 && parsedEnd !== null && parsedEnd >= numDuration) {
    validationError = `Removing the entire video leaves no content.`;
  }

  /* ─────────────────────────────────────────────────────────────
     YouTube Player Integration (Chromeless Native Underlay)
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    if (!youtubeId) return;
    if (typeof window !== 'undefined' && !window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      if (firstScriptTag && firstScriptTag.parentNode) {
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      } else {
        document.head.appendChild(tag);
      }
    }
  }, [youtubeId]);

  useEffect(() => {
    if (!youtubeId || playerError) return;

    let destroyed = false;
    const checkYT = setInterval(() => {
      if (window.YT && window.YT.Player) {
        clearInterval(checkYT);
        if (destroyed) return;

        try {
          playerRef.current = new window.YT.Player(iframeContainerId, {
            videoId: youtubeId,
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              modestbranding: 1,
              rel: 0,
              playsinline: 1,
              iv_load_policy: 3,
              fs: 0,
              origin: window.location.origin
            },
            events: {
              onReady: (e) => {
                if (destroyed) return;
                setPlayerReady(true);
                const d = e.target.getDuration();
                if (d && d > 0 && (!numDuration || numDuration <= 0)) {
                  setVideoDuration(d);
                }
              },
              onStateChange: (e) => {
                if (destroyed) return;
                setIsPlaying(e.data === 1);
              },
              onError: () => {
                if (destroyed) return;
                setPlayerError(true);
              }
            }
          });
        } catch (err) {
          console.warn('YouTube Player initialization failed:', err);
          setPlayerError(true);
        }
      }
    }, 150);

    return () => {
      destroyed = true;
      clearInterval(checkYT);
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {
          // ignore
        }
        playerRef.current = null;
      }
    };
  }, [youtubeId, iframeContainerId, playerError, numDuration]);

  // Seek Function
  const seekTo = useCallback((sec) => {
    const clamped = Math.max(0, numDuration ? Math.min(numDuration, sec) : sec);
    setCurrentTime(clamped);
    lastSeekTimestampRef.current = Date.now();
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      try {
        playerRef.current.seekTo(clamped, true);
      } catch {
        // ignore
      }
    }
  }, [numDuration]);

  // Toggle Play / Pause with "Play Included Only" Enforcement
  const togglePlay = useCallback(() => {
    // If starting playback and currently outside the included range, jump straight to start!
    if (!isPlaying && cutAction === 'include' && autoPlayIncluded && activeMergedCuts.length > 0) {
      if (!isInsideIncluded) {
        seekTo(activeMergedCuts[0].s);
      }
    }

    if (playerRef.current && typeof playerRef.current.playVideo === 'function') {
      try {
        if (isPlaying) {
          playerRef.current.pauseVideo();
        } else {
          playerRef.current.playVideo();
        }
      } catch {
        setIsPlaying(!isPlaying);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying, cutAction, autoPlayIncluded, activeMergedCuts, isInsideIncluded, seekTo]);

  // Toggle Mute
  const toggleMute = useCallback(() => {
    if (playerRef.current && typeof playerRef.current.mute === 'function') {
      try {
        if (isMuted) {
          playerRef.current.unMute();
          setIsMuted(false);
        } else {
          playerRef.current.mute();
          setIsMuted(true);
        }
      } catch {
        setIsMuted(!isMuted);
      }
    } else {
      setIsMuted(!isMuted);
    }
  }, [isMuted]);

  // Jump to Previous Keep Segment
  const handlePrevKeep = () => {
    if (cutAction === 'include' && activeMergedCuts.length > 0) {
      // If currently inside a keep and more than 1.5 seconds past its start, restart that keep
      const currentKeep = activeMergedCuts.find((c) => currentTime >= c.s - 0.2 && currentTime <= c.e + 0.2);
      if (currentKeep && currentTime > currentKeep.s + 1.5) {
        seekTo(currentKeep.s);
        return;
      }
      // Otherwise find the previous keep whose start is before currentTime - 0.5s
      const prevKeeps = activeMergedCuts.filter((c) => c.s < currentTime - 0.5);
      if (prevKeeps.length > 0) {
        seekTo(prevKeeps[prevKeeps.length - 1].s);
      } else {
        // Cycle to the last keep
        seekTo(activeMergedCuts[activeMergedCuts.length - 1].s);
      }
    } else {
      seekTo(Math.max(0, currentTime - 5));
    }
  };

  // Jump to Next Keep Segment
  const handleNextKeep = () => {
    if (cutAction === 'include' && activeMergedCuts.length > 0) {
      // Find the next keep whose start is after currentTime + 0.5s
      const nextKeep = activeMergedCuts.find((c) => c.s > currentTime + 0.5);
      if (nextKeep) {
        seekTo(nextKeep.s);
      } else {
        // Loop back to the first keep
        seekTo(activeMergedCuts[0].s);
      }
    } else {
      seekTo(Math.min(numDuration || currentTime + 5, currentTime + 5));
    }
  };

  // Single-Frame Stepping (30fps / ~0.0333s per frame)
  const stepFrame = useCallback((direction) => {
    const FRAME_DURATION = 1 / 30; // ~0.0333s standard NLE frame
    const nextSec = Math.max(0, numDuration ? Math.min(numDuration, currentTime + direction * FRAME_DURATION) : currentTime + direction * FRAME_DURATION);
    seekTo(nextSec);
    setIsScrubberSelected(true);
  }, [currentTime, numDuration, seekTo]);

  // Video Editor Keyboard Navigation (Arrow Keys for frame stepping, Space for play/pause)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't intercept if user is typing into an input field or modal is not focused
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) {
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        if (e.shiftKey) {
          seekTo(Math.min(numDuration || currentTime + 1, currentTime + 1));
        } else {
          stepFrame(1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (e.shiftKey) {
          seekTo(Math.max(0, currentTime - 1));
        } else {
          stepFrame(-1);
        }
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [stepFrame, seekTo, togglePlay, currentTime, numDuration]);

  /* ─────────────────────────────────────────────────────────────
     Playback Restriction & Loop Engine (Keep-to-Keep Auto Jump)
  ───────────────────────────────────────────────────────────── */
  useEffect(() => {
    let interval = null;
    let lastTime = Date.now();

    interval = setInterval(() => {
      // If user is actively dragging the blue scrubber, pause auto-jumping
      if (isScrubbing) return;

      // Allow 350ms buffer after a seekTo call so YouTube player has time to apply the seek
      if (Date.now() - lastSeekTimestampRef.current < 350) return;

      let nowTime = currentTime;

      if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function' && playerReady) {
        try {
          const t = playerRef.current.getCurrentTime();
          if (typeof t === 'number' && !isNaN(t)) {
            nowTime = t;
            setCurrentTime(t);
          }
        } catch {
          // fallback
        }
      } else if (isPlaying) {
        const delta = (Date.now() - lastTime) / 1000;
        nowTime = currentTime + delta;
        if (numDuration && nowTime >= numDuration) {
          nowTime = 0;
          setIsPlaying(false);
        }
        setCurrentTime(nowTime);
      }
      lastTime = Date.now();

      // Enforce Auto-Play Included restriction only if autoPlayIncluded is turned ON
      if (isPlaying && autoPlayIncluded && activeMergedCuts.length > 0) {
        if (cutAction === 'include') {
          // Check if nowTime is currently inside any included keep
          const currentKeep = activeMergedCuts.find((c) => nowTime >= c.s - 0.15 && nowTime < c.e - 0.08);

          if (!currentKeep) {
            // We are outside all keeps! (In an excluded gap or finished a keep)
            // 1. Is there an upcoming keep after nowTime?
            const nextKeep = activeMergedCuts.find((c) => c.s > nowTime - 0.15);
            if (nextKeep) {
              // Jump cleanly to the start of the next keep!
              seekTo(nextKeep.s);
              return;
            } else {
              // Past the end of all keeps -> loop back to the first keep!
              seekTo(activeMergedCuts[0].s);
              return;
            }
          }
        } else if (cutAction === 'remove') {
          // In remove mode: leap past any removed interval
          const activeCut = activeMergedCuts.find((c) => nowTime >= c.s && nowTime < c.e - 0.05);
          if (activeCut) {
            seekTo(Math.min(activeCut.e + 0.05, numDuration || activeCut.e));
          }
        }
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, autoPlayIncluded, activeMergedCuts, cutAction, numDuration, playerReady, currentTime, isScrubbing, seekTo]);

  /* ─────────────────────────────────────────────────────────────
     Interactive Blue Scrubber Drag Engine (With Magnetic Snapping)
  ───────────────────────────────────────────────────────────── */
  const handleScrubberPointerDown = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (!rangeBarRef.current || !numDuration) return;
    const rect = rangeBarRef.current.getBoundingClientRect();
    setIsScrubbing(true);
    setIsScrubberSelected(true);
    let moved = false;

    // Magnetic snap points: 0, current start, current end, all cut boundaries, and video end
    const snapPoints = [0, currentActiveStartSec, currentActiveEndSec];
    for (const c of cuts) {
      const s = parseTimeToSeconds(c.start);
      const ed = parseTimeToSeconds(c.end);
      if (s !== null) snapPoints.push(s);
      if (ed !== null) snapPoints.push(ed);
    }
    if (numDuration) snapPoints.push(numDuration);

    const onPointerMove = (moveEvent) => {
      moved = true;
      const clickX = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
      let sec = (clickX / rect.width) * numDuration;

      // Magnetic snap threshold (0.6s)
      const SNAP_THRESHOLD = Math.max(0.4, numDuration * 0.008);
      let snapped = null;
      for (const sp of snapPoints) {
        if (Math.abs(sec - sp) <= SNAP_THRESHOLD) {
          sec = sp;
          snapped = sp;
          break;
        }
      }
      setSnappedGuideline(snapped !== null ? { time: snapped, pct: (snapped / numDuration) * 100 } : null);
      seekTo(sec);
    };

    const onPointerUp = (upEvent) => {
      setIsScrubbing(false);
      setSnappedGuideline(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (moved) {
        wasDraggingRef.current = true;
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 150);
      }

      // In Include mode with Auto-Play Included ON:
      if (cutAction === 'include' && autoPlayIncluded && activeMergedCuts.length > 0) {
        const clickX = Math.max(0, Math.min(rect.width, upEvent.clientX - rect.left));
        const finalSec = (clickX / rect.width) * numDuration;
        const inside = activeMergedCuts.some((c) => finalSec >= c.s - 0.1 && finalSec <= c.e + 0.1);
        if (!inside) {
          const nextKeep = activeMergedCuts.find((c) => c.s >= finalSec);
          if (nextKeep) {
            seekTo(nextKeep.s);
          } else {
            seekTo(activeMergedCuts[0].s);
          }
        }
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  /* ─────────────────────────────────────────────────────────────
     Interactive Range Slider Drag Engine (With Tactile Attachment)
  ───────────────────────────────────────────────────────────── */
  const handleRangeThumbPointerDown = (e, thumb) => {
    e.preventDefault();
    e.stopPropagation();

    if (!rangeBarRef.current || !numDuration) return;
    const rect = rangeBarRef.current.getBoundingClientRect();

    let moved = false;
    let trackingPlayhead = currentTimeRef.current;

    // Snap points for the handles
    const snapPoints = [0];
    if (currentTimeRef.current > 0 && currentTimeRef.current < numDuration) {
      snapPoints.push(currentTimeRef.current); // Snap to scrubber head!
    }
    for (const c of cuts) {
      const s = parseTimeToSeconds(c.start);
      const ed = parseTimeToSeconds(c.end);
      if (s !== null) snapPoints.push(s);
      if (ed !== null) snapPoints.push(ed);
    }
    if (numDuration) snapPoints.push(numDuration);

    const onPointerMove = (moveEvent) => {
      moved = true;
      const clickX = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left));
      let sec = (clickX / rect.width) * numDuration;

      // Magnetic snap threshold
      const SNAP_THRESHOLD = Math.max(0.4, numDuration * 0.008);
      let snapped = null;
      for (const sp of snapPoints) {
        if (Math.abs(sec - sp) <= SNAP_THRESHOLD) {
          sec = sp;
          snapped = sp;
          break;
        }
      }
      setSnappedGuideline(snapped !== null ? { time: snapped, pct: (snapped / numDuration) * 100 } : null);

      if (thumb === 'start') {
        const clampedStart = Math.min(sec, currentActiveEndSec - 1);
        const timeStr = formatSecondsToTime(clampedStart);
        setNewStart(timeStr);

        // Tactile attachment: ONLY if start handle is dragged to or past scrubber head,
        // push the scrubber head forward along with it! Otherwise scrubber stays at its current time!
        if (clampedStart > trackingPlayhead) {
          trackingPlayhead = clampedStart;
          seekTo(clampedStart);
        }

        // If editing a selected cut, update it live
        if (selectedCutIndex !== null) {
          setCuts((prev) =>
            prev.map((c, i) => (i === selectedCutIndex ? { ...c, start: timeStr } : c))
          );
        }
      } else {
        const clampedEnd = Math.max(sec, currentActiveStartSec + 1);
        const timeStr = formatSecondsToTime(clampedEnd);
        setNewEnd(timeStr);

        // Tactile attachment: ONLY if end handle is dragged to or past scrubber head,
        // push the scrubber head backward along with it! Otherwise scrubber stays at its current time!
        if (clampedEnd < trackingPlayhead) {
          trackingPlayhead = clampedEnd;
          seekTo(clampedEnd);
        }

        // If editing a selected cut, update it live
        if (selectedCutIndex !== null) {
          setCuts((prev) =>
            prev.map((c, i) => (i === selectedCutIndex ? { ...c, end: timeStr } : c))
          );
        }
      }
    };

    const onPointerUp = () => {
      setSnappedGuideline(null);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      if (moved) {
        wasDraggingRef.current = true;
        setTimeout(() => {
          wasDraggingRef.current = false;
        }, 150);
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  /* ─────────────────────────────────────────────────────────────
     Multi-Cut Management (Record of All Cuts on Timeline)
  ───────────────────────────────────────────────────────────── */
  const handleSelectCut = (index) => {
    setSelectedCutIndex(index);
    const target = cuts[index];
    if (target) {
      setNewStart(target.start);
      setNewEnd(target.end);
      const s = parseTimeToSeconds(target.start);
      if (s !== null) seekTo(s);
    }
  };

  const handleAddNewCut = () => {
    setSelectedCutIndex(null);
    // Find next sensible time slot or start from current end
    const lastEndSec = parseTimeToSeconds(newEnd) || 0;
    const nextStartSec = Math.min(lastEndSec, (numDuration || 60) - 30);
    const nextEndSec = Math.min(nextStartSec + 30, numDuration || 90);
    setNewStart(formatSecondsToTime(nextStartSec));
    setNewEnd(formatSecondsToTime(nextEndSec));
  };

  const handleSaveOrAddCut = () => {
    if (validationError) return;
    if (!newStart.trim() && !newEnd.trim()) return;

    let finalStart = newStart.trim();
    let finalEnd = newEnd.trim();

    if (numDuration !== null && parsedEnd !== null && parsedEnd > numDuration) {
      finalEnd = durationStr;
    }

    if (selectedCutIndex !== null) {
      // Update existing cut
      setCuts((prev) =>
        prev.map((c, i) => (i === selectedCutIndex ? { start: finalStart, end: finalEnd } : c))
      );
      setSelectedCutIndex(null);
    } else {
      // Add new cut
      const nextCuts = [...cuts, { start: finalStart, end: finalEnd }];
      const cleanMerged = normalizeAndMergeCuts(nextCuts);
      setCuts(cleanMerged.map((m) => ({ start: m.start, end: m.end })));
    }
  };

  const handleRemoveCut = (index) => {
    setCuts((prev) => prev.filter((_, i) => i !== index));
    if (selectedCutIndex === index) {
      setSelectedCutIndex(null);
    }
  };

  /* ─────────────────────────────────────────────────────────────
     Crop Geometry Engine
  ───────────────────────────────────────────────────────────── */
  const updateCropField = (field, val) => {
    const parsed = parseInt(val, 10);
    const num = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setCrop((prev) => {
      const next = { ...prev, [field]: num };
      const refW = prev.ref_w || 1920;
      const refH = prev.ref_h || 1080;
      if (field === 'x') next.x = Math.min(next.x, refW - prev.w);
      if (field === 'y') next.y = Math.min(next.y, refH - prev.h);
      if (field === 'w') next.w = Math.min(next.w, refW - prev.x);
      if (field === 'h') next.h = Math.min(next.h, refH - prev.y);
      return next;
    });
  };

  const applyCropPreset = (preset) => {
    setAspectRatioPreset(preset);
    const refW = crop.ref_w || 1920;
    const refH = crop.ref_h || 1080;

    let w = refW;
    let h = refH;
    let x = 0;
    let y = 0;

    if (preset === '1:1') {
      h = refH;
      w = refH;
      x = Math.round((refW - w) / 2);
      y = 0;
    } else if (preset === '4:3') {
      h = refH;
      w = Math.round(refH * (4 / 3));
      x = Math.round((refW - w) / 2);
      y = 0;
    } else if (preset === '16:9') {
      w = refW;
      h = refH;
      x = 0;
      y = 0;
    } else if (preset === '9:16') {
      h = refH;
      w = Math.round(refH * (9 / 16));
      x = Math.round((refW - w) / 2);
      y = 0;
    } else if (preset === '2.40:1') {
      w = refW;
      h = Math.round(refW / 2.4);
      x = 0;
      y = Math.round((refH - h) / 2);
    } else {
      return;
    }

    setCrop({ x, y, w, h, ref_w: refW, ref_h: refH });
  };

  const centerCropBox = () => {
    const refW = crop.ref_w || 1920;
    const refH = crop.ref_h || 1080;
    setCrop((prev) => ({
      ...prev,
      x: Math.max(0, Math.round((refW - prev.w) / 2)),
      y: Math.max(0, Math.round((refH - prev.h) / 2))
    }));
  };

  const resetCropToFull = () => {
    setAspectRatioPreset('16:9');
    setCrop({ x: 0, y: 0, w: 1920, h: 1080, ref_w: 1920, ref_h: 1080 });
  };

  const handleCropPointerDown = (e, handleType) => {
    e.preventDefault();
    e.stopPropagation();

    if (!cropCanvasRef.current) return;
    const rect = cropCanvasRef.current.getBoundingClientRect();

    dragInfoRef.current = {
      handleType,
      startX: e.clientX,
      startY: e.clientY,
      initialCrop: { ...crop },
      rect,
      scaleX: (crop.ref_w || 1920) / rect.width,
      scaleY: (crop.ref_h || 1080) / rect.height
    };

    const handlePointerMove = (moveEvent) => {
      if (!dragInfoRef.current) return;
      const { handleType, startX, startY, initialCrop, scaleX, scaleY } = dragInfoRef.current;
      const dx = (moveEvent.clientX - startX) * scaleX;
      const dy = (moveEvent.clientY - startY) * scaleY;
      const refW = initialCrop.ref_w || 1920;
      const refH = initialCrop.ref_h || 1080;

      let newCrop = { ...initialCrop };

      if (handleType === 'move') {
        const nextX = Math.round(initialCrop.x + dx);
        const nextY = Math.round(initialCrop.y + dy);
        newCrop.x = Math.max(0, Math.min(refW - initialCrop.w, nextX));
        newCrop.y = Math.max(0, Math.min(refH - initialCrop.h, nextY));
      } else {
        let x1 = initialCrop.x;
        let y1 = initialCrop.y;
        let x2 = initialCrop.x + initialCrop.w;
        let y2 = initialCrop.y + initialCrop.h;

        if (handleType.includes('w')) x1 = Math.max(0, Math.min(x2 - 64, Math.round(initialCrop.x + dx)));
        if (handleType.includes('e')) x2 = Math.min(refW, Math.max(x1 + 64, Math.round(initialCrop.x + initialCrop.w + dx)));
        if (handleType.includes('n')) y1 = Math.max(0, Math.min(y2 - 64, Math.round(initialCrop.y + dy)));
        if (handleType.includes('s')) y2 = Math.min(refH, Math.max(y1 + 64, Math.round(initialCrop.y + initialCrop.h + dy)));

        if (aspectRatioPreset !== 'free') {
          let ar = 16 / 9;
          if (aspectRatioPreset === '1:1') ar = 1;
          if (aspectRatioPreset === '4:3') ar = 4 / 3;
          if (aspectRatioPreset === '9:16') ar = 9 / 16;
          if (aspectRatioPreset === '2.40:1') ar = 2.4;

          let w = x2 - x1;
          let h = y2 - y1;

          if (handleType === 'e' || handleType === 'w') {
            h = Math.round(w / ar);
            y2 = Math.min(refH, y1 + h);
          } else if (handleType === 'n' || handleType === 's') {
            w = Math.round(h * ar);
            x2 = Math.min(refW, x1 + w);
          } else {
            if (Math.abs(dx) / Math.max(Math.abs(dy), 1) > ar) {
              w = Math.round(h * ar);
              x2 = Math.min(refW, x1 + w);
            } else {
              h = Math.round(w / ar);
              y2 = Math.min(refH, y1 + h);
            }
          }
        }

        newCrop.x = x1;
        newCrop.y = y1;
        newCrop.w = Math.max(64, x2 - x1);
        newCrop.h = Math.max(64, y2 - y1);
      }

      setCrop(newCrop);
    };

    const handlePointerUp = () => {
      dragInfoRef.current = null;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  };

  /* ─────────────────────────────────────────────────────────────
     Modal Save & Reset Handlers
  ───────────────────────────────────────────────────────────── */
  const handleApply = () => {
    // 1. Cut
    let allCuts = [...cuts];
    if (allCuts.length === 0 && (newStart.trim() || newEnd.trim())) {
      allCuts.push({ start: newStart.trim(), end: newEnd.trim() });
    }

    const cleanMerged = normalizeAndMergeCuts(allCuts);
    if (cleanMerged.length === 0) {
      onChangeCut(null);
    } else {
      onChangeCut({
        start: cleanMerged[0].start,
        end: cleanMerged[cleanMerged.length - 1].end,
        segments: cleanMerged.map((m) => ({ start: m.start, end: m.end })),
        action: cutAction,
        video_duration: numDuration,
        duration: numDuration
      });
    }

    // 2. Crop
    if (crop && crop.w > 0 && crop.h > 0 && (crop.w < (crop.ref_w || 1920) || crop.h < (crop.ref_h || 1080) || crop.x > 0 || crop.y > 0)) {
      onChangeCrop({
        x: crop.x,
        y: crop.y,
        w: crop.w,
        h: crop.h,
        ref_w: crop.ref_w || 1920,
        ref_h: crop.ref_h || 1080
      });
    } else {
      onChangeCrop(null);
    }

    onClose();
  };

  const handleResetCurrentTab = () => {
    if (tab === 'cut') {
      setCuts([]);
      setSelectedCutIndex(null);
      setNewStart('00:00');
      setNewEnd(durationStr || '01:00');
      setCutAction('include');
      onChangeCut(null);
    } else {
      resetCropToFull();
      onChangeCrop(null);
    }
  };

  // Crop Box coordinates percentage mapping
  const cropRefW = crop.ref_w || 1920;
  const cropRefH = crop.ref_h || 1080;
  const boxLeftPct = Math.max(0, Math.min(100, ((crop.x || 0) / cropRefW) * 100));
  const boxTopPct = Math.max(0, Math.min(100, ((crop.y || 0) / cropRefH) * 100));
  const boxWidthPct = Math.max(0, Math.min(100 - boxLeftPct, ((crop.w || cropRefW) / cropRefW) * 100));
  const boxHeightPct = Math.max(0, Math.min(100 - boxTopPct, ((crop.h || cropRefH) / cropRefH) * 100));

  // Slider percentage calculations for active editing thumbs
  const sliderStartPct = numDuration ? Math.max(0, Math.min(100, (currentActiveStartSec / numDuration) * 100)) : 0;
  const sliderEndPct = numDuration ? Math.max(0, Math.min(100, (currentActiveEndSec / numDuration) * 100)) : 100;
  const playheadPct = numDuration ? Math.max(0, Math.min(100, (currentTime / numDuration) * 100)) : 0;

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      {/* Tab Switcher: Cut vs Crop */}
      <div className="flex p-1 bg-zinc-950/80 rounded-xl border border-zinc-800">
        <button
          type="button"
          onClick={() => setTab('cut')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            tab === 'cut'
              ? 'bg-pink-500 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Scissors size={14} /> Time-Slice (Multi-Cut)
          {cuts.length > 0 && (
            <span className="w-4 h-4 rounded-full bg-white/20 text-[10px] flex items-center justify-center font-bold">
              {cuts.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setTab('crop')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
            tab === 'crop'
              ? 'bg-pink-500 text-white shadow-md'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Crop size={14} /> Crop Geometry (Visual)
          {crop.w > 0 && crop.h > 0 && (crop.w < 1920 || crop.h < 1080) && (
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          )}
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
         16:9 Clean Video Player Card (Chromeless, Native-Feeling Canvas)
      ───────────────────────────────────────────────────────────── */}
      <div className="space-y-2">
        <div
          ref={cropCanvasRef}
          className="relative w-full aspect-video rounded-2xl overflow-hidden bg-black border border-zinc-800 select-none shadow-2xl group"
        >
          {/* Layer 1: Chromeless Video Player Container */}
          <div
            className={`absolute inset-0 w-full h-full overflow-hidden transition-all duration-300 ${
              tab === 'cut' && cutAction === 'include' && autoPlayIncluded && !isInsideIncluded
                ? 'filter grayscale contrast-125 brightness-[0.35]'
                : ''
            }`}
          >
            {youtubeId && !playerError ? (
              // Chromeless scaling: hides YouTube's top title bar and bottom "Watch on YouTube" watermark
              <div className="relative w-full h-full overflow-hidden pointer-events-none">
                <div
                  id={iframeContainerId}
                  className="absolute -top-[12%] -bottom-[12%] -left-[4%] -right-[4%] w-[108%] h-[124%]"
                />
              </div>
            ) : thumbnail ? (
              <img
                src={thumbnail}
                alt="Video Preview"
                className="w-full h-full object-contain pointer-events-none"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-zinc-600 gap-2">
                <Film size={36} />
                <span className="text-xs font-mono">No Video Preview Available</span>
              </div>
            )}
          </div>

          {/* Layer 2: Custom Native Play Button & Poster Overlay When Paused (Eliminates YouTube Red Button) */}
          {!isPlaying && thumbnail && (
            <div
              onClick={togglePlay}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/40 backdrop-blur-[1px] cursor-pointer group/play transition-colors hover:bg-black/30"
            >
              <div className="w-16 h-16 rounded-full bg-pink-500/90 hover:bg-pink-500 text-white flex items-center justify-center shadow-[0_0_35px_rgba(236,72,153,0.55)] group-hover/play:scale-110 active:scale-95 transition-all">
                <Play size={28} className="ml-1 fill-white" />
              </div>
              <span className="mt-3 text-xs font-semibold text-white/95 drop-shadow select-none">
                Play Preview
              </span>
            </div>
          )}

          {/* Layer 3: Greyed-Out Banner When Outside Selection (Include Mode) */}
          {tab === 'cut' && cutAction === 'include' && autoPlayIncluded && !isInsideIncluded && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-15 animate-fade-in">
              <div className="px-3.5 py-1.5 rounded-full bg-black/85 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-2 shadow-2xl">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                <span>Outside Selection — Video Greyed Out</span>
              </div>
              <span className="text-[10px] text-zinc-400 font-mono mt-1 drop-shadow">
                Press Play to jump directly to selected start ({formatSecondsToTime(currentActiveStartSec)})
              </span>
            </div>
          )}

          {/* Layer 4: Crop Framing Overlay (Active in Crop Tab) */}
          {tab === 'crop' && (
            <div className="absolute inset-0 pointer-events-auto z-20">
              <div
                style={{
                  left: `${boxLeftPct}%`,
                  top: `${boxTopPct}%`,
                  width: `${boxWidthPct}%`,
                  height: `${boxHeightPct}%`,
                  boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.65)'
                }}
                className="absolute border-2 border-white/90 cursor-move transition-shadow"
                onPointerDown={(e) => handleCropPointerDown(e, 'move')}
              >
                {/* Rule-of-Thirds Grid */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-0 bottom-0 left-1/3 w-px bg-white/30" />
                  <div className="absolute top-0 bottom-0 left-2/3 w-px bg-white/30" />
                  <div className="absolute left-0 right-0 top-1/3 h-px bg-white/30" />
                  <div className="absolute left-0 right-0 top-2/3 h-px bg-white/30" />
                </div>

                {/* Live Dimensions Badge */}
                <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-black/80 backdrop-blur-xs text-[10px] font-mono text-white pointer-events-none select-none border border-white/10 shadow-sm">
                  {crop.w} × {crop.h}
                </div>

                {/* 4 Corner Handles */}
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'nw')}
                  className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-black/40 rounded-xs shadow-md cursor-nwse-resize z-20 hover:scale-125 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'ne')}
                  className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-black/40 rounded-xs shadow-md cursor-nesw-resize z-20 hover:scale-125 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'sw')}
                  className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 bg-white border border-black/40 rounded-xs shadow-md cursor-nesw-resize z-20 hover:scale-125 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'se')}
                  className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 bg-white border border-black/40 rounded-xs shadow-md cursor-nwse-resize z-20 hover:scale-125 transition-transform"
                />

                {/* 4 Midpoint Handles */}
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'n')}
                  className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-black/40 rounded-full shadow-md cursor-ns-resize z-20 hover:scale-110 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 's')}
                  className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-6 h-2 bg-white border border-black/40 rounded-full shadow-md cursor-ns-resize z-20 hover:scale-110 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'w')}
                  className="absolute top-1/2 -translate-y-1/2 -left-1.5 w-2 h-6 bg-white border border-black/40 rounded-full shadow-md cursor-ew-resize z-20 hover:scale-110 transition-transform"
                />
                <div
                  onPointerDown={(e) => handleCropPointerDown(e, 'e')}
                  className="absolute top-1/2 -translate-y-1/2 -right-1.5 w-2 h-6 bg-white border border-black/40 rounded-full shadow-md cursor-ew-resize z-20 hover:scale-110 transition-transform"
                />
              </div>
            </div>
          )}

          {/* Time Overlay in Top Corner */}
          <div className="absolute top-3 left-3 flex items-center gap-2 pointer-events-none z-20">
            <span className="px-2.5 py-1 rounded-lg bg-black/75 backdrop-blur-md border border-white/10 font-mono text-xs font-bold text-white shadow-lg">
              {formatSecondsToTime(currentTime)} / {durationStr || '--:--'}
            </span>
          </div>
        </div>

        {/* Custom Media Control Bar Directly Under Video */}
        <div className="flex items-center justify-between gap-3 p-2 bg-zinc-950/70 rounded-xl border border-zinc-800">
          <div className="flex items-center gap-1 sm:gap-2">
            <button
              type="button"
              onClick={handlePrevKeep}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              title={cutAction === 'include' && activeMergedCuts.length > 1 ? "Jump to previous keep segment" : "Rewind 5s"}
            >
              <SkipBack size={16} />
            </button>
            <button
              type="button"
              onClick={() => stepFrame(-1)}
              className="p-1.5 text-zinc-400 hover:text-cyan-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer font-mono text-xs flex items-center gap-0.5"
              title="Step -1 frame (Left Arrow ←)"
            >
              <ChevronLeft size={16} />
              <span className="text-[10px] hidden sm:inline font-bold">-1F</span>
            </button>
            <button
              type="button"
              onClick={togglePlay}
              className="p-2.5 bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause size={16} /> : <Play size={16} className="ml-0.5 fill-white" />}
            </button>
            <button
              type="button"
              onClick={() => stepFrame(1)}
              className="p-1.5 text-zinc-400 hover:text-cyan-300 rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer font-mono text-xs flex items-center gap-0.5"
              title="Step +1 frame (Right Arrow →)"
            >
              <span className="text-[10px] hidden sm:inline font-bold">+1F</span>
              <ChevronRight size={16} />
            </button>
            <button
              type="button"
              onClick={handleNextKeep}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              title={cutAction === 'include' && activeMergedCuts.length > 1 ? "Jump to next keep segment" : "Fast Forward 5s"}
            >
              <SkipForward size={16} />
            </button>
            <button
              type="button"
              onClick={toggleMute}
              className="p-2 text-zinc-400 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX size={16} className="text-red-400" /> : <Volume2 size={16} />}
            </button>
          </div>

          {/* Interactive Toggle for Auto-Play Included Only */}
          {tab === 'cut' && (
            <button
              type="button"
              onClick={() => setAutoPlayIncluded(!autoPlayIncluded)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                autoPlayIncluded
                  ? 'bg-pink-500/20 border-pink-500/50 text-pink-300 shadow-sm'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-500 hover:text-zinc-300'
              }`}
              title={autoPlayIncluded ? 'Only plays selected/included ranges and loops' : 'Plays through the entire video freely'}
            >
              <Zap size={13} className={autoPlayIncluded ? 'text-pink-400 fill-pink-400 animate-pulse' : 'text-zinc-600'} />
              <span>Auto-Play Included: <strong className="uppercase">{autoPlayIncluded ? 'ON' : 'OFF'}</strong></span>
            </button>
          )}

          <div className="text-right flex items-center gap-1.5">
            <span className="font-mono text-xs font-bold text-cyan-300 bg-zinc-900 px-2 py-1 rounded-lg border border-zinc-800 shadow-inner">
              {formatTimecodeWithFrames(currentTime)}
            </span>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
         TAB 1: TIME-SLICE (CUT) WITH MULTI-CUT TIMELINE TRACK
      ───────────────────────────────────────────────────────────── */}
      {tab === 'cut' && (
        <div className="space-y-4">
          {/* Mode Switcher: Include vs Remove */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300">Cut Mode</span>
              <span className="text-[11px] text-zinc-400">
                {cutAction === 'include'
                  ? 'Keep selected region (rest is omitted)'
                  : 'Remove selected region (rest is kept and merged)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800">
              <button
                type="button"
                onClick={() => setCutAction('include')}
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  cutAction === 'include'
                    ? 'bg-pink-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <Check size={14} /> Include (Keep Selected)
              </button>
              <button
                type="button"
                onClick={() => setCutAction('remove')}
                className={`flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  cutAction === 'remove'
                    ? 'bg-rose-500 text-white shadow-md'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
                }`}
              >
                <Scissors size={14} /> Remove (Cut Out Selected)
              </button>
            </div>
          </div>

          {/* Interactive Range Slider Track with Full Cut History Record */}
          {numDuration && numDuration > 0 && (
            <div className="p-3.5 bg-zinc-950/70 border border-zinc-800/80 rounded-xl space-y-2">
              {/* Timeline Header */}
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Film size={13} className="text-pink-400" /> Interactive Timeline Track
                </span>
                <span className="font-mono text-[11px] text-zinc-400 flex items-center gap-2">
                  <span className="bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 text-cyan-300 font-bold">
                    {formatTimecodeWithFrames(currentTime)}
                  </span>
                  <span>
                    Resulting: <span className="font-bold text-white">{resultingDuration !== null ? formatSecondsToTime(resultingDuration) : '--:--'}</span>
                    {numDuration > 0 && resultingDuration !== null && (
                      <span className="ml-1 text-pink-400">
                        ({Math.round((resultingDuration / numDuration) * 100)}%)
                      </span>
                    )}
                  </span>
                </span>
              </div>

              {/* Unified Range Slider Track (Single cohesive container, no awkward separate ruler) */}
              <div
                ref={rangeBarRef}
                onClick={(e) => {
                  if (wasDraggingRef.current) {
                    wasDraggingRef.current = false;
                    return;
                  }
                  if (!rangeBarRef.current || !numDuration) return;
                  const rect = rangeBarRef.current.getBoundingClientRect();
                  const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                  let targetSec = clickPct * numDuration;

                  // If Include mode & autoPlayIncluded ON, snap to nearest valid keep if clicked in dead zone
                  if (cutAction === 'include' && autoPlayIncluded && activeMergedCuts.length > 0) {
                    const inside = activeMergedCuts.some((c) => targetSec >= c.s - 0.1 && targetSec <= c.e + 0.1);
                    if (!inside) {
                      const nextKeep = activeMergedCuts.find((c) => c.s >= targetSec);
                      if (nextKeep) {
                        targetSec = nextKeep.s;
                      } else {
                        targetSec = activeMergedCuts[0].s;
                      }
                    }
                  }
                  seekTo(targetSec);
                }}
                className="relative w-full h-10 rounded-xl overflow-visible bg-zinc-950 border border-zinc-800 select-none cursor-pointer flex items-center shadow-inner"
              >
                {/* Embedded Subtle Calibration Ticks */}
                <div className="absolute top-0 left-0 right-0 h-1.5 flex justify-between pointer-events-none px-1 opacity-30 z-5">
                  <div className="w-px h-1.5 bg-white" />
                  <div className="w-px h-1 bg-white" />
                  <div className="w-px h-1.5 bg-white" />
                  <div className="w-px h-1 bg-white" />
                  <div className="w-px h-1.5 bg-white" />
                </div>

                {/* Background Tone */}
                {cutAction === 'remove' ? (
                  <div className="absolute inset-0 bg-emerald-500/10 rounded-xl pointer-events-none" />
                ) : (
                  <div className="absolute inset-0 bg-zinc-950/90 rounded-xl pointer-events-none" />
                )}

                {/* Magnetic Snap Guideline */}
                {snappedGuideline && (
                  <div
                    style={{ left: `${snappedGuideline.pct}%` }}
                    className="absolute top-0 bottom-0 w-px border-l-2 border-dashed border-amber-400 z-35 pointer-events-none shadow-[0_0_8px_gold] flex flex-col items-center"
                  >
                    <div className="px-1.5 py-0.5 rounded bg-amber-500 text-zinc-950 text-[9px] font-mono font-bold shadow-md -translate-y-4 whitespace-nowrap">
                      🧲 {formatSecondsToTime(snappedGuideline.time)}
                    </div>
                  </div>
                )}

                {/* 1. Render ALL Previously Configured Cuts (Persistent Visual Record) */}
                {cuts.map((c, idx) => {
                  const s = parseTimeToSeconds(c.start) ?? 0;
                  const e = parseTimeToSeconds(c.end) ?? numDuration;
                  const left = Math.max(0, Math.min(100, (s / numDuration) * 100));
                  const width = Math.max(0.5, Math.min(100 - left, ((e - s) / numDuration) * 100));
                  const isSelected = selectedCutIndex === idx;

                  return (
                    <div
                      key={idx}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectCut(idx);
                        if (rangeBarRef.current && numDuration) {
                          const rect = rangeBarRef.current.getBoundingClientRect();
                          const clickPct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                          seekTo(clickPct * numDuration);
                        }
                      }}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      className={`absolute top-0.5 bottom-0.5 flex items-center justify-center text-[10px] font-mono font-bold transition-all border-x rounded-md cursor-pointer ${
                        cutAction === 'include'
                          ? isSelected
                            ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white border-white ring-2 ring-pink-400/60 z-10 shadow-lg'
                            : 'bg-pink-600/70 hover:bg-pink-500 text-white border-pink-400/50 z-5'
                          : isSelected
                            ? 'bg-rose-500 text-white border-white ring-2 ring-rose-400/60 z-10 shadow-lg'
                            : 'bg-rose-500/50 hover:bg-rose-500/70 text-rose-200 border-rose-400/50 z-5'
                      }`}
                      title={`Click to select & edit Cut #${idx + 1}: ${c.start} - ${c.end}`}
                    >
                      {width > 6 && (
                        <span className="truncate px-1.5 drop-shadow flex items-center gap-1">
                          <Scissors size={10} />
                          #{idx + 1} {cutAction === 'include' ? 'KEEP' : 'CUT'}
                        </span>
                      )}
                    </div>
                  );
                })}

                {/* 2. Active Editing Range (Rendered as draggable selection) */}
                <div
                  style={{ left: `${sliderStartPct}%`, width: `${Math.max(0.5, sliderEndPct - sliderStartPct)}%` }}
                  className={`absolute top-0.5 bottom-0.5 flex items-center justify-center text-[10px] font-mono font-bold pointer-events-none transition-shadow rounded-md ${
                    cutAction === 'include'
                      ? 'border-y-2 border-pink-400 bg-pink-500/25 shadow-[0_0_12px_rgba(236,72,153,0.3)] z-15'
                      : 'border-y-2 border-rose-500 bg-rose-500/25 shadow-[0_0_12px_rgba(244,63,94,0.3)] z-15'
                  }`}
                />

                {/* Left Drag Handle (Start Thumb) */}
                <div
                  style={{ left: `${sliderStartPct}%` }}
                  onPointerDown={(e) => handleRangeThumbPointerDown(e, 'start')}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-9 bg-white border-2 border-pink-500 rounded-md shadow-xl cursor-ew-resize z-30 hover:scale-110 active:scale-120 transition-transform flex items-center justify-center"
                  title="Drag to adjust start time (tactilely attached to scrubber)"
                >
                  <div className="w-0.5 h-4 bg-pink-500 rounded-full pointer-events-none" />
                </div>

                {/* Right Drag Handle (End Thumb) */}
                <div
                  style={{ left: `${sliderEndPct}%` }}
                  onPointerDown={(e) => handleRangeThumbPointerDown(e, 'end')}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-9 bg-white border-2 border-pink-500 rounded-md shadow-xl cursor-ew-resize z-30 hover:scale-110 active:scale-120 transition-transform flex items-center justify-center"
                  title="Drag to adjust end time (tactilely attached to scrubber)"
                >
                  <div className="w-0.5 h-4 bg-pink-500 rounded-full pointer-events-none" />
                </div>

                {/* Live Playhead Needle & Scrubber Head (Precise, Sleek, No Side-Click Interception) */}
                <div
                  style={{ left: `${playheadPct}%` }}
                  className="absolute top-0 bottom-0 z-40 -translate-x-1/2 flex flex-col items-center pointer-events-none select-none"
                >
                  {/* Floating Live Timestamp Tooltip when scrubbing */}
                  {isScrubbing && (
                    <div className="absolute -top-7 px-2 py-0.5 rounded-md bg-cyan-950/95 border border-cyan-400 text-[10px] font-mono font-bold text-cyan-200 shadow-xl whitespace-nowrap pointer-events-none z-50">
                      {formatTimecodeWithFrames(currentTime)}
                    </div>
                  )}

                  {/* Sleek Cyan Pin Head (Grab Target - ONLY the head receives pointer events) */}
                  <div
                    onPointerDown={handleScrubberPointerDown}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsScrubberSelected(true);
                    }}
                    className="w-2.5 h-2.5 bg-cyan-300 rounded-full shadow-[0_0_8px_cyan] pointer-events-auto cursor-ew-resize hover:scale-125 active:scale-125 transition-transform -translate-y-1"
                    title="Drag playhead (or use ← / → to step 1 frame)"
                  />

                  {/* Vertical Glowing Needle Line */}
                  <div className="w-0.5 h-full bg-cyan-300 shadow-[0_0_8px_cyan] pointer-events-none" />
                </div>
              </div>

              {/* Time Legend & Clean Keyboard Shortcuts */}
              <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 px-0.5">
                <span>00:00:00</span>
                <span>{formatSecondsToTime(numDuration * 0.25)}</span>
                <span>{formatSecondsToTime(numDuration * 0.5)}</span>
                <span>{formatSecondsToTime(numDuration * 0.75)}</span>
                <span>{durationStr}</span>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60 text-[10px] text-zinc-400 font-mono">
                <span className="flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">←</kbd>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">→</kbd>
                  <span>Step 1 frame (Shift for 1s)</span>
                  <span className="text-zinc-600 mx-1">·</span>
                  <kbd className="px-1 py-0.5 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-bold">Space</kbd>
                  <span>Play/Pause</span>
                </span>
                <span className="text-cyan-400 font-bold">
                  {formatSecondsToTime(currentTime)}
                </span>
              </div>
            </div>
          )}

          {/* Start and End Timestamp Inputs */}
          <div className="p-3 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                {selectedCutIndex !== null ? (
                  <>
                    <Edit3 size={13} className="text-pink-400" />
                    Editing Cut #{selectedCutIndex + 1}
                  </>
                ) : cutAction === 'include' ? (
                  <>
                    <Check size={13} className="text-pink-400" />
                    Add Segment to Keep
                  </>
                ) : (
                  <>
                    <Scissors size={13} className="text-rose-400" />
                    Add Segment to Remove
                  </>
                )}
              </span>
              {selectedCutIndex !== null && (
                <button
                  type="button"
                  onClick={handleAddNewCut}
                  className="text-[11px] text-pink-400 hover:text-pink-300 font-semibold cursor-pointer"
                >
                  + Switch to New Cut
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-zinc-400">Start Time (From)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const t = formatSecondsToTime(currentTime);
                      setNewStart(t);
                      seekTo(currentTime);
                      if (selectedCutIndex !== null) {
                        setCuts((prev) =>
                          prev.map((c, i) => (i === selectedCutIndex ? { ...c, start: t } : c))
                        );
                      }
                    }}
                    className="text-[10px] text-pink-400 hover:text-pink-300 flex items-center gap-1 cursor-pointer font-medium"
                    title="Set start to current playback time"
                  >
                    <Clock size={10} /> Use Current
                  </button>
                </div>
                <input
                  type="text"
                  value={newStart}
                  onChange={(e) => {
                    setNewStart(e.target.value);
                    if (selectedCutIndex !== null) {
                      setCuts((prev) =>
                        prev.map((c, i) => (i === selectedCutIndex ? { ...c, start: e.target.value } : c))
                      );
                    }
                  }}
                  onBlur={() => {
                    const s = parseTimeToSeconds(newStart);
                    if (s !== null) seekTo(s);
                  }}
                  placeholder="00:00:00"
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-pink-500/50"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-medium text-zinc-400">End Time (To)</label>
                  <button
                    type="button"
                    onClick={() => {
                      const t = formatSecondsToTime(currentTime);
                      setNewEnd(t);
                      seekTo(Math.max(currentActiveStartSec, currentTime - 1.5));
                      if (selectedCutIndex !== null) {
                        setCuts((prev) =>
                          prev.map((c, i) => (i === selectedCutIndex ? { ...c, end: t } : c))
                        );
                      }
                    }}
                    className="text-[10px] text-pink-400 hover:text-pink-300 flex items-center gap-1 cursor-pointer font-medium"
                    title="Set end to current playback time"
                  >
                    <Clock size={10} /> Use Current
                  </button>
                </div>
                <input
                  type="text"
                  value={newEnd}
                  onChange={(e) => {
                    setNewEnd(e.target.value);
                    if (selectedCutIndex !== null) {
                      setCuts((prev) =>
                        prev.map((c, i) => (i === selectedCutIndex ? { ...c, end: e.target.value } : c))
                      );
                    }
                  }}
                  onBlur={() => {
                    const e = parseTimeToSeconds(newEnd);
                    if (e !== null) seekTo(Math.max(currentActiveStartSec, e - 1.5));
                  }}
                  placeholder={durationStr || 'Finish'}
                  className="w-full bg-zinc-900 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-pink-500/50"
                />
              </div>
            </div>

            {/* Validation Feedback */}
            {validationError && (
              <div className="p-2.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0 text-red-400" />
                <span>{validationError}</span>
              </div>
            )}
            {validationWarning && !validationError && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-2">
                <Info size={14} className="shrink-0 text-amber-400" />
                <span>{validationWarning}</span>
              </div>
            )}

            <div className="flex items-center justify-between pt-1 border-t border-zinc-800/60">
              <span className="text-[11px] text-zinc-500">
                {selectedCutIndex !== null
                  ? 'Adjust sliders to edit this cut, then tap Update.'
                  : 'Tap + Add to Cut List to save this cut to the timeline.'}
              </span>
              <button
                type="button"
                onClick={handleSaveOrAddCut}
                disabled={Boolean(validationError)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/40 text-xs font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {selectedCutIndex !== null ? (
                  <>
                    <Check size={13} /> Update Cut #{selectedCutIndex + 1}
                  </>
                ) : (
                  <>
                    <Plus size={13} /> Add to Cut List
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Configured Multi-Cuts List */}
          {cuts.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-400">
                  Configured Segments ({cuts.length})
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setCuts([]);
                    setSelectedCutIndex(null);
                  }}
                  className="text-[11px] text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                {cuts.map((c, idx) => {
                  const isSelected = selectedCutIndex === idx;
                  return (
                    <div
                      key={idx}
                      onClick={() => {
                        handleSelectCut(idx);
                        const s = parseTimeToSeconds(c.start);
                        if (s !== null) seekTo(s);
                      }}
                      className={`flex items-center gap-2.5 p-2 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-pink-500/15 border-pink-500/50 shadow-sm'
                          : 'bg-zinc-950/70 border-zinc-800 hover:border-zinc-700/80'
                      }`}
                    >
                      <div
                        className={`flex items-center justify-center px-2 py-1 rounded-lg text-[11px] font-bold font-mono shrink-0 border ${
                          cutAction === 'include'
                            ? 'bg-pink-500/20 border-pink-500/40 text-pink-400'
                            : 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                        }`}
                      >
                        #{idx + 1} {cutAction === 'include' ? 'Keep' : 'Remove'}
                      </div>

                      <div className="flex-1 font-mono text-xs text-zinc-200">
                        {c.start} → {c.end}
                      </div>

                      {/* Quick Jump / Play from this Keep */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const s = parseTimeToSeconds(c.start);
                          if (s !== null) seekTo(s);
                          handleSelectCut(idx);
                        }}
                        className="p-1.5 text-zinc-400 hover:text-cyan-300 hover:bg-cyan-500/10 rounded-lg transition-colors cursor-pointer"
                        title={`Jump blue scrubber to Cut #${idx + 1}`}
                      >
                        <Play size={12} className="fill-current" />
                      </button>

                      {isSelected && (
                        <span className="text-[10px] px-2 py-0.5 rounded bg-pink-500/20 text-pink-300 font-semibold border border-pink-500/30">
                          Editing
                        </span>
                      )}

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveCut(idx);
                        }}
                        className="p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0 cursor-pointer"
                        title="Remove this cut"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         TAB 2: CROP GEOMETRY
      ───────────────────────────────────────────────────────────── */}
      {tab === 'crop' && (
        <div className="space-y-3.5">
          <p className="text-xs text-zinc-400">
            Drag the bounding box or corner/edge handles to crop. Generates resolution-independent FFmpeg filter graphs (<code className="text-pink-400 font-mono">-vf crop=w:h:x:y</code>).
          </p>

          {/* Aspect Ratio Presets Chips */}
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 block mb-1.5">Aspect Ratio</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { id: 'free', label: 'Free Ratio' },
                { id: '1:1', label: '1:1' },
                { id: '4:3', label: '4:3' },
                { id: '16:9', label: '16:9' },
                { id: '9:16', label: '9:16 (Shorts)' },
                { id: '2.40:1', label: '2.40:1 (Cinema)' },
              ].map((p) => {
                const isSelected = aspectRatioPreset === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyCropPreset(p.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-pink-500/20 border-pink-500/60 text-pink-300 shadow-sm'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-800'
                    }`}
                  >
                    {isSelected && <Check size={12} strokeWidth={3} className="text-pink-400" />}
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dimensions Floating Grid */}
          <div>
            <span className="text-[11px] font-semibold text-zinc-400 block mb-1.5">Dimensions (1080p Reference)</span>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 focus-within:border-pink-500/50 transition-colors">
                <span className="block text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">X Offset</span>
                <input
                  type="number"
                  value={crop.x}
                  onChange={(e) => updateCropField('x', e.target.value)}
                  className="w-full bg-transparent text-sm font-mono font-bold text-white outline-none mt-0.5"
                />
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 focus-within:border-pink-500/50 transition-colors">
                <span className="block text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Y Offset</span>
                <input
                  type="number"
                  value={crop.y}
                  onChange={(e) => updateCropField('y', e.target.value)}
                  className="w-full bg-transparent text-sm font-mono font-bold text-white outline-none mt-0.5"
                />
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 focus-within:border-pink-500/50 transition-colors">
                <span className="block text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Width</span>
                <input
                  type="number"
                  value={crop.w}
                  onChange={(e) => updateCropField('w', e.target.value)}
                  className="w-full bg-transparent text-sm font-mono font-bold text-white outline-none mt-0.5"
                />
              </div>

              <div className="bg-zinc-950/80 border border-zinc-800 rounded-xl p-2.5 focus-within:border-pink-500/50 transition-colors">
                <span className="block text-[10px] font-semibold uppercase text-zinc-500 tracking-wider">Height</span>
                <input
                  type="number"
                  value={crop.h}
                  onChange={(e) => updateCropField('h', e.target.value)}
                  className="w-full bg-transparent text-sm font-mono font-bold text-white outline-none mt-0.5"
                />
              </div>
            </div>
          </div>

          {/* Quick Helper Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={centerCropBox}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
            >
              Center Crop Box
            </button>
            <button
              type="button"
              onClick={resetCropToFull}
              className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
            >
              Fit Full Video (16:9)
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
         Modal Footer Actions (Reset & Apply)
      ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleResetCurrentTab}
          className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
        >
          <RotateCcw size={13} /> Reset Current
        </button>

        <button
          type="button"
          onClick={handleApply}
          className="flex items-center gap-2 px-5 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
        >
          <Check size={14} strokeWidth={3} />
          <span>Apply Changes</span>
        </button>
      </div>
    </div>
  );
}
