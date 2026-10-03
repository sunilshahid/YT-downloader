import { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MonitorPlay, Cpu, Music, Video, Disc, Check, Sparkles, RotateCcw } from 'lucide-react';
import AdvancedFeaturesList from './AdvancedFeaturesList';

function classifyVideoCodec(vcodec) {
  if (!vcodec) return null;
  const v = vcodec.toLowerCase();
  if (v.includes('av01') || v.includes('av1')) return 'AV1';
  if (v.includes('vp9') || v.includes('vp09')) return 'VP9';
  if (v.includes('avc') || v.includes('h264') || v.includes('h.264') || v.includes('264')) return 'H.264';
  return 'Other';
}

function classifyAudioCodec(acodec, ext) {
  const a = (acodec || '').toLowerCase();
  const e = (ext || '').toLowerCase();
  if (a.includes('opus') || e.includes('opus') || e.includes('webm')) return 'OPUS';
  if (a.includes('mp4a') || a.includes('aac') || e.includes('m4a') || e.includes('mp4')) return 'M4A / AAC';
  if (a.includes('mp3') || e.includes('mp3')) return 'MP3';
  if (a.includes('flac') || e.includes('flac')) return 'FLAC';
  return (acodec || ext || 'AAC').toUpperCase();
}

export function calculateDownloadSize(fmt, duration, audioFormats = [], selectedAudio = null, removeAudio = false) {
  if (!fmt) return null;

  // 1. Is this format already combined (has both video and audio tracks)?
  const isCombined = fmt.type === 'combined' || 
    fmt.type === 'video+audio' || 
    (fmt.vcodec && fmt.vcodec !== 'none' && fmt.acodec && fmt.acodec !== 'none');

  // Video bytes calculation
  let videoBytes = fmt.filesize || fmt.filesize_approx || 0;
  let videoApprox = false;

  if (!videoBytes && fmt.tbr && duration) {
    videoBytes = (fmt.tbr * 1000 / 8) * duration;
    videoApprox = true;
  } else if (!fmt.filesize && fmt.filesize_approx) {
    videoApprox = true;
  }

  // 2. Audio bytes calculation
  let audioBytes = 0;
  let audioApprox = false;

  // Only add audio size if format is NOT combined, audio is not removed, and audio formats exist
  if (!isCombined && !removeAudio && audioFormats && audioFormats.length > 0) {
    const targetAudio = selectedAudio 
      ? audioFormats.find(a => a.format_id === selectedAudio)
      : [...audioFormats].sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0))[0];

    if (targetAudio) {
      if (targetAudio.filesize) {
        audioBytes = targetAudio.filesize;
      } else if (targetAudio.filesize_approx) {
        audioBytes = targetAudio.filesize_approx;
        audioApprox = true;
      } else if ((targetAudio.abr || targetAudio.tbr) && duration) {
        const rate = targetAudio.abr || targetAudio.tbr;
        audioBytes = (rate * 1000 / 8) * duration;
        audioApprox = true;
      }
    }
  }

  const totalBytes = videoBytes + audioBytes;
  if (!totalBytes || totalBytes <= 0) {
    if (fmt.tbr) {
      const mbPerMin = (fmt.tbr * 60) / 8000;
      return `~${mbPerMin.toFixed(0)} MB/m`;
    }
    return null;
  }

  const isApprox = videoApprox || audioApprox || (!fmt.filesize && audioBytes > 0);
  const prefix = isApprox ? '~' : '';

  if (totalBytes >= 1_073_741_824) {
    return `${prefix}${(totalBytes / 1_073_741_824).toFixed(1)} GB`;
  }
  if (totalBytes >= 1_048_576) {
    return `${prefix}${Math.round(totalBytes / 1_048_576)} MB`;
  }
  if (totalBytes >= 1024) {
    return `${prefix}${Math.round(totalBytes / 1024)} KB`;
  }
  return `${totalBytes} B`;
}

