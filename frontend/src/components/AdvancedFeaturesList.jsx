import { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import TrimCropModal from './TrimCropModal';
import {
  Scissors,
  Crop,
  Type,
  TerminalSquare,
  DollarSign,
  FileText,
  Sliders,
  BookOpen,
  Image,
  X,
  RotateCcw,
  Info,
  AlertCircle,
  Plus,
  Trash2,
  Check,
  Film
} from 'lucide-react';

export default function AdvancedFeaturesList({
  advancedOptions = {},
  setAdvancedOptions = () => {},
  activeMode = 'video',
  duration = null,
  webpageUrl = '',
  thumbnail = '',
  settings = null
}) {
  const [activeModal, setActiveModal] = useState(null);

  // 1. Thumbnail: settings defaults fallback
  const effectiveEmbedThumbnail = advancedOptions.embed_thumbnail !== null && advancedOptions.embed_thumbnail !== undefined
    ? Boolean(advancedOptions.embed_thumbnail)
    : (settings?.embed_thumbnail !== undefined ? Boolean(settings.embed_thumbnail) : true);

  const effectiveWriteThumbnail = advancedOptions.write_thumbnail !== null && advancedOptions.write_thumbnail !== undefined
    ? Boolean(advancedOptions.write_thumbnail)
    : (settings?.write_thumbnail !== undefined ? Boolean(settings.write_thumbnail) : false);

  const isThumbnailActive = Boolean(effectiveEmbedThumbnail || effectiveWriteThumbnail);

  // 2. Chapters: settings defaults fallback
  const effectiveEmbedChapters = advancedOptions.embed_chapters !== null && advancedOptions.embed_chapters !== undefined
    ? Boolean(advancedOptions.embed_chapters)
    : (settings?.embed_chapters !== undefined ? Boolean(settings.embed_chapters) : true);
  const effectiveSplitChapters = Boolean(advancedOptions.split_chapters);
  const isChaptersActive = Boolean(effectiveEmbedChapters || effectiveSplitChapters);

  // 3. Subtitles: settings defaults fallback
  const globalEmbedSubtitles = Boolean(settings?.embed_subtitles);
  const globalSubtitleLangs = settings?.subtitle_languages || 'en';
  const effectiveSubtitles = advancedOptions.subtitles !== null && advancedOptions.subtitles !== undefined
    ? advancedOptions.subtitles
    : (globalEmbedSubtitles ? { embed: true, write_subs: false, write_auto: false, langs: globalSubtitleLangs, sub_format: 'srt' } : null);
  const isSubtitlesActive = Boolean(
    effectiveSubtitles &&
    (effectiveSubtitles.embed || effectiveSubtitles.write_subs || effectiveSubtitles.write_auto)
  );

  // 4. SponsorBlock: settings defaults fallback
  const globalSponsorblockEnabled = Boolean(settings?.sponsorblock_remove || settings?.remove_sponsorblock_default);
  const globalSponsorblockCategories = (settings?.sponsorblock_categories && settings.sponsorblock_categories.length > 0)
    ? settings.sponsorblock_categories
    : ['sponsor'];
  const effectiveSponsorblock = advancedOptions.sponsorblock !== null && advancedOptions.sponsorblock !== undefined
    ? (Array.isArray(advancedOptions.sponsorblock) ? advancedOptions.sponsorblock : (advancedOptions.sponsorblock?.categories || []))
    : (globalSponsorblockEnabled ? globalSponsorblockCategories : []);
  const isSponsorblockActive = effectiveSponsorblock.length > 0;

  // 5. Audio & Video overrides
  const isAudioVideoActive = Boolean(
    advancedOptions.remove_audio ||
    (advancedOptions.recode_video && advancedOptions.recode_video !== 'none') ||
    (advancedOptions.recode_audio && advancedOptions.recode_audio !== 'none') ||
    (advancedOptions.audio_quality && advancedOptions.audio_quality !== 'none')
  );

  // 6. Trim & Crop overrides
  const isCutActive = Boolean(
    advancedOptions.cut && (
      advancedOptions.cut.start ||
      advancedOptions.cut.end ||
      (advancedOptions.cut.segments && advancedOptions.cut.segments.length > 0)
    )
  );
  const isTrimCropActive = Boolean(
    isCutActive ||
    (advancedOptions.crop && advancedOptions.crop.w > 0 && advancedOptions.crop.h > 0)
  );

  // 7. Extra CLI commands
  const isCommandsActive = Boolean(advancedOptions.extra_commands && advancedOptions.extra_commands.trim().length > 0);

  // 8. Filename template override
  const globalFilenameTemplate = settings?.filename_template || '%(title)s.%(ext)s';
  const isFilenameActive = Boolean(
    advancedOptions.filename_template &&
    advancedOptions.filename_template.trim() !== '' &&
    advancedOptions.filename_template !== globalFilenameTemplate
  );

  const features = [
    {
      id: 'thumbnail',
      icon: Image,
      label: 'Thumbnail',
      active: isThumbnailActive,
      badge: effectiveWriteThumbnail ? '+File' : null
    },
    {
      id: 'chapters',
      icon: BookOpen,
      label: 'Chapters',
      active: isChaptersActive,
      badge: isChaptersActive ? (effectiveSplitChapters ? 'Split' : '1') : null
    },
    {
      id: 'subtitles',
      icon: Type,
      label: 'Subtitles',
      active: isSubtitlesActive,
      badge: isSubtitlesActive ? (effectiveSubtitles?.langs || 'en').split(',')[0] : null
    },
    {
      id: 'audio_video',
      icon: Sliders,
      label: 'Audio & Video',
      active: isAudioVideoActive
    },
    {
      id: 'sponsorblock',
      icon: DollarSign,
      label: 'SponsorBlock',
      active: isSponsorblockActive,
      badge: isSponsorblockActive ? `${effectiveSponsorblock.length}` : null
    },
    {
      id: 'trim_crop',
      icon: Scissors,
      label: 'Trim & Crop',
      active: isTrimCropActive
    },
    {
      id: 'filename',
      icon: FileText,
      label: 'Filename Template',
      active: isFilenameActive
    },
    {
      id: 'commands',
      icon: TerminalSquare,
      label: 'Extra CLI Args',
      active: isCommandsActive
    },
  ];

  const closeModal = () => setActiveModal(null);

  return (
    <div className="mt-1">
      {/* Horizontal scrolling chips list */}
      <div className="flex overflow-x-auto pb-2 -mx-1 px-1 hide-scrollbar gap-2.5">
        {features.map((feature) => {
          const Icon = feature.icon;
          return (
            <button
              key={feature.id}
              onClick={() => setActiveModal(feature.id)}
              className={`flex-shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 border cursor-pointer select-none ${
                feature.active
                  ? 'bg-pink-500/15 text-pink-300 border-pink-500/50 shadow-[0_0_15px_rgba(236,72,153,0.2)] hover:bg-pink-500/20'
                  : 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60 hover:bg-zinc-700 hover:text-white'
              }`}
            >
              <Icon size={15} className={feature.active ? 'text-pink-400' : 'text-zinc-400'} />
              <span>{feature.label}</span>
              {feature.badge ? (
                <span className="ml-0.5 text-[10px] px-1.5 py-0.2 rounded-full bg-pink-500/25 text-pink-300 font-bold border border-pink-500/40">
                  {feature.badge}
                </span>
              ) : feature.active ? (
                <span className="ml-0.5 w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
              ) : null}
            </button>
          );
        })}
      </div>

      {/* Modal Dialog Portals */}
      {createPortal(
        <AnimatePresence>
          {activeModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4"
              onClick={closeModal}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 15 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 15 }}
                onClick={(e) => e.stopPropagation()}
                className={`bg-zinc-900 border border-zinc-800/90 rounded-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${activeModal === 'trim_crop' ? 'max-w-2xl sm:max-w-3xl' : 'max-w-lg'}`}
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 px-5 border-b border-zinc-800/60 bg-zinc-900/60">
                  <div className="flex items-center gap-2.5">
                    {(() => {
                      const feat = features.find((f) => f.id === activeModal);
                      if (feat) {
                        const IconComponent = feat.icon;
                        return (
                          <div className="p-2 rounded-xl bg-pink-500/10 text-pink-400 border border-pink-500/20">
                            <IconComponent size={18} />
                          </div>
                        );
                      }
                      return null;
                    })()}
                    <div>
                      <h3 className="font-bold text-white text-base">
                        {features.find((f) => f.id === activeModal)?.label}
                      </h3>
                      <p className="text-xs text-zinc-500">Fine-tune yt-dlp execution parameters</p>
                    </div>
                  </div>
                  <button
                    onClick={closeModal}
                    className="p-1.5 text-zinc-400 hover:text-white rounded-xl hover:bg-zinc-800 transition-colors"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Modal Content */}
                <div className="p-5 overflow-y-auto flex-1 space-y-4">
                  {activeModal === 'thumbnail' && (
                    <ThumbnailModal
                      options={advancedOptions}
                      settings={settings}
                      onChange={(patch) => setAdvancedOptions({ ...advancedOptions, ...patch })}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'sponsorblock' && (
                    <SponsorBlockModal
                      options={advancedOptions}
                      settings={settings}
                      onChange={(patch) => setAdvancedOptions({ ...advancedOptions, ...patch })}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'subtitles' && (
                    <SubtitlesModal
                      options={advancedOptions}
                      settings={settings}
                      activeMode={activeMode}
                      onChange={(patch) => setAdvancedOptions({ ...advancedOptions, subtitles: patch })}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'chapters' && (
                    <ChaptersModal
                      options={advancedOptions}
                      settings={settings}
                      activeMode={activeMode}
                      onChange={(patch) => setAdvancedOptions({ ...advancedOptions, ...patch })}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'audio_video' && (
                    <AudioVideoModal
                      options={advancedOptions}
                      settings={settings}
                      activeMode={activeMode}
                      onChange={(patch) => setAdvancedOptions({ ...advancedOptions, ...patch })}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'trim_crop' && (
                    <TrimCropModal
                      options={advancedOptions}
                      activeMode={activeMode}
                      duration={duration}
                      webpageUrl={webpageUrl}
                      thumbnail={thumbnail}
                      onChangeCut={(cut) => {
                        const next = { ...advancedOptions, cut };
                        if (cut && (cut.start || cut.end || (cut.segments && cut.segments.length > 0))) {
                          // When Cut is active, Split Chapters is mutually exclusive
                          next.split_chapters = null;
                        }
                        setAdvancedOptions(next);
                      }}
                      onChangeCrop={(crop) => {
                        const next = { ...advancedOptions, crop };
                        if (crop && crop.w > 0 && crop.h > 0) {
                          // When Crop is active, container recoding is locked to match crop filter
                          if (!next.recode_video || next.recode_video === 'none') {
                            next.recode_video = 'mp4';
                          }
                        }
                        setAdvancedOptions(next);
                      }}
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'filename' && (
                    <FilenameModal
                      options={advancedOptions}
                      settings={settings}
                      onChange={(template) =>
                        setAdvancedOptions({ ...advancedOptions, filename_template: template })
                      }
                      onClose={closeModal}
                    />
                  )}
                  {activeModal === 'commands' && (
                    <ExtraCommandsModal
                      options={advancedOptions}
                      activeMode={activeMode}
                      onChange={(cmd) =>
                        setAdvancedOptions({ ...advancedOptions, extra_commands: cmd })
                      }
                      onClose={closeModal}
                    />
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   0. Thumbnail Modal (Checkbox Cards & Apply / Reset)
───────────────────────────────────────────────────────────── */
function ThumbnailModal({ options, settings, onChange, onClose }) {
  // Baseline defaults inherit from global settings
  const defaultEmbed = settings?.embed_thumbnail !== undefined ? Boolean(settings.embed_thumbnail) : true;
  const defaultWrite = settings?.write_thumbnail !== undefined ? Boolean(settings.write_thumbnail) : false;

  const [embedCovers, setEmbedCovers] = useState(
    options.embed_thumbnail !== undefined && options.embed_thumbnail !== null
      ? Boolean(options.embed_thumbnail)
      : defaultEmbed
  );
  const [saveThumb, setSaveThumb] = useState(
    options.write_thumbnail !== undefined && options.write_thumbnail !== null
      ? Boolean(options.write_thumbnail)
      : defaultWrite
  );

  const handleReset = () => {
    setEmbedCovers(defaultEmbed);
    setSaveThumb(defaultWrite);
    onChange({
      embed_thumbnail: null,
      write_thumbnail: null
    });
  };

  const handleApply = () => {
    onChange({
      embed_thumbnail: embedCovers,
      write_thumbnail: saveThumb
    });
    onClose();
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      <div className="space-y-2">
        {/* 1. Thumbnail covers */}
        <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-pink-500/30 transition-all select-none">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={embedCovers}
              onChange={(e) => setEmbedCovers(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50"
            />
            <div>
              <span className="text-xs font-semibold text-zinc-200">Thumbnail covers</span>
              <p className="text-[11px] text-zinc-500">Embed artwork cover directly into media container</p>
            </div>
          </div>
        </label>

        {/* 2. Save thumbnail */}
        <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-pink-500/30 transition-all select-none">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={saveThumb}
              onChange={(e) => setSaveThumb(e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50"
            />
            <div>
              <span className="text-xs font-semibold text-zinc-200">Save thumbnail</span>
              <p className="text-[11px] text-zinc-500">Save standalone high-resolution image file to Downloads</p>
            </div>
          </div>
        </label>
      </div>

      {/* Footer controls: Reset & Apply Thumbnail */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Apply Thumbnail
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   1. SponsorBlock Modal
───────────────────────────────────────────────────────────── */
function SponsorBlockModal({ options, settings, onChange, onClose }) {
  const globalSponsorblockEnabled = Boolean(settings?.sponsorblock_remove || settings?.remove_sponsorblock_default);
  const globalSponsorblockCategories = (settings?.sponsorblock_categories && settings.sponsorblock_categories.length > 0)
    ? settings.sponsorblock_categories
    : ['sponsor'];

  const initialCategories = options.sponsorblock !== null && options.sponsorblock !== undefined
    ? (Array.isArray(options.sponsorblock) ? options.sponsorblock : (options.sponsorblock?.categories || []))
    : (globalSponsorblockEnabled ? globalSponsorblockCategories : []);

  const initialAction = options.sponsorblock_action || 'remove';

  const [selectedCategories, setSelectedCategories] = useState(initialCategories);
  const [action, setAction] = useState(initialAction);

  const categories = [
    { id: 'sponsor', label: 'Sponsor', desc: 'Paid sponsor promotions, brand segments & referrals' },
    { id: 'intro', label: 'Intro / Intermission', desc: 'Opening animations, interval cards, intermission breaks' },
    { id: 'outro', label: 'Outro / Credits', desc: 'End credits, subscription reminders, channel cards' },
    { id: 'selfpromo', label: 'Self Promotion', desc: 'Merchandise, social media handles, other videos/channels' },
    { id: 'interaction', label: 'Interaction Reminder', desc: 'Reminders to like, subscribe, hit the bell, or comment' },
    { id: 'preview', label: 'Preview / Recap', desc: 'Recap of past episodes or previews of what is ahead' },
    { id: 'music_offtopic', label: 'Music: Non-Music Section', desc: 'Dialogue, skits, or silence in official music videos' }
  ];

  const toggleCategory = (id) => {
    setSelectedCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const selectAll = () => {
    setSelectedCategories(categories.map((c) => c.id));
  };

  const selectDefaults = () => {
    setSelectedCategories(['sponsor', 'selfpromo', 'interaction']);
  };

  const clearSelection = () => {
    setSelectedCategories([]);
  };

  const handleReset = () => {
    const resetCats = globalSponsorblockEnabled ? globalSponsorblockCategories : [];
    setSelectedCategories(resetCats);
    setAction('remove');
    onChange({
      sponsorblock: null,
      sponsorblock_action: null
    });
  };

  const handleApply = () => {
    // If selectedCategories is empty, it explicitly turns SponsorBlock OFF for this video
    onChange({
      sponsorblock: selectedCategories,
      sponsorblock_action: action
    });
    onClose();
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      {/* Action Mode Toggle */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-2">Action Mode</label>
        <div className="grid grid-cols-2 gap-2 p-1 bg-zinc-950/80 rounded-xl border border-zinc-800">
          <button
            type="button"
            onClick={() => setAction('remove')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              action === 'remove'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            ✂️ Cut Out (Remove)
          </button>
          <button
            type="button"
            onClick={() => setAction('mark')}
            className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
              action === 'mark'
                ? 'bg-pink-500 text-white shadow-md'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            🏷️ Mark as Chapters
          </button>
        </div>
        <p className="text-[11px] text-zinc-500 mt-1.5 px-1">
          {action === 'remove'
            ? 'Segments will be physically excised from the downloaded video.'
            : 'Video stays complete, but chapters will be generated indicating sponsor spots.'}
        </p>
      </div>

      {/* Categories Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold text-zinc-400">Categories to Filter</label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectDefaults}
              className="text-[11px] text-pink-400 hover:text-pink-300 font-medium"
            >
              Recommended
            </button>
            <span className="text-zinc-700">•</span>
            <button
              type="button"
              onClick={selectAll}
              className="text-[11px] text-zinc-400 hover:text-white font-medium"
            >
              Select All
            </button>
            <span className="text-zinc-700">•</span>
            <button
              type="button"
              onClick={clearSelection}
              className="text-[11px] text-zinc-500 hover:text-red-400 font-medium"
            >
              Clear None
            </button>
          </div>
        </div>

        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
          {categories.map((c) => {
            const isChecked = selectedCategories.includes(c.id);
            return (
              <label
                key={c.id}
                className={`flex items-start gap-3 p-2.5 rounded-xl border cursor-pointer transition-all duration-150 ${
                  isChecked
                    ? 'bg-pink-500/10 border-pink-500/40 text-white'
                    : 'bg-zinc-900/60 border-zinc-800/80 text-zinc-400 hover:border-zinc-700 hover:bg-zinc-850'
                }`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => toggleCategory(c.id)}
                  className="mt-0.5 rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-200">{c.label}</span>
                    <span className="text-[10px] font-mono text-zinc-500">{c.id}</span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5">{c.desc}</p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Apply SponsorBlock
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   2. Subtitles Modal
───────────────────────────────────────────────────────────── */
function SubtitlesModal({ options, settings, onChange, onClose, activeMode = 'video' }) {
  const isAudioMode = activeMode === 'audio';
  const globalEmbedSubtitles = Boolean(settings?.embed_subtitles);
  const globalSubtitleLangs = settings?.subtitle_languages || 'en';

  const defaultSubs = {
    embed: isAudioMode ? false : globalEmbedSubtitles,
    write_subs: false,
    write_auto: false,
    langs: globalSubtitleLangs,
    sub_format: 'srt'
  };

  const initialSubs = options.subtitles !== null && options.subtitles !== undefined
    ? {
        embed: isAudioMode ? false : Boolean(options.subtitles.embed),
        write_subs: Boolean(options.subtitles.write_subs),
        write_auto: Boolean(options.subtitles.write_auto || options.subtitles.write_auto_subs),
        langs: options.subtitles.langs || globalSubtitleLangs,
        sub_format: options.subtitles.sub_format || options.subtitles.format || 'srt'
      }
    : defaultSubs;

  const [subs, setSubs] = useState(initialSubs);

  const presetLangs = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Spanish' },
    { code: 'fr', label: 'French' },
    { code: 'de', label: 'German' },
    { code: 'ja', label: 'Japanese' },
    { code: 'all', label: 'All' }
  ];

  const formats = ['srt', 'vtt', 'ass', 'lrc'];

  const update = (field, val) => {
    if (isAudioMode && field === 'embed' && val) return;
    setSubs((prev) => ({
      ...prev,
      [field]: val
    }));
  };

  const currentLangsList = (subs.langs || '').split(',').map((s) => s.trim()).filter(Boolean);

  const toggleLanguagePreset = (code) => {
    let newLangs;
    if (code === 'all') {
      newLangs = 'all';
    } else if (subs.langs === 'all') {
      newLangs = code;
    } else {
      if (currentLangsList.includes(code)) {
        const filtered = currentLangsList.filter((c) => c !== code);
        newLangs = filtered.length > 0 ? filtered.join(',') : 'en';
      } else {
        newLangs = [...currentLangsList, code].join(',');
      }
    }
    update('langs', newLangs);
  };

  const handleReset = () => {
    setSubs(defaultSubs);
    onChange(null);
  };

  const handleApply = () => {
    onChange(subs);
    onClose();
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      {/* Download / Embedding Toggles */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-zinc-400 mb-1">Download & Embedding Mode</label>
        
        <label className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
          isAudioMode
            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60 cursor-not-allowed'
            : 'border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-pink-500/30'
        }`}>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              disabled={isAudioMode}
              checked={isAudioMode ? false : subs.embed}
              onChange={(e) => update('embed', e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50 disabled:opacity-40"
            />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-zinc-200">Embed Subtitles in Video</span>
                {isAudioMode && (
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                    Disabled in Audio Mode
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500">
                {isAudioMode
                  ? 'Subtitles cannot be embedded into audio streams. Use separate subtitle files below.'
                  : 'Muxes soft subtitles directly into the output video container'}
              </p>
            </div>
          </div>
        </label>

        <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-pink-500/30 transition-all">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={subs.write_subs}
              onChange={(e) => update('write_subs', e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50"
            />
            <div>
              <span className="text-xs font-semibold text-zinc-200">Download Separate Subtitle Files</span>
              <p className="text-[11px] text-zinc-500">Saves dedicated standalone subtitle files alongside the video</p>
            </div>
          </div>
        </label>

        <label className="flex items-center justify-between p-3 rounded-xl border border-zinc-800 bg-zinc-900/60 cursor-pointer hover:border-pink-500/30 transition-all">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={subs.write_auto}
              onChange={(e) => update('write_auto', e.target.checked)}
              className="rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50"
            />
            <div>
              <span className="text-xs font-semibold text-zinc-200">Include Auto-Generated Subtitles</span>
              <p className="text-[11px] text-zinc-500">Falls back to platform machine-transcribed captions</p>
            </div>
          </div>
        </label>
      </div>

      {/* Language Selector */}
      <div className="space-y-2">
        <label className="block text-xs font-semibold text-zinc-400">Target Languages</label>
        
        {/* Preset Chips */}
        <div className="flex flex-wrap gap-1.5">
          {presetLangs.map((l) => {
            const isSelected =
              subs.langs === 'all'
                ? l.code === 'all'
                : currentLangsList.includes(l.code);
            return (
              <button
                key={l.code}
                type="button"
                onClick={() => {
                  toggleLanguagePreset(l.code);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/50 shadow-sm'
                    : 'bg-zinc-800/80 text-zinc-400 border border-zinc-700/50 hover:bg-zinc-700 hover:text-white'
                }`}
              >
                {l.label} ({l.code})
              </button>
            );
          })}
        </div>

        {/* Custom Code Input */}
        <div>
          <input
            type="text"
            value={subs.langs || ''}
            onChange={(e) => update('langs', e.target.value)}
            placeholder="e.g. en,es,fr or .*-orig"
            className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-zinc-200 outline-none focus:border-pink-500/50"
          />
          <p className="text-[11px] text-zinc-500 mt-1">Comma-separated ISO codes or yt-dlp regex patterns (e.g. <code className="text-pink-400">.*-orig,en</code>)</p>
        </div>
      </div>

      {/* Subtitle Format */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-2">Subtitle Output Format</label>
        <div className="grid grid-cols-4 gap-2">
          {formats.map((fmt) => {
            const isSelected = (subs.sub_format || 'srt') === fmt;
            return (
              <button
                key={fmt}
                type="button"
                onClick={() => update('sub_format', fmt)}
                className={`py-2 px-2 rounded-xl text-xs font-mono font-bold uppercase transition-all border ${
                  isSelected
                    ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
                    : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                .{fmt}
              </button>
            );
          })}
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Apply Subtitles
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   3. Chapters Modal
───────────────────────────────────────────────────────────── */
function ChaptersModal({ options, settings, onChange, onClose, activeMode = 'video' }) {
  const defaultEmbed = settings?.embed_chapters !== undefined ? Boolean(settings.embed_chapters) : true;
  const initialEmbed = options.embed_chapters !== null && options.embed_chapters !== undefined
    ? Boolean(options.embed_chapters)
    : defaultEmbed;
  const initialSplit = Boolean(options.split_chapters);

  const [embedChapters, setEmbedChapters] = useState(initialEmbed);
  const [splitChapters, setSplitChapters] = useState(initialSplit);

  const isCutActive = Boolean(
    options.cut && (
      options.cut.start ||
      options.cut.end ||
      (options.cut.segments && options.cut.segments.length > 0)
    )
  );

  const toggleEmbed = (val) => {
    if (splitChapters) return;
    setEmbedChapters(val);
  };

  const toggleSplit = (val) => {
    if (isCutActive) return;
    setSplitChapters(val);
    if (val) {
      setEmbedChapters(false);
    }
  };

  const handleReset = () => {
    setEmbedChapters(defaultEmbed);
    setSplitChapters(false);
    onChange({
      embed_chapters: null,
      split_chapters: null
    });
  };

  const handleApply = () => {
    onChange({
      embed_chapters: embedChapters,
      split_chapters: splitChapters ? true : null
    });
    onClose();
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      <div className="space-y-3">
        {/* Embed Chapters in Video */}
        <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all ${
          splitChapters
            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60 cursor-not-allowed'
            : embedChapters
              ? 'bg-pink-500/10 border-pink-500/40 text-white cursor-pointer'
              : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 cursor-pointer'
        }`}>
          <input
            type="checkbox"
            disabled={splitChapters}
            checked={splitChapters ? false : embedChapters}
            onChange={(e) => toggleEmbed(e.target.checked)}
            className="mt-0.5 rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50 disabled:opacity-40"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">Embed Chapters in Video</span>
              {splitChapters && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                  Disabled when Split Chapters is active
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {splitChapters
                ? 'Cannot embed chapters into a single file when video is being split into separate files.'
                : 'Injects chapter navigation markers directly into the output video file (MP4/MKV) for smooth scrubbing in players like VLC and MPV.'}
            </p>
          </div>
        </label>

        {/* Split Video by Chapters */}
        <label className={`flex items-start gap-3.5 p-3.5 rounded-xl border transition-all ${
          isCutActive
            ? 'bg-zinc-950/40 border-zinc-800/60 opacity-60 cursor-not-allowed'
            : splitChapters
              ? 'bg-pink-500/10 border-pink-500/40 text-white cursor-pointer'
              : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 cursor-pointer'
        }`}>
          <input
            type="checkbox"
            disabled={isCutActive}
            checked={isCutActive ? false : splitChapters}
            onChange={(e) => toggleSplit(e.target.checked)}
            className="mt-0.5 rounded bg-zinc-800 border-zinc-700 text-pink-500 focus:ring-pink-500/50 disabled:opacity-40"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">Split Video by Chapters</span>
              {isCutActive && (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                  Disabled when Cut Video is active
                </span>
              )}
            </div>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              {isCutActive
                ? 'Time-slice trimming is active. Chapter splitting cannot be performed on a sliced time segment.'
                : 'Automatically segments the download into separate, individually numbered files named after each chapter title (--split-chapters).'}
            </p>
          </div>
        </label>
      </div>

      <div className="p-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 flex items-start gap-2.5">
        <Info size={16} className="text-cyan-400 flex-shrink-0 mt-0.5" />
        <span>Chapters are parsed from creator timestamp descriptions or official platform chapter tracks.</span>
      </div>

      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Apply Chapters
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   4. Audio & Video Options Modal
───────────────────────────────────────────────────────────── */
function AudioVideoModal({ options, onChange, onClose, activeMode = 'video' }) {
  const isAudioMode = activeMode === 'audio';

  const videoContainers = [
    { id: 'none', label: 'Original / Default' },
    { id: 'mp4', label: 'MP4' },
    { id: 'mkv', label: 'MKV' },
    { id: 'webm', label: 'WebM' },
    { id: 'avi', label: 'AVI' },
    { id: 'mov', label: 'MOV' },
    { id: 'gif', label: 'GIF (Animation)' }
  ];

  const audioContainers = [
    { id: 'none', label: 'Original / None' },
    { id: 'mp3', label: 'MP3' },
    { id: 'm4a', label: 'M4A' },
    { id: 'opus', label: 'OPUS' },
    { id: 'flac', label: 'FLAC' },
    { id: 'wav', label: 'WAV' },
    { id: 'aac', label: 'AAC' }
  ];

  const audioBitrates = [
    { id: 'none', label: 'Default' },
    { id: 'best', label: 'Best (Auto)' },
    { id: '320k', label: '320 kbps (Max)' },
    { id: '256k', label: '256 kbps (High)' },
    { id: '192k', label: '192 kbps (Med)' },
    { id: '128k', label: '128 kbps (Light)' },
    { id: '0', label: '0 (VBR Best)' }
  ];

  const currentVideoRecode = (options.recode_video || 'none').toLowerCase();
  const currentAudioRecode = (options.recode_audio || 'none').toLowerCase();
  const currentAudioQuality = options.audio_quality || 'none';
  const isGif = currentVideoRecode === 'gif';
  const isWav = currentAudioRecode === 'wav';
  const isCropActive = Boolean(options.crop && options.crop.w > 0 && options.crop.h > 0);
  const isMute = isGif || options.remove_audio === true;

  const handleVideoRecodeSelect = (id) => {
    if (isAudioMode) return;
    if (isCropActive && id === 'none') return;

    if (id === 'gif') {
      // When GIF is chosen: audio is stripped/disabled (remove_audio: true), video recode is locked
      onChange({
        recode_video: 'gif',
        remove_audio: true,
        recode_audio: null
      });
    } else {
      const patch = {
        recode_video: id === 'none' ? null : id
      };
      if (isGif) {
        patch.remove_audio = null;
      }
      onChange(patch);
    }
  };

  const handleAudioRecodeSelect = (id) => {
    if (isGif) return;

    if (id === 'wav') {
      // When WAV container is chosen: Thumbnail embedding is disabled (unsupported RIFF cover art)
      onChange({
        recode_audio: 'wav',
        embed_thumbnail: false
      });
    } else {
      const patch = {
        recode_audio: id === 'none' ? null : id
      };
      if (isWav) {
        patch.embed_thumbnail = null;
      }
      onChange(patch);
    }
  };

  const handleRemoveAudioToggle = (checked) => {
    if (isAudioMode || isGif) return;
    onChange({ remove_audio: checked ? true : null });
  };

  const clearAll = () => {
    onChange({
      recode_video: null,
      recode_audio: null,
      audio_quality: null,
      remove_audio: null,
      embed_thumbnail: null
    });
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      {/* Video Recode Container */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-zinc-400">Video Recode Container</label>
          {isAudioMode ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
              Disabled in Audio Mode (Audio only stream)
            </span>
          ) : isCropActive ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-medium">
              Locked for Crop filter
            </span>
          ) : isGif ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
              GIF (Audio Stripped)
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {videoContainers.map((c) => {
            const isSelected = currentVideoRecode === c.id;
            const isDisabled = isAudioMode || (isCropActive && c.id === 'none');
            return (
              <button
                key={c.id}
                type="button"
                disabled={isDisabled}
                onClick={() => handleVideoRecodeSelect(c.id)}
                title={
                  isAudioMode
                    ? 'Video recode is not applicable in Audio Mode'
                    : isCropActive && c.id === 'none'
                      ? 'Original stream-copy disabled — Crop requires video re-encoding'
                      : ''
                }
                className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all border ${
                  isDisabled
                    ? 'bg-zinc-950/40 border-zinc-850 text-zinc-600 opacity-40 cursor-not-allowed'
                    : isSelected
                      ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-zinc-500 mt-1">
          {isAudioMode
            ? 'Video container options are disabled because download is configured in audio-only mode.'
            : isCropActive
              ? 'Crop filter is active. Original stream-copy is disabled; container recoding is locked to ensure re-encoding.'
              : isGif
                ? 'GIF container chosen: All audio tracks are stripped automatically for animated GIF output.'
                : 'Forces ffmpeg to remux or transcode video into this container format.'}
        </p>
      </div>

      {/* Audio Extract / Recode Container */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-zinc-400">Audio Extract / Convert Format</label>
          {isGif ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
              Disabled for GIF container
            </span>
          ) : isWav ? (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
              WAV (No Cover Art)
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-4 gap-2">
          {audioContainers.map((a) => {
            const isSelected = currentAudioRecode === a.id;
            const isDisabled = isGif;
            return (
              <button
                key={a.id}
                type="button"
                disabled={isDisabled}
                onClick={() => handleAudioRecodeSelect(a.id)}
                title={isGif ? 'Audio options are disabled for GIF container' : ''}
                className={`py-2 px-1.5 rounded-xl text-xs font-mono font-semibold transition-all border ${
                  isDisabled
                    ? 'bg-zinc-950/40 border-zinc-850 text-zinc-600 opacity-40 cursor-not-allowed'
                    : isSelected
                      ? 'bg-pink-500/20 text-pink-300 border-pink-500/50'
                      : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
              >
                {a.label}
              </button>
            );
          })}
        </div>

        {isWav && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2 mt-2">
            <AlertCircle size={14} className="flex-shrink-0" />
            <span>Thumbnail embedding is disabled for WAV (RIFF container does not support cover art).</span>
          </div>
        )}
      </div>

      {/* Audio Quality / Bitrate */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs font-semibold text-zinc-400">Audio Quality / Bitrate Override</label>
          {isGif && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
              Disabled for GIF
            </span>
          )}
        </div>
        <select
          disabled={isGif}
          value={currentAudioQuality}
          onChange={(e) => onChange({ audio_quality: e.target.value === 'none' ? null : e.target.value })}
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 outline-none focus:border-pink-500/50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {audioBitrates.map((b) => (
            <option key={b.id} value={b.id}>
              {b.label}
            </option>
          ))}
        </select>
      </div>

      {/* Remove Audio Stream Toggle */}
      <div className="pt-1">
        <label className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
          isAudioMode
            ? 'bg-zinc-950/40 border-zinc-850 opacity-60 cursor-not-allowed'
            : isGif
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-200 cursor-not-allowed'
              : isMute
                ? 'bg-red-500/15 border-red-500/40 text-red-200 cursor-pointer'
                : 'bg-zinc-900/60 border-zinc-800 text-zinc-400 hover:border-zinc-700 cursor-pointer'
        }`}>
          <input
            type="checkbox"
            disabled={isAudioMode || isGif}
            checked={isMute && !isAudioMode}
            onChange={(e) => handleRemoveAudioToggle(e.target.checked)}
            className="rounded bg-zinc-800 border-zinc-700 text-red-500 focus:ring-red-500/50 disabled:opacity-40"
          />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-zinc-200">Remove Audio Stream (Mute Video)</span>
              {isAudioMode ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 font-medium">
                  Cannot remove audio in Audio Mode
                </span>
              ) : isGif ? (
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-medium border border-amber-500/30">
                  Locked (Audio automatically stripped for GIF)
                </span>
              ) : null}
            </div>
            <p className="text-[11px] text-zinc-500">
              {isAudioMode
                ? 'Audio removal is disabled because the current download mode is Audio Only.'
                : isGif
                  ? 'GIF files cannot contain audio streams. Audio is automatically removed.'
                  : 'Strips all audio tracks completely using ffmpeg stream copy'}
            </p>
          </div>
        </label>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={clearAll}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   6. Extra CLI Arguments Modal
───────────────────────────────────────────────────────────── */
function ExtraCommandsModal({ options, onChange, onClose, activeMode = 'video' }) {
  const current = options.extra_commands || '';
  const isWav = (options.recode_audio || '').toLowerCase() === 'wav';

  const snippets = [
    { label: 'Limit Speed 5M', cmd: '--limit-rate 5M' },
    { label: 'Chrome Cookies', cmd: '--cookies-from-browser chrome' },
    { label: 'No Playlist', cmd: '--no-playlist' },
    { label: 'Geo Bypass', cmd: '--geo-bypass' },
    { label: '5 Concurrent Frags', cmd: '--concurrent-fragments 5' },
    { label: 'Embed Thumbnail', cmd: '--embed-thumbnail' },
  ];

  const appendSnippet = (snippet) => {
    if (!current) {
      onChange(snippet);
    } else if (!current.includes(snippet)) {
      onChange(`${current.trim()} ${snippet}`);
    }
  };

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      <p className="text-xs text-zinc-400">
        Directly inject raw command-line flags into the underlying yt-dlp execution pipeline.
      </p>

      {/* Snippet chips */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[11px] font-semibold text-zinc-500">Common Flag Snippets:</span>
          {isWav && (
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
              Thumbnail embedding disabled for WAV
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {snippets.map((s) => {
            const isThumb = s.cmd === '--embed-thumbnail';
            const isDisabled = isThumb && isWav;
            return (
              <button
                key={s.cmd}
                type="button"
                disabled={isDisabled}
                onClick={() => appendSnippet(s.cmd)}
                title={isDisabled ? 'Thumbnail embedding is unsupported for WAV format' : ''}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-colors ${
                  isDisabled
                    ? 'bg-zinc-900 border border-zinc-800 text-zinc-600 opacity-40 cursor-not-allowed'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300'
                }`}
              >
                + {s.label}
                {isDisabled && ' (WAV Unsupported)'}
              </button>
            );
          })}
        </div>
      </div>

      {/* Clean textarea */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Custom CLI Arguments</label>
        <textarea
          rows={4}
          value={current}
          onChange={(e) => onChange(e.target.value.trim().length > 0 ? e.target.value : null)}
          placeholder="e.g. --cookies-from-browser chrome --limit-rate 5M --no-playlist"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl p-3 text-xs font-mono text-zinc-200 outline-none focus:border-pink-500/50 resize-none leading-relaxed"
        />
      </div>

      {/* Security note */}
      <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300/90 text-xs flex items-start gap-2.5">
        <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <div>
          <span className="font-semibold block text-amber-300">Security Warning</span>
          <span>Arguments are executed directly by yt-dlp. Ensure flags are safe and do not execute external arbitrary scripts or untrusted programs.</span>
        </div>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={() => onChange(null)}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Clear
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Save Arguments
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   7. Filename Template Modal
───────────────────────────────────────────────────────────── */
function FilenameModal({ options, settings, onChange, onClose }) {
  const globalTemplate = settings?.filename_template || '%(title)s.%(ext)s';
  const initialTemplate = (options.filename_template !== null && options.filename_template !== undefined)
    ? options.filename_template
    : globalTemplate;

  const [template, setTemplate] = useState(initialTemplate);
  const inputRef = useRef(null);

  const variables = [
    { tag: '%(title)s', label: 'Title', desc: 'Video title' },
    { tag: '%(id)s', label: 'ID', desc: 'Unique video ID' },
    { tag: '%(uploader)s', label: 'Uploader', desc: 'Channel or creator name' },
    { tag: '%(resolution)s', label: 'Resolution', desc: 'e.g. 1080p, 4K' },
    { tag: '%(ext)s', label: 'Ext', desc: 'Container extension' },
    { tag: '%(upload_date)s', label: 'Upload Date', desc: 'YYYYMMDD date' },
    { tag: '%(playlist_index)s', label: 'Playlist Index', desc: 'Index number' }
  ];

  const presets = [
    { name: 'Default', tpl: '%(title)s.%(ext)s' },
    { name: 'Artist - Title', tpl: '%(uploader)s - %(title)s.%(ext)s' },
    { name: 'Numbered Track', tpl: '%(playlist_index)02d. %(title)s.%(ext)s' },
    { name: 'Dated Archive', tpl: '%(upload_date)s_%(title)s [%(id)s].%(ext)s' },
  ];

  const insertVariable = (tag) => {
    if (!inputRef.current) {
      setTemplate((prev) => (prev + tag).trim());
      return;
    }
    const input = inputRef.current;
    const start = input.selectionStart || template.length;
    const end = input.selectionEnd || template.length;
    const nextVal = template.substring(0, start) + tag + template.substring(end);
    setTemplate(nextVal);
    // restore cursor after tag
    setTimeout(() => {
      input.focus();
      input.setSelectionRange(start + tag.length, start + tag.length);
    }, 50);
  };

  const handleReset = () => {
    setTemplate(globalTemplate);
    onChange(null);
  };

  const handleApply = () => {
    if (template === globalTemplate) {
      onChange(null);
    } else {
      onChange(template.trim().length > 0 ? template : null);
    }
    onClose();
  };

  // Generate simulated preview filename
  const previewFilename = (() => {
    let s = template || globalTemplate;
    s = s.replace(/%\(title\)s/g, 'Never Gonna Give You Up');
    s = s.replace(/%\(id\)s/g, 'dQw4w9WgXcQ');
    s = s.replace(/%\(uploader\)s/g, 'Rick Astley');
    s = s.replace(/%\(resolution\)s/g, '1080p');
    s = s.replace(/%\(upload_date\)s/g, '20091025');
    s = s.replace(/%\(playlist_index\)02d/g, '01');
    s = s.replace(/%\(playlist_index\)s/g, '1');
    s = s.replace(/%\(ext\)s/g, 'mp4');
    return s;
  })();

  return (
    <div className="space-y-4 text-sm text-zinc-300">
      <p className="text-xs text-zinc-400">
        Customize the output file naming scheme using standard yt-dlp template variables.
      </p>

      {/* Preset templates */}
      <div>
        <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">Preset Templates:</span>
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => setTemplate(p.tpl)}
              className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-[11px] text-zinc-300 transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
      </div>

      {/* Template input */}
      <div>
        <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Output Filename Template</label>
        <input
          ref={inputRef}
          type="text"
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          placeholder="%(title)s.%(ext)s"
          className="w-full bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs font-mono text-pink-300 outline-none focus:border-pink-500/50"
        />
      </div>

      {/* Clickable Variable Chips */}
      <div>
        <span className="text-[11px] font-semibold text-zinc-500 block mb-1.5">Click to Insert Dynamic Variable:</span>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((v) => (
            <button
              key={v.tag}
              type="button"
              onClick={() => insertVariable(v.tag)}
              title={v.desc}
              className="px-2.5 py-1.5 rounded-lg bg-pink-500/10 hover:bg-pink-500/20 border border-pink-500/30 text-[11px] font-mono text-pink-300 transition-all"
            >
              {v.tag}
            </button>
          ))}
        </div>
      </div>

      {/* Live Preview */}
      <div className="p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
        <span className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider block mb-1">
          Simulated Example Output
        </span>
        <p className="text-xs font-mono text-emerald-400 break-all">{previewFilename}</p>
      </div>

      {/* Footer controls */}
      <div className="flex items-center justify-between pt-3 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          <RotateCcw size={13} /> Reset
        </button>
        <button
          type="button"
          onClick={handleApply}
          className="px-4 py-2 text-xs font-semibold bg-pink-500 hover:bg-pink-600 text-white rounded-xl transition-all shadow-md"
        >
          Apply Filename Template
        </button>
      </div>
    </div>
  );
}