export const getDisplaySize = calculateDownloadSize;

const AUDIO_CONTAINERS = [
  { id: 'none', label: 'Default' },
  { id: 'mp3', label: 'MP3' },
  { id: 'm4a', label: 'M4A' },
  { id: 'opus', label: 'OPUS' },
  { id: 'flac', label: 'FLAC' },
  { id: 'wav', label: 'WAV' },
  { id: 'aac', label: 'AAC' }
];

const AUDIO_BITRATES = [
  { id: 'none', label: 'Default' },
  { id: 'best', label: 'Best' },
  { id: '320k', label: '320 kbps' },
  { id: '256k', label: '256 kbps' },
  { id: '192k', label: '192 kbps' },
  { id: '128k', label: '128 kbps' },
  { id: '0', label: '0 (VBR)' }
];

export default function FormatSelector({
  formats,
  duration,
  webpageUrl,
  thumbnail,
  selectedVideo,
  selectedAudio,
  onSelectVideo,
  onSelectAudio,
  activeMode,
  setActiveMode,
  onModeChange,
  advancedOptions = {},
  setAdvancedOptions = () => {},
  settings = null
}) {
  const [selectedCodec, setSelectedCodec] = useState(null);

  const effectiveEmbedThumbnail = advancedOptions.embed_thumbnail !== null && advancedOptions.embed_thumbnail !== undefined
    ? Boolean(advancedOptions.embed_thumbnail)
    : (settings?.embed_thumbnail !== undefined ? Boolean(settings.embed_thumbnail) : true);

  const effectiveWriteThumbnail = advancedOptions.write_thumbnail !== null && advancedOptions.write_thumbnail !== undefined
    ? Boolean(advancedOptions.write_thumbnail)
    : (settings?.write_thumbnail !== undefined ? Boolean(settings.write_thumbnail) : false);

  const isThumbnailActive = Boolean(effectiveEmbedThumbnail || effectiveWriteThumbnail);

  // Chapters: settings defaults fallback
  const effectiveEmbedChapters = advancedOptions.embed_chapters !== null && advancedOptions.embed_chapters !== undefined
    ? Boolean(advancedOptions.embed_chapters)
    : (settings?.embed_chapters !== undefined ? Boolean(settings.embed_chapters) : true);
  const effectiveSplitChapters = Boolean(advancedOptions.split_chapters);
  const isChaptersActive = Boolean(effectiveEmbedChapters || effectiveSplitChapters);

  // Subtitles: settings defaults fallback
  const globalEmbedSubtitles = Boolean(settings?.embed_subtitles);
  const globalSubtitleLangs = settings?.subtitle_languages || 'en';
  const effectiveSubtitles = advancedOptions.subtitles !== null && advancedOptions.subtitles !== undefined
    ? advancedOptions.subtitles
    : (globalEmbedSubtitles ? { embed: true, write_subs: false, write_auto: false, langs: globalSubtitleLangs, sub_format: 'srt' } : null);
  const isSubtitlesActive = Boolean(
    effectiveSubtitles &&
    (effectiveSubtitles.embed || effectiveSubtitles.write_subs || effectiveSubtitles.write_auto)
  );

  // SponsorBlock: settings defaults fallback
  const globalSponsorblockEnabled = Boolean(settings?.sponsorblock_remove || settings?.remove_sponsorblock_default);
  const globalSponsorblockCategories = (settings?.sponsorblock_categories && settings.sponsorblock_categories.length > 0)
    ? settings.sponsorblock_categories
    : ['sponsor'];
  const effectiveSponsorblock = advancedOptions.sponsorblock !== null && advancedOptions.sponsorblock !== undefined
    ? (Array.isArray(advancedOptions.sponsorblock) ? advancedOptions.sponsorblock : (advancedOptions.sponsorblock?.categories || []))
    : (globalSponsorblockEnabled ? globalSponsorblockCategories : []);
  const isSponsorblockActive = effectiveSponsorblock.length > 0;

  const isAudioVideoActive = Boolean(
    advancedOptions.remove_audio ||
    (advancedOptions.recode_video && advancedOptions.recode_video !== 'none') ||
    (advancedOptions.recode_audio && advancedOptions.recode_audio !== 'none') ||
    (advancedOptions.audio_quality && advancedOptions.audio_quality !== 'none')
  );

  const isCutActive = Boolean(
    advancedOptions.cut && (
      advancedOptions.cut.start ||
      advancedOptions.cut.end ||
      (advancedOptions.cut.segments && advancedOptions.cut.segments.length > 0)
    )
  );
  const isCropActive = Boolean(advancedOptions.crop && advancedOptions.crop.w > 0 && advancedOptions.crop.h > 0);
  const isTrimCropActive = isCutActive || isCropActive;

  const globalFilenameTemplate = settings?.filename_template || '%(title)s.%(ext)s';
  const isFilenameActive = Boolean(
    advancedOptions.filename_template &&
    advancedOptions.filename_template.trim() !== '' &&
    advancedOptions.filename_template !== globalFilenameTemplate
  );

  const isCommandsActive = Boolean(advancedOptions.extra_commands && advancedOptions.extra_commands.trim().length > 0);

  const activeAdvancedCount = useMemo(() => {
    let count = 0;
    if (isThumbnailActive) count++;
    if (isSponsorblockActive) count++;
    if (isSubtitlesActive) count++;
    if (isChaptersActive) count++;
    if (isAudioVideoActive) count++;
    if (isTrimCropActive) count++;
    if (isFilenameActive) count++;
    if (isCommandsActive) count++;
    return count;
  }, [
    isThumbnailActive,
    isSponsorblockActive,
    isSubtitlesActive,
    isChaptersActive,
    isAudioVideoActive,
    isTrimCropActive,
    isFilenameActive,
    isCommandsActive
  ]);

  const activeBadges = useMemo(() => {
    const list = [];
    if (isThumbnailActive) {
      const parts = [];
      if (effectiveEmbedThumbnail) parts.push('Cover Embed');
      if (effectiveWriteThumbnail) parts.push('Save Image');
      if (parts.length > 0) list.push(`Thumbnail: ${parts.join(', ')}`);
    } else if (advancedOptions.embed_thumbnail === false) {
      list.push('Thumbnail: Disabled');
    }

    if (isChaptersActive) {
      if (effectiveSplitChapters) list.push('Split Chapters');
      else if (effectiveEmbedChapters) list.push('Embed Chapters');
    } else if (advancedOptions.embed_chapters === false) {
      list.push('Chapters: Disabled');
    }

    if (isSubtitlesActive) {
      list.push(`Subs (${effectiveSubtitles?.langs || 'en'})`);
    } else if (advancedOptions.subtitles && !advancedOptions.subtitles.embed && !advancedOptions.subtitles.write_subs && !advancedOptions.subtitles.write_auto) {
      list.push('Subs: Disabled');
    }

    if (isSponsorblockActive) {
      list.push(`SponsorBlock (${effectiveSponsorblock.length} cat, ${advancedOptions.sponsorblock_action || 'remove'})`);
    } else if (advancedOptions.sponsorblock && advancedOptions.sponsorblock.length === 0) {
      list.push('SponsorBlock: Disabled');
    }

    if (advancedOptions.recode_video && advancedOptions.recode_video !== 'none') {
      if (advancedOptions.recode_video === 'gif') {
        list.push('Recode: GIF (Muted)');
      } else {
        list.push(`Recode Video: ${advancedOptions.recode_video.toUpperCase()}`);
      }
    }
    if (advancedOptions.recode_audio && advancedOptions.recode_audio !== 'none') {
      if (advancedOptions.recode_audio === 'wav') {
        list.push('Audio: WAV (No Cover Art)');
      } else {
        list.push(`Extract Audio: ${advancedOptions.recode_audio.toUpperCase()}`);
      }
    }
    if (advancedOptions.audio_quality && advancedOptions.audio_quality !== 'none') {
      list.push(`Bitrate: ${advancedOptions.audio_quality}`);
    }
    if (advancedOptions.remove_audio) list.push('Audio Removed (Muted)');
    if (advancedOptions.cut) {
      const isRemove = (advancedOptions.cut.action || advancedOptions.cut.mode) === 'remove';
      const actionLabel = isRemove ? 'Remove' : 'Keep';
      if (Array.isArray(advancedOptions.cut.segments) && advancedOptions.cut.segments.length > 1) {
        list.push(`Cut [${actionLabel}]: ${advancedOptions.cut.segments.length} segments`);
      } else if (advancedOptions.cut.start || advancedOptions.cut.end) {
        list.push(`Cut [${actionLabel}]: ${advancedOptions.cut.start || '00:00'} → ${advancedOptions.cut.end || 'end'}`);
      }
    }
    if (advancedOptions.crop && advancedOptions.crop.w > 0 && advancedOptions.crop.h > 0) {
      list.push(`Crop: ${advancedOptions.crop.w}x${advancedOptions.crop.h} (Recode Locked)`);
    }
    if (isFilenameActive) {
      list.push('Custom Filename');
    }
    if (isCommandsActive) {
      list.push('Custom CLI Args');
    }
    return list;
  }, [
    isThumbnailActive,
    effectiveEmbedThumbnail,
    effectiveWriteThumbnail,
    isChaptersActive,
    effectiveEmbedChapters,
    effectiveSplitChapters,
    isSubtitlesActive,
    effectiveSubtitles,
    isSponsorblockActive,
    effectiveSponsorblock,
    isFilenameActive,
    isCommandsActive,
    advancedOptions
  ]);

  // Auto-detect YouTube Music or Audio mode on load
  useEffect(() => {
    if (webpageUrl && webpageUrl.includes('music.youtube.com')) {
      setActiveMode('audio');
    }
  }, [webpageUrl, setActiveMode]);

  // Separate video and audio formats
  const { videoFormats, audioFormats, codecs } = useMemo(() => {
    const video = formats.filter(f => f.type === 'video' || f.type === 'video+audio' || f.type === 'combined');
    const audio = formats.filter(f => f.type === 'audio');

    const codecSet = new Set();
    video.forEach(f => {
      const c = classifyVideoCodec(f.vcodec);
      if (c) codecSet.add(c);
    });

    return {
      videoFormats: video,
      audioFormats: audio,
      codecs: Array.from(codecSet),
    };
  }, [formats]);

  // Default video codec
  useEffect(() => {
    if (codecs.length > 0 && (!selectedCodec || !codecs.includes(selectedCodec))) {
      setSelectedCodec(codecs[0]);
    }
  }, [codecs, selectedCodec]);

  // Filter video formats
  const filteredVideoFormats = useMemo(() => {
    let filtered = videoFormats;
    if (selectedCodec) {
      filtered = filtered.filter(f => classifyVideoCodec(f.vcodec) === selectedCodec);
    } else if (codecs.length > 0) {
      filtered = filtered.filter(f => classifyVideoCodec(f.vcodec) === codecs[0]);
    }

    const byRes = new Map();
    filtered.forEach(f => {
      if (f.height) {
        const key = `${f.height}p`;
        const existing = byRes.get(key);
        if (!existing || (f.tbr || 0) > (existing.tbr || 0)) {
          byRes.set(key, f);
        }
      }
    });
    return Array.from(byRes.entries())
      .sort((a, b) => parseInt(b[0]) - parseInt(a[0]));
  }, [videoFormats, selectedCodec, codecs]);

  // Process and sort Audio Formats with Codecs & Bitrate & Sizes
  const formattedAudioList = useMemo(() => {
    const list = [...audioFormats];
    list.sort((a, b) => (b.abr || b.tbr || 0) - (a.abr || a.tbr || 0));
    return list.map(fmt => ({
      ...fmt,
      codecLabel: classifyAudioCodec(fmt.acodec, fmt.ext),
      bitrateLabel: fmt.abr ? `${Math.round(fmt.abr)} kbps` : (fmt.tbr ? `${Math.round(fmt.tbr)} kbps` : 'High Bitrate'),
      sizeLabel: calculateDownloadSize(fmt, duration, [], null, false),
    }));
  }, [audioFormats, duration]);

  const handleAudioContainerSelect = (containerId) => {
    setAdvancedOptions((prev) => {
      const next = { ...prev };
      if (containerId === 'none') {
        next.recode_audio = null;
        if (next.embed_thumbnail === false) {
          next.embed_thumbnail = null;
        }
      } else {
        next.recode_audio = containerId;
        // When WAV container is chosen: Thumbnail embedding is disabled (unsupported RIFF cover art)
        if (containerId === 'wav') {
          next.embed_thumbnail = false;
        } else if (next.embed_thumbnail === false) {
          next.embed_thumbnail = null;
        }
      }
      return next;
    });
  };

  const handleAudioQualitySelect = (qualityId) => {
    setAdvancedOptions((prev) => ({
      ...prev,
      audio_quality: qualityId === 'none' ? null : qualityId,
    }));
  };

  const handleModeChange = (mode) => {
    if (setActiveMode) setActiveMode(mode);
    if (onModeChange) onModeChange(mode);
    if (mode === 'audio') {
      onSelectVideo(null);
      // Auto-select best audio if none selected
      if (formattedAudioList.length > 0 && !selectedAudio) {
        onSelectAudio(formattedAudioList[0].format_id);
      }
      // Context-aware adjustments for audio mode:
      setAdvancedOptions((prev) => {
        const next = { ...prev };
        // Video recode is not applicable in audio mode
        if (next.recode_video) {
          next.recode_video = null;
        }
        // Subtitle embedding is disabled for audio (only separate subtitle download allowed)
        if (next.subtitles && next.subtitles.embed) {
          next.subtitles = { ...next.subtitles, embed: false };
        }
        // Cannot remove audio from an audio-only stream
        if (next.remove_audio) {
          next.remove_audio = null;
        }
        return next;
      });
    } else {
      if (filteredVideoFormats.length > 0 && !selectedVideo) {
        onSelectVideo(filteredVideoFormats[0][1].format_id);
      }
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      {/* Mode Switcher: Video vs Audio / Music Only */}
      <div className="glass rounded-2xl p-2 flex gap-2 border border-zinc-800">
        <button
          onClick={() => handleModeChange('video')}
          className={`flex-1 py-2.5 sm:py-3 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 ${
            activeMode === 'video'
              ? 'bg-gradient-to-r from-cyan-500/20 to-violet-500/20 border border-cyan-500/40 text-cyan-300 shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Video size={16} className={`shrink-0 ${activeMode === 'video' ? 'text-cyan-400' : ''}`} />
          <span>Video + Audio</span>
        </button>

        <button
          onClick={() => handleModeChange('audio')}
          className={`flex-1 py-2.5 sm:py-3 px-2.5 sm:px-4 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 sm:gap-2 transition-all duration-200 ${
            activeMode === 'audio'
              ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-500/40 text-emerald-300 shadow-md'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800/50'
          }`}
        >
          <Disc size={16} className={`shrink-0 ${activeMode === 'audio' ? 'text-emerald-400' : ''}`} />
          <span>Audio Only</span>
        </button>
      </div>

      {/* VIDEO MODE: Show Video Codecs + Resolutions */}
      {activeMode === 'video' && (
        <>
          {/* Active context feedback banners for Video Mode */}
          {advancedOptions.recode_video === 'gif' && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>🎬</span>
                <span><strong>GIF Format Active:</strong> Audio will be stripped (animated GIF). Video recode is locked to GIF.</span>
              </span>
            </div>
          )}

          {advancedOptions.crop && advancedOptions.crop.w > 0 && advancedOptions.crop.h > 0 && (
            <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs text-cyan-300 flex items-center justify-between">
              <span className="flex items-center gap-2">
                <span>✂️</span>
                <span><strong>Crop Active ({advancedOptions.crop.w}x{advancedOptions.crop.h}):</strong> Video container recoding is locked to match crop filter.</span>
              </span>
            </div>
          )}

          {/* Video Codec Selection */}
          {codecs.length > 0 && (
            <div className="glass rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <Cpu size={16} className="text-cyan-400" />
                <span className="text-sm font-medium text-zinc-300">Video Codec</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {codecs.map(codec => {
                  const isSelected = selectedCodec === codec;
                  return (
                    <button
                      key={codec}
                      onClick={() => setSelectedCodec(codec)}
                      className={`chip flex items-center gap-1.5 transition-all duration-200 ${
                        isSelected ? 'selected ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/20' : ''
                      }`}
                    >
                      {isSelected && <Check size={13} className="text-cyan-300 stroke-[3] shrink-0" />}
                      <span>{codec}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Video Resolution Selection */}
          {filteredVideoFormats.length > 0 && (
            <div className="glass rounded-2xl p-5 border border-zinc-800">
              <div className="flex items-center gap-2 mb-3">
                <MonitorPlay size={16} className="text-violet-400" />
                <span className="text-sm font-medium text-zinc-300">Video Resolution & Size</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {filteredVideoFormats.map(([res, fmt]) => {
                  const sizeLabel = calculateDownloadSize(fmt, duration, audioFormats, selectedAudio, advancedOptions?.remove_audio);
                  const isSelected = selectedVideo === fmt.format_id;
                  return (
                    <button
                      key={fmt.format_id}
                      onClick={() => onSelectVideo(isSelected ? null : fmt.format_id)}
                      className={`chip flex items-center gap-2 transition-all duration-200 ${
                        isSelected ? 'selected ring-2 ring-cyan-400/40 shadow-lg shadow-cyan-500/20' : ''
                      }`}
                    >
                      {isSelected && <Check size={14} className="text-cyan-300 stroke-[3] shrink-0" />}
                      <span className="font-semibold">{res}</span>
                      {fmt.fps && fmt.fps > 30 && (
                        <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${
                          isSelected ? 'bg-cyan-500/30 text-white font-semibold' : 'bg-zinc-800/80 text-zinc-400'
                        }`}>
                          {Math.round(fmt.fps)}fps
                        </span>
                      )}
                      {sizeLabel && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          isSelected ? 'bg-cyan-400/30 text-white font-semibold' : 'bg-cyan-500/10 text-cyan-300'
                        }`}>
                          {sizeLabel}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* AUDIO / MUSIC MODE: Direct Audio Container and Bitrate Selectors */}
      {activeMode === 'audio' && (
        <div className="glass rounded-2xl p-5 border border-emerald-500/30 glow-emerald space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music size={18} className="text-emerald-400" />
              <span className="text-sm font-bold text-white">Audio Formats & Codecs</span>
            </div>
            <span className="text-xs text-emerald-400/80 font-mono bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              {advancedOptions.recode_audio === 'wav'
                ? 'RIFF Container (Cover art disabled)'
                : 'Includes Poster & Metadata Embedding'}
            </span>
          </div>

          {/* Audio Codecs & Formats Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {formattedAudioList.map((fmt) => {
              const isSelected = selectedAudio === fmt.format_id;
              return (
                <button
                  key={fmt.format_id}
                  onClick={() => onSelectAudio(isSelected ? null : fmt.format_id)}
                  className={`p-3.5 rounded-xl text-left border transition-all duration-200 flex items-center justify-between ${
                    isSelected
                      ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400/40'
                      : 'bg-zinc-900/60 border-zinc-800 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-800/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{fmt.codecLabel}</span>
                      <span className="text-xs text-zinc-400 font-mono">({fmt.ext})</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-xs text-zinc-500 font-mono">
                      <span>⚡ {fmt.bitrateLabel}</span>
                      {fmt.sizeLabel && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-300 font-semibold">{fmt.sizeLabel}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                    isSelected ? 'border-emerald-400 bg-emerald-500 text-black shadow-sm' : 'border-zinc-700'
                  }`}>
                    {isSelected && <Check size={12} strokeWidth={3} />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Target Audio Container Selection */}
          <div className="pt-3 border-t border-emerald-500/20 space-y-3">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Disc size={14} className="text-emerald-400" />
                  Target Audio Container
                </span>
                {advancedOptions.recode_audio === 'wav' && (
                  <span className="text-[11px] font-medium text-amber-400 flex items-center gap-1 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                    ⚠️ WAV disables thumbnail embedding
                  </span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {AUDIO_CONTAINERS.map((ac) => {
                  const isSelected = (advancedOptions.recode_audio || 'none') === ac.id;
                  return (
                    <button
                      key={ac.id}
                      type="button"
                      onClick={() => handleAudioContainerSelect(ac.id)}
                      className={`chip flex items-center gap-1.5 transition-all duration-200 ${
                        isSelected ? 'selected-emerald ring-2 ring-emerald-400/40 shadow-lg shadow-emerald-500/20' : ''
                      }`}
                    >
                      {isSelected && <Check size={13} className="text-emerald-300 stroke-[3] shrink-0" />}
                      <span>{ac.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Audio Quality / Bitrate Selection */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                  <Sparkles size={14} className="text-teal-400" />
                  Audio Bitrate / Quality Override
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {AUDIO_BITRATES.map((ab) => {
                  const isSelected = (advancedOptions.audio_quality || 'none') === ab.id;
                  return (
                    <button
                      key={ab.id}
                      type="button"
                      onClick={() => handleAudioQualitySelect(ab.id)}
                      className={`chip flex items-center gap-1.5 transition-all duration-200 ${
                        isSelected ? 'selected-emerald ring-2 ring-teal-400/40 shadow-lg shadow-teal-500/20' : ''
                      }`}
                    >
                      {isSelected && <Check size={13} className="text-teal-300 stroke-[3] shrink-0" />}
                      <span>{ab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ADVANCED OVERRIDES (Scrolling Chips & Active Badges) */}
      <div className="glass rounded-2xl border border-zinc-800 p-4 relative z-10 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Advance Options</span>
            {activeAdvancedCount > 0 && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 font-bold border border-pink-500/40 animate-pulse">
                {activeAdvancedCount} active
              </span>
            )}
          </div>
          {activeAdvancedCount > 0 && (
            <button
              type="button"
              onClick={() => setAdvancedOptions({})}
              className="text-xs text-zinc-500 hover:text-red-400 flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={12} /> Clear all
            </button>
          )}
        </div>

        {/* Active badges summary strip */}
        {activeBadges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1 border-t border-zinc-800/60">
            {activeBadges.map((badge, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-pink-500/10 text-pink-300 border border-pink-500/25"
              >
                <Sparkles size={11} className="text-pink-400" />
                {badge}
              </span>
            ))}
          </div>
        )}

        <AdvancedFeaturesList
          advancedOptions={advancedOptions}
          setAdvancedOptions={setAdvancedOptions}
          activeMode={activeMode}
          duration={duration}
          webpageUrl={webpageUrl}
          thumbnail={thumbnail}
          settings={settings}
        />
      </div>

    </motion.div>
  );
}
