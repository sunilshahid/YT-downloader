import asyncio
import sys
import threading
import uuid
import tempfile
import os
import re
import shutil
import logging
import json
import time
import platform
import urllib.request
import urllib.parse
import traceback
from datetime import datetime
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Optional, Callable, Any, List, Set, Union

import yt_dlp
import mutagen
from mutagen.id3 import USLT, SYLT, TIT2, TPE1, TALB, TDRC, APIC, TCON, TCOM, COMM, TPE2, TRCK

try:
    import syncedlyrics
except ImportError:
    syncedlyrics = None

from models import (
    FormatInfo, VideoInfo, DownloadRequest, DownloadStatus,
    DownloadStatusEnum, AppSettings, JsEngine,
    AdvancedDownloadOptions, AdvancedOptions, SubtitleOptions,
    SponsorBlockOptions, CutOptions, CropOptions
)
from settings_manager import settings_manager

logger = logging.getLogger(__name__)

# Thread pool for running yt-dlp downloads without blocking the event loop
_executor = ThreadPoolExecutor(max_workers=10)

# Global registry of all downloads (active + history)
download_registry: Dict[str, DownloadStatus] = {}

# Cancellation flags
_cancel_flags: Dict[str, bool] = {}

# Queue for broadcasting progress updates via WebSocket
progress_queue: asyncio.Queue = None  # Initialized in main.py

# History, Logs, and Staging file paths
DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
HISTORY_FILE = DATA_DIR / "download_history.json"
STAGING_DIR_ROOT = DATA_DIR / "staging"
STAGING_DIR_ROOT.mkdir(parents=True, exist_ok=True)
LOGS_DIR = DATA_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_ARCHIVE_FILE = DATA_DIR / "download_archive.txt"

class DuplicateDownloadError(Exception):
    """Raised when a download request is identified as a duplicate."""
    def __init__(self, duplicate_info: dict):
        self.duplicate_info = duplicate_info
        super().__init__(duplicate_info.get("message", "Duplicate download detected"))

# Subprocess tracking per download
import subprocess
import psutil
_active_subprocesses: Dict[str, Set[int]] = {}
_subprocess_lock = threading.Lock()
_thread_download_context = threading.local()

# Hook subprocess.Popen to automatically track child processes spawned during a download
_original_popen = subprocess.Popen

class _TrackedPopen(_original_popen):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        cur_id = getattr(_thread_download_context, "download_id", None)
        if cur_id:
            with _subprocess_lock:
                if cur_id not in _active_subprocesses:
                    _active_subprocesses[cur_id] = set()
                _active_subprocesses[cur_id].add(self.pid)

subprocess.Popen = _TrackedPopen

# Execution log buffer per download & active stream extractors
_execution_logs: Dict[str, List[str]] = {}
_active_extractors: Dict[str, Any] = {}

def get_staging_dir(download_id: str) -> str:
    """Deterministic, persistent staging directory for a specific download."""
    p = STAGING_DIR_ROOT / download_id
    p.mkdir(parents=True, exist_ok=True)
    return str(p)

def cleanup_staging_dir(download_id: str, remove_all: bool = False):
    """Clean up staging directory for a completed or deleted download.
    If remove_all is False, preserves execution.log for complete history logs.
    If remove_all is True, removes the entire directory."""
    p = STAGING_DIR_ROOT / download_id
    if p.exists():
        try:
            if remove_all:
                shutil.rmtree(str(p), ignore_errors=True)
            else:
                for item in os.listdir(str(p)):
                    if item == "execution.log":
                        continue
                    item_p = p / item
                    if item_p.is_dir():
                        shutil.rmtree(str(item_p), ignore_errors=True)
                    else:
                        try:
                            item_p.unlink()
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"Failed to cleanup staging dir for {download_id}: {e}")

# ─── Stream & Execution Log Extraction (YTDLnis Parity) ───

PHASE_LABELS = {
    "extracting_info": "Extracting stream information...",
    "downloading": "Downloading...",
    "merging": "Merging formats...",
    "extracting_audio": "Extracting audio...",
    "adding_metadata": "Adding metadata...",
    "embedding_thumbnail": "Embedding thumbnail...",
    "embedding_subtitles": "Embedding subtitles...",
    "sponsorblock": "Processing SponsorBlock...",
    "splitting_chapters": "Splitting chapters...",
    "fixing_container": "Fixing container...",
    "post_processing": "Post-processing media...",
}

def parse_bytes_str(s: Optional[str]) -> Optional[float]:
    """Parse size or speed string (e.g. '12.5MiB' or '2.5MiB/s') into bytes float."""
    if not s:
        return None
    cleaned = s.strip().rstrip('/s').strip()
    m = re.match(r'^([\d\.]+)\s*([kKmMgGtTpP]?i?B?)$', cleaned, re.IGNORECASE)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2).upper()
    multipliers = {
        '': 1, 'B': 1,
        'K': 1000, 'KB': 1000, 'KIB': 1024,
        'M': 1000**2, 'MB': 1000**2, 'MIB': 1024**2,
        'G': 1000**3, 'GB': 1000**3, 'GIB': 1024**3,
        'T': 1000**4, 'TB': 1000**4, 'TIB': 1024**4,
        'P': 1000**5, 'PB': 1000**5, 'PIB': 1024**5,
    }
    return val * multipliers.get(unit, 1)

def format_bytes_human(b: Union[int, float, None]) -> Optional[str]:
    """Format bytes count into human readable string (e.g. 232.5 MB, 1.4 GB)."""
    if b is None or b < 0:
        return None
    val = float(b)
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if val < 1024.0 or unit == 'TB':
            if unit == 'B':
                return f"{int(val)} B"
            return f"{val:.1f} {unit}"
        val /= 1024.0
    return f"{val:.1f} GB"

def format_speed(bytes_per_sec: Optional[float]) -> Optional[str]:
    """Format bytes per second into human readable string."""
    if bytes_per_sec is None or bytes_per_sec < 0:
        return None
    if bytes_per_sec >= 1024**3:
        return f"{bytes_per_sec / (1024**3):.2f}GiB/s"
    elif bytes_per_sec >= 1024**2:
        return f"{bytes_per_sec / (1024**2):.2f}MiB/s"
    elif bytes_per_sec >= 1024:
        return f"{bytes_per_sec / 1024:.2f}KiB/s"
    else:
        return f"{bytes_per_sec:.0f}B/s"

def format_eta(seconds: Optional[int]) -> Optional[str]:
    """Format ETA seconds into HH:MM:SS or MM:SS."""
    if seconds is None or seconds < 0:
        return None
    hrs = seconds // 3600
    rem = seconds % 3600
    mins = rem // 60
    secs = rem % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def format_seconds(seconds: Union[int, float, None]) -> str:
    """Format seconds into HH:MM:SS or MM:SS."""
    if seconds is None or seconds == float("inf") or seconds < 0:
        return "00:00"
    total_sec = int(round(seconds))
    hrs = total_sec // 3600
    rem = total_sec % 3600
    mins = rem // 60
    secs = rem % 60
    if hrs > 0:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}"
    return f"{mins:02d}:{secs:02d}"

def append_execution_log(download_id: str, line: str):
    """Buffer raw log line in memory and write to disk in staging dir and logs dir if not incognito."""
    if not download_id or not line:
        return
    with _subprocess_lock:
        if download_id not in _execution_logs:
            _execution_logs[download_id] = []
        _execution_logs[download_id].append(line)

    status_obj = download_registry.get(download_id)
    settings = settings_manager.get()
    is_incognito = status_obj.is_incognito if status_obj else settings.incognito_mode

    # During incognito mode, DO NOT save progress or execution logs to disk
    if is_incognito:
        return

    # If log_downloads is disabled in settings, DO NOT write execution logs to disk
    if not getattr(settings, "log_downloads", True):
        return

    # Persist to data/staging/{download_id}/execution.log
    try:
        staging_dir = get_staging_dir(download_id)
        exec_log_path = os.path.join(staging_dir, "execution.log")
        with open(exec_log_path, "a", encoding="utf-8", errors="replace") as f:
            f.write(line + "\n" if not line.endswith("\n") else line)
    except Exception as e:
        logger.debug(f"Failed to write staging execution log: {e}")

    # Also persist to data/logs/{download_id}.log
    try:
        LOGS_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOGS_DIR / f"{download_id}.log", "a", encoding="utf-8", errors="replace") as f:
            f.write(line + "\n" if not line.endswith("\n") else line)
    except Exception:
        pass

def get_execution_log(download_id: str) -> Optional[str]:
    """Retrieve complete execution log for a download from memory or disk."""
    with _subprocess_lock:
        mem_lines = _execution_logs.get(download_id)
        if mem_lines:
            return "".join(l if l.endswith("\n") else l + "\n" for l in mem_lines)

    staging_log = Path(get_staging_dir(download_id)) / "execution.log"
    if staging_log.exists():
        try:
            with open(staging_log, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception:
            pass

    fallback_log = LOGS_DIR / f"{download_id}.log"
    if fallback_log.exists():
        try:
            with open(fallback_log, "r", encoding="utf-8", errors="replace") as f:
                return f.read()
        except Exception:
            pass

    return None

class StreamProcessExtractor(threading.Thread):
    """
    YTDLnis Stream Process Extractor ported to Python.
    Parses live stdout/stderr streams from yt-dlp, aria2c, and FFmpeg using exact YTDLnis regexes.
    Extracts granular phase, progress percentage, ETA, speed, downloaded bytes, total bytes,
    updates DownloadStatus, and emits live updates to WebSocket progress_queue.
    """
    P_YTDLP = re.compile(r'\[download\]\s+(\d+\.?\d*)%\s+of\s+~?([\d\.]+\s*[kKmMgGtT]i?B)?\s+at\s+([\d\.]+\s*[kKmMgGtT]i?B/s)?\s+ETA\s+(?:(\d+):)?(\d+):(\d+)')
    P_ARIA2C = re.compile(r'\[#\w{6}.*\((\d*\.?\d+)%\).*?(?:(\d+)m)?(?:(\d+)s)?\]')
    P_FFMPEG = re.compile(r'size=.*')

    def __init__(
        self,
        download_id: Optional[str] = None,
        stream: Optional[Any] = None,
        callback: Optional[Callable] = None,
        loop: Optional[asyncio.AbstractEventLoop] = None,
        buffer: Optional[Any] = None
    ):
        super().__init__(daemon=True)
        self.download_id = download_id
        self.stream = stream
        self.callback = callback
        self.loop = loop
        self.out_buffer = buffer
        self.progress: float = 0.0
        self.eta_seconds: Optional[int] = None
        self.speed_bytes_per_sec: Optional[float] = None
        self.downloaded_bytes: Optional[float] = None
        self.total_bytes: Optional[float] = None
        self.phase: str = "downloading"
        self.clean_line: str = ""
        self._line_buffer: str = ""
        self._last_logged_progress_pct: Optional[float] = None
        self._has_logged_pp_header: bool = False

        if self.stream is not None:
            self.start()

    def run(self):
        """Background thread stream reader (YTDLnis Kotlin parity)."""
        if not self.stream:
            return
        try:
            current_line = []
            while True:
                chunk = self.stream.read(1)
                if not chunk:
                    break
                c = chunk.decode('utf-8', errors='replace') if isinstance(chunk, bytes) else chunk
                if c in ('\r', '\n'):
                    if current_line:
                        line = "".join(current_line)
                        self.process_line(line)
                        if self.out_buffer is not None and c == '\n':
                            if hasattr(self.out_buffer, 'append'):
                                self.out_buffer.append(line + "\n")
                        current_line.clear()
                else:
                    current_line.append(c)
            if current_line:
                self.process_line("".join(current_line))
        except Exception as e:
            logger.debug(f"StreamProcessExtractor stream ended: {e}")

    def write(self, s: Union[str, bytes]) -> int:
        """File-like / stream interface for stdout/stderr redirection."""
        if isinstance(s, bytes):
            s = s.decode('utf-8', errors='replace')
        self._line_buffer += s
        while '\n' in self._line_buffer or '\r' in self._line_buffer:
            idx_n = self._line_buffer.find('\n')
            idx_r = self._line_buffer.find('\r')
            if idx_n != -1 and (idx_r == -1 or idx_n < idx_r):
                line = self._line_buffer[:idx_n]
                self._line_buffer = self._line_buffer[idx_n+1:]
                if line:
                    self.process_line(line)
            elif idx_r != -1:
                line = self._line_buffer[:idx_r]
                if idx_r + 1 < len(self._line_buffer) and self._line_buffer[idx_r+1] == '\n':
                    self._line_buffer = self._line_buffer[idx_r+2:]
                else:
                    self._line_buffer = self._line_buffer[idx_r+1:]
                if line:
                    self.process_line(line)
        return len(s)

    def flush(self):
        """Flush remaining buffered text."""
        if self._line_buffer.strip():
            self.process_line(self._line_buffer.strip())
            self._line_buffer = ""

    def close(self):
        self.flush()

    @property
    def buffer(self):
        """Supports yt-dlp write_string accessing out.buffer."""
        return self

    def process_line(self, line: str) -> dict:
        """
        Process a single output line:
        1. Strip ANSI codes & sanitize clean_line
        2. Buffer into execution log
        3. Match yt-dlp, aria2c, and FFmpeg regexes
        4. Detect granular phase
        5. Update DownloadStatus & emit to progress_queue
        6. Return parsed metrics dict
        """
        if not line:
            return {
                "progress": self.progress,
                "eta_seconds": self.eta_seconds,
                "speed_bytes_per_sec": self.speed_bytes_per_sec,
                "downloaded_bytes": self.downloaded_bytes,
                "total_bytes": self.total_bytes,
                "clean_line": "",
                "phase": self.phase,
            }

        # 1. Clean line (strip ANSI escape codes)
        clean = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]|\033\[[0-9;]*[a-zA-Z]', '', line).strip()
        self.clean_line = clean

        clean_lower = clean.lower()

        # 2. YTDLnis Regex Matching
        # A. yt-dlp match
        m_ytdlp = self.P_YTDLP.search(clean)
        is_progress_line = False
        if m_ytdlp:
            try:
                self.progress = float(m_ytdlp.group(1))
                is_progress_line = True
            except (ValueError, TypeError):
                pass

            total_str = m_ytdlp.group(2)
            if total_str:
                tb = parse_bytes_str(total_str)
                if tb is not None:
                    self.total_bytes = tb
                    self.downloaded_bytes = (self.progress / 100.0) * tb

            speed_str = m_ytdlp.group(3)
            if speed_str:
                sb = parse_bytes_str(speed_str)
                if sb is not None:
                    self.speed_bytes_per_sec = sb

            h = int(m_ytdlp.group(4)) if m_ytdlp.group(4) else 0
            m = int(m_ytdlp.group(5)) if m_ytdlp.group(5) else 0
            s = int(m_ytdlp.group(6)) if m_ytdlp.group(6) else 0
            self.eta_seconds = h * 3600 + m * 60 + s
            self.phase = "downloading"

        else:
            # B. aria2c match
            m_aria = self.P_ARIA2C.search(clean)
            if m_aria:
                try:
                    self.progress = float(m_aria.group(1))
                except (ValueError, TypeError):
                    pass
                m = int(m_aria.group(2)) if m_aria.group(2) else 0
                s = int(m_aria.group(3)) if m_aria.group(3) else 0
                self.eta_seconds = m * 60 + s
                self.phase = "downloading"

            # C. FFmpeg transcode/muxing match
            m_ffmpeg = self.P_FFMPEG.search(clean)
            if m_ffmpeg:
                self.progress = max(self.progress, 99.0)
                self.phase = "merging"

        # 4. Detect Granular Phases
        if "[youtube]" in clean_lower or "[info]" in clean_lower:
            self.phase = "extracting_info"
        elif "[download]" in clean_lower:
            if not m_ytdlp and not (locals().get('m_aria')):
                self.phase = "downloading"
        elif "[merger]" in clean_lower:
            self.phase = "merging"
        elif "[extractaudio]" in clean_lower:
            self.phase = "extracting_audio"
        elif "[metadata]" in clean_lower:
            self.phase = "adding_metadata"
        elif "[thumbnails]" in clean_lower or "[thumbnailsconvertor]" in clean_lower or "[embedthumbnail]" in clean_lower:
            self.phase = "embedding_thumbnail"
        elif "[embedsubtitle]" in clean_lower or "[subtitlesconvertor]" in clean_lower:
            self.phase = "embedding_subtitles"
        elif "[sponsorblock]" in clean_lower or "[modifychapters]" in clean_lower:
            self.phase = "sponsorblock"
        elif "[splitchapters]" in clean_lower:
            self.phase = "splitting_chapters"
        elif "[fixupm3u8]" in clean_lower or "[fixupm4a]" in clean_lower or "[fixup" in clean_lower:
            self.phase = "fixing_container"

        # Check if line is a post-processing operation (yt-dlp post-processors or temporary chunk deletions)
        is_pp_activity = bool(
            re.search(r'\[(Merger|Metadata|ThumbnailsConvertor|EmbedThumbnail|ExtractAudio|FixupM3u8|FixupM4a|ModifyChapters|SplitChapters|SponsorBlock)\]', clean, re.IGNORECASE) or
            re.search(r'Deleting original file', clean, re.IGNORECASE)
        )

        # 4. Preserve raw log line in memory and on disk (throttles intermediate fraction-percent spam)
        if self.download_id and clean:
            should_log = True
            if is_progress_line and "[download]" in clean:
                if self._last_logged_progress_pct is not None and abs(self.progress - self._last_logged_progress_pct) < 5.0 and self.progress < 100.0:
                    should_log = False
                else:
                    self._last_logged_progress_pct = self.progress
            if should_log:
                line_to_log = clean
                if is_pp_activity:
                    if not self._has_logged_pp_header:
                        self._has_logged_pp_header = True
                        append_execution_log(self.download_id, "=" * 80)
                        append_execution_log(self.download_id, "[POSTPROCESS] Stream extraction completed; executing post-processing tasks...")
                    clean_display = re.sub(r'^\[(DEBUG|INFO|debug|info)\]\s*', '', clean)
                    if re.search(r'Deleting original file', clean_display, re.IGNORECASE):
                        line_to_log = f"[POSTPROCESS] [Cleanup] {clean_display}"
                    elif not clean_display.startswith("[POSTPROCESS]"):
                        line_to_log = f"[POSTPROCESS] {clean_display}"
                    else:
                        line_to_log = clean_display

                append_execution_log(self.download_id, line_to_log)

        # 5. Update DownloadStatus and emit to progress_queue
        if self.download_id and self.download_id in download_registry:
            status_obj = download_registry[self.download_id]
            if self.progress > 0:
                status_obj.percent = round(self.progress, 1)
            status_obj.phase = self.phase
            if self.downloaded_bytes is not None:
                status_obj.downloaded_bytes = self.downloaded_bytes
            if self.total_bytes is not None:
                if status_obj.total_bytes is None or self.total_bytes > status_obj.total_bytes:
                    status_obj.total_bytes = self.total_bytes
                    status_obj.filesize = format_bytes_human(status_obj.total_bytes)
            if self.speed_bytes_per_sec is not None:
                status_obj.speed_bytes_per_sec = self.speed_bytes_per_sec
                status_obj.speed = format_speed(self.speed_bytes_per_sec)
            if self.eta_seconds is not None:
                status_obj.eta_seconds = self.eta_seconds
                status_obj.eta = format_eta(self.eta_seconds)

            readable = PHASE_LABELS.get(self.phase, clean)
            status_obj.live_status_text = readable

            # Status transitions based on phase
            if self.phase == "downloading" and status_obj.status == DownloadStatusEnum.QUEUED:
                status_obj.status = DownloadStatusEnum.DOWNLOADING
            elif self.phase in ("merging", "extracting_audio", "adding_metadata", "embedding_thumbnail",
                                "embedding_subtitles", "sponsorblock", "splitting_chapters", "fixing_container"):
                if status_obj.status == DownloadStatusEnum.DOWNLOADING:
                    status_obj.status = DownloadStatusEnum.PROCESSING

            if progress_queue and self.loop:
                try:
                    self.loop.call_soon_threadsafe(
                        progress_queue.put_nowait,
                        status_obj.model_dump(mode='json')
                    )
                except Exception:
                    pass

        # 6. Optional callback (YTDLnis Kotlin callback parity: progress, eta, line)
        if self.callback:
            try:
                self.callback(self.progress, self.eta_seconds or -1, clean)
            except Exception:
                pass

        return {
            "progress": self.progress,
            "eta_seconds": self.eta_seconds,
            "speed_bytes_per_sec": self.speed_bytes_per_sec,
            "downloaded_bytes": self.downloaded_bytes,
            "total_bytes": self.total_bytes,
            "clean_line": clean,
            "phase": self.phase,
        }

# Batch & Queue Management Functions
def pause_all_downloads(loop: asyncio.AbstractEventLoop = None) -> int:
    """Pause all active and queued downloads."""
    count = 0
    with _queue_lock:
        target_ids = [
            did for did, s in download_registry.items()
            if s.status in [DownloadStatusEnum.DOWNLOADING, DownloadStatusEnum.PROCESSING, DownloadStatusEnum.QUEUED]
        ]
    for did in target_ids:
        if cancel_download(did, is_pause=True, loop=loop):
            count += 1
    return count

def resume_all_downloads() -> int:
    """Resume all paused downloads."""
    count = 0
    with _queue_lock:
        target_ids = [
            did for did, s in download_registry.items()
            if s.status == DownloadStatusEnum.PAUSED
        ]
    for did in target_ids:
        if resume_download(did):
            count += 1
    return count

def purge_incognito_data(loop: Optional[asyncio.AbstractEventLoop] = None) -> List[str]:
    """
    Purge all incognito downloads, staging partial files, and memory records.
    Completed media files are preserved in the user's downloads folder.
    Called when incognito mode is turned off.
    """
    purged_ids = []
    with _queue_lock:
        incognito_items = [
            (did, s) for did, s in list(download_registry.items())
            if getattr(s, "is_incognito", False)
        ]

    for did, status in incognito_items:
        purged_ids.append(did)
        # Cancel if active or paused
        if status.status in (DownloadStatusEnum.QUEUED, DownloadStatusEnum.DOWNLOADING, DownloadStatusEnum.PROCESSING, DownloadStatusEnum.PAUSED, DownloadStatusEnum.SCHEDULED):
            try:
                cancel_download(did, is_pause=False, loop=loop)
            except Exception as e:
                logger.warning(f"Error cancelling incognito download {did}: {e}")

        # Delete any temporary / partial files on disk if download was incomplete/cancelled/errored
        if status.status != DownloadStatusEnum.FINISHED and status.filename and os.path.exists(status.filename):
            if status.filename.endswith((".part", ".ytdl", ".temp")):
                try:
                    os.remove(status.filename)
                    logger.info(f"Purged incognito partial file: {status.filename}")
                except Exception as e:
                    logger.warning(f"Failed to delete incognito partial file {status.filename}: {e}")

        # Clean up staging directory completely (wipes all partial .part files, caches, etc.)
        cleanup_staging_dir(did, remove_all=True)

        # Remove in-memory logs
        with _subprocess_lock:
            _execution_logs.pop(did, None)

        # Clean up disk log if it existed
        disk_log = LOGS_DIR / f"{did}.log"
        if disk_log.exists():
            try:
                os.remove(disk_log)
            except Exception:
                pass

        # Remove from registries and pending queue
        with _queue_lock:
            download_registry.pop(did, None)
            _download_requests.pop(did, None)
            if did in _pending_queue:
                _pending_queue.remove(did)

    _save_history()

    if purged_ids and progress_queue:
        try:
            if loop and loop.is_running():
                loop.call_soon_threadsafe(
                    progress_queue.put_nowait,
                    {"type": "deleted", "ids": purged_ids}
                )
            else:
                try:
                    cur_loop = asyncio.get_running_loop()
                    if cur_loop and cur_loop.is_running():
                        cur_loop.call_soon_threadsafe(
                            progress_queue.put_nowait,
                            {"type": "deleted", "ids": purged_ids}
                        )
                except RuntimeError:
                    pass
        except Exception as e:
            logger.warning(f"Failed to broadcast incognito deletion: {e}")

    logger.info(f"Purged {len(purged_ids)} incognito download(s).")
    return purged_ids

def perform_auto_cleanup(loop: Optional[asyncio.AbstractEventLoop] = None) -> List[str]:
    """
    Check finished downloads and auto-delete files and cards that exceed auto_cleanup_timer.
    Only active when enable_browser_download is True and auto_cleanup_timer > 0.
    Returns list of cleaned up download IDs.
    """
    settings = settings_manager.get()
    if not getattr(settings, "enable_browser_download", False):
        return []
    cleanup_minutes = getattr(settings, "auto_cleanup_timer", 0)
    if not cleanup_minutes or cleanup_minutes <= 0:
        return []

    now = datetime.now()
    to_delete = []

    with _queue_lock:
        for did, status in list(download_registry.items()):
            if status.status == DownloadStatusEnum.FINISHED:
                comp_dt = None
                if status.completed_at:
                    try:
                        comp_dt = datetime.fromisoformat(status.completed_at)
                    except Exception:
                        pass
                elif status.filename:
                    resolved = resolve_media_path(status.filename, did)
                    if resolved and os.path.exists(resolved):
                        try:
                            comp_dt = datetime.fromtimestamp(os.path.getmtime(resolved))
                        except Exception:
                            pass

                if comp_dt:
                    elapsed_seconds = (now - comp_dt).total_seconds()
                    if elapsed_seconds >= cleanup_minutes * 60:
                        to_delete.append((did, status.filename))

    if not to_delete:
        return []

    cleaned_ids = []
    for did, filename in to_delete:
        cleaned_ids.append(did)
        # Delete finished media file from disk
        resolved_file = resolve_media_path(filename, did)
        if resolved_file and os.path.exists(resolved_file):
            try:
                os.remove(resolved_file)
                logger.info(f"Auto-cleanup deleted finished file: {resolved_file}")
            except Exception as e:
                logger.warning(f"Auto-cleanup failed to delete file {resolved_file}: {e}")

        # Clean up staging directory completely
        cleanup_staging_dir(did, remove_all=True)

        # Clear in-memory execution logs
        with _subprocess_lock:
            _execution_logs.pop(did, None)

        disk_log = LOGS_DIR / f"{did}.log"
        if disk_log.exists():
            try:
                os.remove(disk_log)
            except Exception:
                pass

        # Remove from registries and pending queue
        with _queue_lock:
            download_registry.pop(did, None)
            _download_requests.pop(did, None)
            if did in _pending_queue:
                _pending_queue.remove(did)

    _save_history()

    if cleaned_ids and progress_queue:
        msg = {"type": "deleted", "ids": cleaned_ids}
        try:
            if loop and loop.is_running():
                loop.call_soon_threadsafe(progress_queue.put_nowait, msg)
            else:
                cur_loop = None
                try:
                    cur_loop = asyncio.get_running_loop()
                except RuntimeError:
                    pass
                if cur_loop and cur_loop.is_running():
                    cur_loop.call_soon_threadsafe(progress_queue.put_nowait, msg)
        except Exception as e:
            logger.warning(f"Failed to broadcast auto-cleanup deletion: {e}")

    logger.info(f"Auto-cleanup removed {len(cleaned_ids)} finished download(s).")
    return cleaned_ids

def reorder_download(download_id: str, position: Optional[Any] = None, action: Optional[str] = None) -> bool:
    """
    Reorder a download in the pending queue and/or registry.
    Supports position (0-based integer or 'top'/'bottom') or action: 'top' | 'bottom'.
    """
    with _queue_lock:
        act = action
        pos = position
        if isinstance(position, str) and position in ("top", "bottom"):
            act = position
            pos = None
        elif isinstance(position, (int, float)):
            pos = int(position)

        found = False
        if download_id in _pending_queue:
            _pending_queue.remove(download_id)
            if act == "top":
                _pending_queue.insert(0, download_id)
            elif act == "bottom":
                _pending_queue.append(download_id)
            elif pos is not None:
                idx = max(0, min(pos, len(_pending_queue)))
                _pending_queue.insert(idx, download_id)
            else:
                _pending_queue.append(download_id)
            found = True

        if download_id in download_registry:
            items = list(download_registry.items())
            idx = next((i for i, (k, _) in enumerate(items) if k == download_id), -1)
            if idx != -1:
                item = items.pop(idx)
                if act == "top":
                    items.insert(0, item)
                elif act == "bottom":
                    items.append(item)
                elif pos is not None:
                    target_idx = max(0, min(pos, len(items)))
                    items.insert(target_idx, item)
                else:
                    items.append(item)
                download_registry.clear()
                download_registry.update(dict(items))
                found = True

        if found:
            _save_history()
            if progress_queue:
                try:
                    loop = None
                    try:
                        loop = asyncio.get_running_loop()
                    except RuntimeError:
                        pass
                    if loop and loop.is_running():
                        loop.call_soon_threadsafe(
                            progress_queue.put_nowait,
                            {"type": "reordered", "queue": list(_pending_queue), "download_id": download_id}
                        )
                except Exception:
                    pass
            return True
        return False

# Backward-compatible alias
reorder_queue = reorder_download

# Queue manager for concurrent download limits
_pending_queue = []
_active_downloads = set()
_download_requests = {}
_queue_lock = threading.RLock()


def resolve_media_path(filename: Optional[str], download_id: Optional[str] = None) -> Optional[str]:
    """
    Resolve media file path on disk, gracefully handling Docker container mounts,
    relative paths, and cross-platform path differences (e.g. Windows paths in Linux container).
    """
    if not filename:
        return None
    if os.path.exists(filename):
        return filename

    # Extract base file name handling both Windows and POSIX separators
    base_name = os.path.basename(str(filename).replace("\\", "/"))
    settings = settings_manager.get()
    
    candidates = [
        settings.download_dir,
        "/downloads",
        "Downloads",
        os.path.join(str(Path.home()), "Downloads"),
        os.path.join(str(Path(__file__).parent.parent), "Downloads"),
        str(DATA_DIR / "staging" / download_id) if download_id else None,
    ]
    
    for cand in candidates:
        if cand and os.path.isdir(cand):
            target = os.path.join(cand, base_name)
            if os.path.exists(target):
                return target
    return None


def get_all_downloads() -> Dict[str, DownloadStatus]:
    """Get dictionary of all active and history downloads, injecting file_exists_on_disk for finished items."""
    for status in download_registry.values():
        if status.status == DownloadStatusEnum.FINISHED:
            resolved = resolve_media_path(status.filename, status.id)
            if resolved:
                status.file_exists_on_disk = True
                if status.filename != resolved:
                    status.filename = resolved
            else:
                status.file_exists_on_disk = False
    return download_registry


def clean_search_query(name: str) -> str:
    """Clean filename/title for high-accuracy iTunes metadata and lyrics API queries without losing artist context."""
    if not name:
        return ""
    clean = os.path.splitext(name)[0]
    # Remove bracketed/parenthetical clutter
    clean = re.sub(r'\[.*?\]', ' ', clean)
    clean = re.sub(r'\(.*?(?:official|video|audio|lyric|from|movie|4k|hd|remix|full|visualizer).*?\)', ' ', clean, flags=re.IGNORECASE)
    clean = re.sub(r'\(\d+\)', ' ', clean)
    # Remove clutter phrases
    clean = re.sub(r'\b(?:official\s+(?:video|audio|music\s+video)|lyric\s+video|full\s+video|visualizer|4k|hd|hq)\b', ' ', clean, flags=re.IGNORECASE)
    # Replace delimiter symbols with space rather than truncating title
    clean = re.sub(r'[|｜•·/]+', ' ', clean)
    clean = re.sub(r'\s+', ' ', clean).strip()
    return clean


def fetch_auto_metadata(
    query: str,
    expected_artist: Optional[str] = None,
    expected_title: Optional[str] = None
) -> Optional[dict]:
    """
    Fetch official song metadata (Title, Artist, Album, Release Year) from iTunes Search API.
    Performs strict artist and title verification to prevent cross-artist false matches.
    """
    if not query:
        return None
    try:
        clean_q = clean_search_query(query)
        if expected_artist and expected_artist.strip():
            clean_art = clean_search_query(expected_artist)
            if clean_art.lower() not in clean_q.lower():
                clean_q = f"{clean_art} {clean_q}"

        url = f"https://itunes.apple.com/search?term={urllib.parse.quote(clean_q)}&media=music&entity=song&limit=5"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=5) as response:
            data = json.loads(response.read().decode())
            results = data.get('results', [])
            if not results:
                return None

            matched_track = None
            if expected_artist and expected_artist.strip():
                exp_art_norm = re.sub(r'[^a-z0-9]', '', expected_artist.lower())
                artist_matches = []
                for t in results:
                    cand_art_norm = re.sub(r'[^a-z0-9]', '', t.get('artistName', '').lower())
                    if exp_art_norm and cand_art_norm and (exp_art_norm in cand_art_norm or cand_art_norm in exp_art_norm):
                        artist_matches.append(t)

                if not artist_matches:
                    logger.info(f"iTunes metadata rejected: None of the {len(results)} results matched expected artist '{expected_artist}'")
                    return None

                # If expected title provided, pick exact track match
                if expected_title and expected_title.strip():
                    exp_t_norm = re.sub(r'[^a-z0-9]', '', expected_title.lower())
                    for t in artist_matches:
                        cand_t_norm = re.sub(r'[^a-z0-9]', '', t.get('trackName', '').lower())
                        if exp_t_norm == cand_t_norm:
                            matched_track = t
                            break

                if not matched_track:
                    matched_track = artist_matches[0]
            else:
                matched_track = results[0]

            if matched_track:
                artwork_url = matched_track.get('artworkUrl100', '')
                if artwork_url:
                    artwork_url = artwork_url.replace('100x100bb', '600x600bb')
                return {
                    'TITLE': matched_track.get('trackName', ''),
                    'ARTIST': matched_track.get('artistName', ''),
                    'ALBUM': matched_track.get('collectionName', ''),
                    'DATE': matched_track.get('releaseDate', '')[:4],
                    'ARTWORK_URL': artwork_url,
                    'GENRE': matched_track.get('primaryGenreName', ''),
                    'COMPOSER': matched_track.get('artistName', '')
                }
    except Exception as e:
        logger.warning(f"iTunes metadata fetch error for '{query}': {e}")
    return None


def extract_ytdlp_audio_metadata(info_dict: Optional[dict], status_obj: Optional[Any] = None) -> dict:
    """
    Extract accurate audio track metadata directly from yt-dlp's internal info dictionary,
    matching YTDLnis's extractor logic without relying on external third-party catalog APIs.
    """
    if not info_dict:
        info_dict = {}

    raw_title = (info_dict.get("title") or getattr(status_obj, "title", None) or "").strip()
    raw_track = (info_dict.get("track") or "").strip()
    raw_artist = (info_dict.get("artist") or info_dict.get("creator") or "").strip()
    raw_artists = info_dict.get("artists")
    raw_album = (info_dict.get("album") or "").strip()
    raw_uploader = (info_dict.get("uploader") or info_dict.get("channel") or getattr(status_obj, "uploader", None) or "").strip()
    raw_genre = (info_dict.get("genre") or "").strip()

    GENERIC_LABELS = {
        'yrf', 't-series', 'tseries', 'zee music company', 'sony music india',
        'sony music', 'tips official', 'tips', 'geet mp3', 'geetmp3',
        'speed records', 'white hill music', 'eros now', 'saregama',
        'saregama music', 'yrf spy universe', 'vevo'
    }

    # 1. Clean uploader if topic channel ("Artist - Topic" convention on YouTube Music)
    clean_uploader = re.sub(r'\s*-\s*Topic$', '', raw_uploader, flags=re.IGNORECASE).strip()
    is_label = clean_uploader.lower() in GENERIC_LABELS or clean_uploader.lower().endswith(" vevo")

    # 2. Resolve Artist
    artist = ""
    if raw_artist:
        artist = raw_artist
    elif isinstance(raw_artists, list) and raw_artists:
        artist = ", ".join([str(a).strip() for a in raw_artists if str(a).strip()])
    elif clean_uploader and not is_label:
        artist = clean_uploader

    # 3. Resolve Title and Album
    title = ""
    album = raw_album

    if raw_track:
        title = raw_track
    else:
        # Check pipe-separated format common in music videos:
        # e.g. "Song Name | Movie/Album | Artist / Singer"
        main_part = raw_title
        if '|' in raw_title:
            segs = [s.strip() for s in raw_title.split('|') if s.strip()]
            main_part = segs[0]
            if not album and len(segs) >= 2:
                album = segs[1]
            if (not artist or is_label) and len(segs) >= 3:
                cand_last = segs[-1]
                if cand_last.lower() not in GENERIC_LABELS:
                    artist = cand_last

        # Parse main_part which may be 'Artist - Song' or 'Song : Artist'
        if ' - ' in main_part:
            parts = main_part.split(' - ', 1)
            cand_art = parts[0].strip()
            cand_title = parts[1].strip()
            if not artist or is_label:
                artist = cand_art
            title = cand_title
        elif ' : ' in main_part:
            parts = main_part.split(' : ', 1)
            cand_title = parts[0].strip()
            cand_art = re.split(r'[\(\[]', parts[1])[0].strip()
            if not artist or is_label:
                artist = cand_art
            title = cand_title
        else:
            title = main_part

    # Clean clutter expressions from title if track wasn't explicitly tagged by platform
    if not raw_track and title:
        title = re.sub(r'\s*\[.*?\]', ' ', title)
        title = re.sub(r'\s*\(.*?(?:official|video|audio|lyric|from|movie|4k|hd|remix|full|visualizer).*?\)', ' ', title, flags=re.IGNORECASE)
        title = re.sub(r'\b(?:official\s+(?:video|audio|music\s+video)|lyric\s+video|full\s+video|visualizer|4k|hd|hq|song)\b', ' ', title, flags=re.IGNORECASE)
        title = re.sub(r'\s+', ' ', title).strip()

    if not title:
        title = raw_title or "Unknown Title"

    if not artist:
        artist = clean_uploader or (raw_uploader if raw_uploader else "Unknown Artist")

    if not album:
        pl_title = info_dict.get("playlist_title") or info_dict.get("playlist")
        if pl_title and str(pl_title).strip():
            album = str(pl_title).strip()
        else:
            album = title

    # 4. Resolve Primary Artist (first artist before comma, as in YTDLnis first_artist extraction)
    first_artist = ""
    if artist:
        first_artist = re.split(r',\s+', artist)[0].strip()

    # 5. Resolve Date / Year
    date_val = ""
    if info_dict.get("release_year"):
        date_val = str(info_dict["release_year"])
    elif info_dict.get("release_date"):
        date_val = str(info_dict["release_date"])[:4]
    elif info_dict.get("upload_date"):
        date_val = str(info_dict["upload_date"])[:4]

    # 6. Track Number
    track_num = info_dict.get("track_number") or info_dict.get("playlist_index") or None

    return {
        'TITLE': title,
        'ARTIST': artist,
        'ALBUM': album,
        'DATE': date_val,
        'GENRE': raw_genre,
        'COMPOSER': artist,
        'ALBUM_ARTIST': first_artist or artist,
        'FIRST_ARTIST': first_artist or artist,
        'TRACK_NUMBER': track_num,
        'COMMENT': f"Downloaded via yt-dlp App. Source: {getattr(status_obj, 'url', '') if status_obj else ''}"
    }


def fetch_synced_lyrics(query: str) -> Optional[str]:
    """Fetch synchronized (.lrc) or unsynchronized lyrics using syncedlyrics library."""
    if not query:
        return None
    clean_q = clean_search_query(query)
    if syncedlyrics:
        try:
            logger.info(f"Searching synced lyrics for: '{clean_q}'...")
            lrc = syncedlyrics.search(clean_q)
            if lrc:
                return lrc
        except Exception as e:
            logger.warning(f"Syncedlyrics search error for '{clean_q}': {e}")
    return None


def apply_mutagen_audio_tags(
    filepath: str,
    thumbnail_path: Optional[str],
    lyrics_text: Optional[str],
    meta_dict: Optional[dict],
    default_title: str
):
    """
    Apply cover art, synchronized/unsynchronized lyrics, and track metadata using Mutagen as the FINAL STEP.
    Executing AFTER FFmpeg completes ensures FFmpeg never overwrites or strips cover art and lyrics!
    """
    if not os.path.exists(filepath):
        return

    ext = os.path.splitext(filepath)[1].lower()
    
    title = (meta_dict.get('TITLE') if meta_dict else None) or clean_search_query(default_title) or default_title
    artist = (meta_dict.get('ARTIST') if meta_dict else None) or ""
    album = (meta_dict.get('ALBUM') if meta_dict else None) or title
    year = (meta_dict.get('DATE') if meta_dict else None) or ""

    # Read poster image bytes
    image_data = None
    mime_type = "image/jpeg"
    if thumbnail_path and os.path.exists(thumbnail_path):
        try:
            with open(thumbnail_path, "rb") as img_f:
                image_data = img_f.read()
            if thumbnail_path.endswith(".png"):
                mime_type = "image/png"
        except Exception as e:
            logger.warning(f"Error reading poster image for Mutagen: {e}")

    # 1. MP3 Files (.mp3)
    if ext == ".mp3":
        try:
            audio = mutagen.File(filepath)
            if audio is None:
                return
            if audio.tags is None:
                audio.add_tags()

            genre = (meta_dict.get('GENRE') if meta_dict else None) or ""
            composer = (meta_dict.get('COMPOSER') if meta_dict else None) or ""
            comment = (meta_dict.get('COMMENT') if meta_dict else None) or ""
            album_artist = (meta_dict.get('ALBUM_ARTIST') if meta_dict else None) or (meta_dict.get('FIRST_ARTIST') if meta_dict else None) or ""
            track_num = meta_dict.get('TRACK_NUMBER') if meta_dict else None

            mp3_tags = {'TITLE': TIT2, 'ARTIST': TPE1, 'ALBUM': TALB, 'DATE': TDRC, 'GENRE': TCON, 'COMPOSER': TCOM}
            if album_artist:
                mp3_tags['ALBUM_ARTIST'] = TPE2

            meta_map = {'TITLE': title, 'ARTIST': artist, 'ALBUM': album, 'DATE': year, 'GENRE': genre, 'COMPOSER': composer, 'ALBUM_ARTIST': album_artist}

            for key, frame_class in mp3_tags.items():
                val = meta_map.get(key)
                if val:
                    audio.tags.delall(frame_class.__name__)
                    audio.tags.add(frame_class(encoding=3, text=str(val)))

            if track_num:
                audio.tags.delall('TRCK')
                audio.tags.add(TRCK(encoding=3, text=str(track_num)))

            if comment:
                audio.tags.delall('COMM')
                audio.tags.add(COMM(encoding=3, lang='eng', desc='', text=comment))

            if image_data:
                audio.tags.delall('APIC')
                audio.tags.add(APIC(
                    encoding=3,
                    mime=mime_type,
                    type=3,  # Front Cover
                    desc='Cover',
                    data=image_data
                ))

            if lyrics_text:
                audio.tags.delall('USLT')
                audio.tags.add(USLT(encoding=3, lang='eng', desc='', text=lyrics_text))

            audio.save()
            logger.info(f"✅ Mutagen: Successfully embedded metadata, cover art, and lyrics in {filepath}")
        except Exception as e:
            logger.warning(f"⚠️ Mutagen MP3 error on {filepath}: {e}")

    # 2. M4A / AAC / MP4 Files (.m4a, .aac)
    elif ext in ('.m4a', '.aac', '.mp4'):
        try:
            import mutagen.mp4 as mp4
            audio = mp4.MP4(filepath)

            if title:
                audio['\xa9nam'] = [title]
            if artist:
                audio['\xa9ART'] = [artist]
            if album:
                audio['\xa9alb'] = [album]
            if year:
                audio['\xa9day'] = [str(year)]
            if meta_dict:
                if meta_dict.get('ALBUM_ARTIST'):
                    audio['aART'] = [str(meta_dict['ALBUM_ARTIST'])]
                if meta_dict.get('TRACK_NUMBER'):
                    try:
                        audio['trkn'] = [(int(meta_dict['TRACK_NUMBER']), 0)]
                    except Exception:
                        pass
                if meta_dict.get('GENRE'):
                    audio['\xa9gen'] = [meta_dict['GENRE']]
                if meta_dict.get('COMPOSER'):
                    audio['\xa9wrt'] = [meta_dict['COMPOSER']]
                if meta_dict.get('COMMENT'):
                    audio['\xa9cmt'] = [meta_dict['COMMENT']]

            if image_data:
                fmt = mp4.MP4Cover.FORMAT_PNG if mime_type == "image/png" else mp4.MP4Cover.FORMAT_JPEG
                audio['covr'] = [mp4.MP4Cover(image_data, imageformat=fmt)]

            if lyrics_text:
                audio['\xa9lyr'] = [lyrics_text]

            audio.save()
            logger.info(f"✅ Mutagen: Successfully embedded metadata, cover art, and lyrics in {filepath}")
        except Exception as e:
            logger.warning(f"⚠️ Mutagen M4A error on {filepath}: {e}")

    # 3. OPUS / FLAC / OGG Files (.opus, .ogg, .flac)
    elif ext in ('.opus', '.ogg', '.flac'):
        try:
            from mutagen.flac import FLAC, Picture
            import base64

            if ext == '.flac':
                audio = FLAC(filepath)
                if image_data:
                    pic = Picture()
                    pic.data = image_data
                    pic.type = 3
                    pic.mime = mime_type
                    audio.add_picture(pic)
            else:
                audio = mutagen.File(filepath)
                if image_data and audio is not None:
                    pic = Picture()
                    pic.data = image_data
                    pic.type = 3
                    pic.mime = mime_type
                    pic_data = pic.write()
                    encoded_data = base64.b64encode(pic_data).decode("ascii")
                    audio["metadata_block_picture"] = [encoded_data]

            if audio is not None:
                if title:
                    audio['TITLE'] = [title]
                if artist:
                    audio['ARTIST'] = [artist]
                if album:
                    audio['ALBUM'] = [album]
                if year:
                    audio['DATE'] = [str(year)]
                if meta_dict:
                    if meta_dict.get('ALBUM_ARTIST'):
                        audio['ALBUMARTIST'] = [str(meta_dict['ALBUM_ARTIST'])]
                        audio['ALBUM_ARTIST'] = [str(meta_dict['ALBUM_ARTIST'])]
                    if meta_dict.get('TRACK_NUMBER'):
                        audio['TRACKNUMBER'] = [str(meta_dict['TRACK_NUMBER'])]
                    if meta_dict.get('GENRE'):
                        audio['GENRE'] = [meta_dict['GENRE']]
                    if meta_dict.get('COMPOSER'):
                        audio['COMPOSER'] = [meta_dict['COMPOSER']]
                    if meta_dict.get('COMMENT'):
                        audio['COMMENT'] = [meta_dict['COMMENT']]
                        audio['DESCRIPTION'] = [meta_dict['COMMENT']]
                if lyrics_text:
                    audio['LYRICS'] = [lyrics_text]
                    audio['SYNCEDLYRICS'] = [lyrics_text]

                audio.save()
                logger.info(f"✅ Mutagen: Successfully embedded metadata, cover art, and lyrics in {filepath}")
        except Exception as e:
            logger.warning(f"⚠️ Mutagen FLAC/OGG error on {filepath}: {e}")


class YtDlpLogger:
    def __init__(self, download_id: str = None, is_audio: bool = False, loop: asyncio.AbstractEventLoop = None, extractor: Optional[StreamProcessExtractor] = None, is_incognito: bool = False):
        self.download_id = download_id
        self.is_audio = is_audio
        self._loop = loop
        self.extractor = extractor
        self.is_incognito = is_incognito
        if not self.extractor and self.download_id:
            self.extractor = _active_extractors.get(self.download_id)
        settings = settings_manager.get()
        log_downloads_enabled = getattr(settings, "log_downloads", True)
        if self.download_id and not self.is_incognito and log_downloads_enabled:
            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            self.log_file = os.path.join(str(LOGS_DIR), f"{self.download_id}.log")
        else:
            self.log_file = None

    def _write(self, level, msg):
        formatted = f"[{level}] {msg}"
        if not self.extractor and self.download_id:
            self.extractor = _active_extractors.get(self.download_id)
        if self.extractor:
            self.extractor.process_line(formatted)
        elif self.download_id:
            append_execution_log(self.download_id, formatted)

    def info(self, msg):
        self._write("INFO", msg)

    def debug(self, msg):
        self._write("DEBUG", msg)
        
    def warning(self, msg):
        self._write("WARN", msg)
        
    def error(self, msg):
        self._write("ERROR", msg)
        logger.error(f"yt-dlp: {msg}")


def normalize_url(url_str: str) -> str:
    """
    Clean, sanitize, and normalize YouTube & YouTube Music URLs (tabbed URLs, shorts, shares, playlists, embeds, live).
    Preserves music.youtube.com for YouTube Music URLs!
    For non-YouTube URLs (Instagram, TikTok, Twitter/X, Vimeo, Facebook, Soundcloud, etc.), returns original URL untouched!
    """
    if not url_str:
        return url_str
    url_str = url_str.strip()
    
    import cookie_service
    domain = cookie_service.get_domain_from_url(url_str).lower()
    if not ("youtube.com" in domain or "youtu.be" in domain):
        return url_str
        
    try:
        pattern = r'(?:v=|\/shorts\/|\/embed\/|\/live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})'
        match = re.search(pattern, url_str)
        if match:
            video_id = match.group(1)
            if "music.youtube.com" in url_str:
                return f"https://music.youtube.com/watch?v={video_id}"
            return f"https://www.youtube.com/watch?v={video_id}"
    except Exception as e:
        logger.warning(f"URL normalization error for {url}: {e}")
        
    return url_str


# ─── Duplicate Prevention & Download Archive (YTDLnis Parity) ───

def get_archive_file_path(settings: Optional[AppSettings] = None) -> Path:
    """Return the resolved Path to the yt-dlp download archive file."""
    if settings is None:
        settings = settings_manager.get()
    raw = getattr(settings, "download_archive_path", None) or "data/download_archive.txt"
    p = Path(raw)
    if not p.is_absolute():
        p = Path(__file__).parent / p
    return p


def get_archive_status(settings: Optional[AppSettings] = None) -> dict:
    """Return status, line count, and file size of download archive."""
    p = get_archive_file_path(settings)
    exists = p.exists()
    count = 0
    size_bytes = 0
    if exists:
        try:
            size_bytes = p.stat().st_size
            with open(p, "r", encoding="utf-8", errors="replace") as f:
                count = sum(1 for line in f if line.strip())
        except Exception:
            pass
    return {
        "path": str(p),
        "exists": exists,
        "entry_count": count,
        "size_bytes": size_bytes,
    }


def get_archive_entries(limit: int = 200, settings: Optional[AppSettings] = None) -> List[dict]:
    """Return recent entries from download archive file."""
    p = get_archive_file_path(settings)
    if not p.exists():
        return []
    entries = []
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            for line in f:
                parts = line.strip().split()
                if len(parts) >= 2:
                    entries.append({"extractor": parts[0], "id": parts[1]})
                elif parts:
                    entries.append({"extractor": "generic", "id": parts[0]})
    except Exception as e:
        logger.debug(f"Failed reading archive entries: {e}")
    return entries[-limit:]


def clear_archive(settings: Optional[AppSettings] = None) -> bool:
    """Clear or truncate the download archive file."""
    p = get_archive_file_path(settings)
    try:
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write("")
        return True
    except Exception as e:
        logger.error(f"Failed to clear download archive: {e}")
        return False


def check_duplicate(request: DownloadRequest, settings: Optional[AppSettings] = None) -> Optional[dict]:
    """
    Check if a download request is considered duplicate based on AppSettings.
    Modes supported (YTDLnis parity):
      - 'off': duplicate prevention disabled
      - 'url_type': checks URL + media format type (Video vs Audio separate)
      - 'url': checks exact URL
      - 'download_archive': checks if video ID is recorded in yt-dlp download_archive.txt
      - 'config': checks exact URL, type, and format IDs
    Returns None if not duplicate, or dict with duplicate info if duplicate.
    """
    if getattr(request, "force", False):
        return None

    if settings is None:
        settings = settings_manager.get()

    mode = getattr(settings, "prevent_duplicate_downloads", "url_type") or "url_type"
    mode = str(mode).strip().lower()
    if mode in ("off", "disabled", "none", ""):
        return None

    clean_url = normalize_url(request.url)
    req_is_audio = bool(request.audio_only)

    # 1. Check yt-dlp download archive if mode == 'download_archive'
    if mode == "download_archive":
        archive_path = get_archive_file_path(settings)
        if archive_path.exists():
            try:
                with open(archive_path, "r", encoding="utf-8", errors="replace") as f:
                    for line in f:
                        parts = line.strip().split()
                        if len(parts) >= 2:
                            arch_id = parts[1]
                            if arch_id and arch_id in clean_url:
                                return {
                                    "is_duplicate": True,
                                    "mode": "download_archive",
                                    "status": "archived",
                                    "title": request.title or clean_url,
                                    "video_id": arch_id,
                                    "message": f"This media item (ID: {arch_id}) is recorded in the yt-dlp download archive.",
                                    "archive_path": str(archive_path),
                                }
            except Exception as e:
                logger.debug(f"Error checking download archive: {e}")

    # 2. Check active/queued downloads and history registry
    active_statuses = (
        DownloadStatusEnum.QUEUED,
        DownloadStatusEnum.DOWNLOADING,
        DownloadStatusEnum.PROCESSING,
        DownloadStatusEnum.SCHEDULED,
        DownloadStatusEnum.PAUSED,
    )

    with _queue_lock:
        items = list(download_registry.values())

    for item in items:
        item_clean_url = normalize_url(item.url)
        if item_clean_url != clean_url:
            continue

        item_is_audio = False
        if item.request:
            item_is_audio = bool(item.request.audio_only)
        elif item.format_info and "audio" in item.format_info.lower():
            item_is_audio = True

        status_val = item.status.value if hasattr(item.status, "value") else str(item.status)

        # Mode: url
        if mode == "url":
            if item.status in active_statuses:
                return {
                    "is_duplicate": True,
                    "mode": "url",
                    "status": status_val,
                    "existing_id": item.id,
                    "title": item.title or request.title or clean_url,
                    "filename": item.filename,
                    "thumbnail": item.thumbnail,
                    "message": f"'{item.title or clean_url}' is already in queue or currently downloading ({status_val}).",
                }
            elif item.status == DownloadStatusEnum.FINISHED:
                # Per YTDLnis: check if downloaded file still exists on disk
                file_exists = bool(item.filename and os.path.exists(item.filename))
                if file_exists or not item.filename:
                    return {
                        "is_duplicate": True,
                        "mode": "url",
                        "status": "finished",
                        "existing_id": item.id,
                        "title": item.title or request.title or clean_url,
                        "filename": item.filename,
                        "thumbnail": item.thumbnail,
                        "completed_at": item.completed_at,
                        "message": f"'{item.title or clean_url}' has already been downloaded.",
                    }

        # Mode: url_type
        elif mode == "url_type":
            if item_is_audio == req_is_audio:
                type_label = "Audio" if req_is_audio else "Video"
                if item.status in active_statuses:
                    return {
                        "is_duplicate": True,
                        "mode": "url_type",
                        "status": status_val,
                        "existing_id": item.id,
                        "title": item.title or request.title or clean_url,
                        "filename": item.filename,
                        "thumbnail": item.thumbnail,
                        "media_type": type_label,
                        "message": f"'{item.title or clean_url}' ({type_label}) is already in queue or currently downloading.",
                    }
                elif item.status == DownloadStatusEnum.FINISHED:
                    file_exists = bool(item.filename and os.path.exists(item.filename))
                    if file_exists or not item.filename:
                        return {
                            "is_duplicate": True,
                            "mode": "url_type",
                            "status": "finished",
                            "existing_id": item.id,
                            "title": item.title or request.title or clean_url,
                            "filename": item.filename,
                            "thumbnail": item.thumbnail,
                            "completed_at": item.completed_at,
                            "media_type": type_label,
                            "message": f"'{item.title or clean_url}' ({type_label}) has already been downloaded.",
                        }

        # Mode: config
        elif mode == "config":
            req_v = request.video_format_id or ""
            req_a = request.audio_format_id or ""
            item_v = item.request.video_format_id if item.request else ""
            item_a = item.request.audio_format_id if item.request else ""

            if item_is_audio == req_is_audio and (not req_v or req_v == item_v) and (not req_a or req_a == item_a):
                if item.status in active_statuses:
                    return {
                        "is_duplicate": True,
                        "mode": "config",
                        "status": status_val,
                        "existing_id": item.id,
                        "title": item.title or request.title or clean_url,
                        "filename": item.filename,
                        "thumbnail": item.thumbnail,
                        "message": f"'{item.title or clean_url}' with matching options is already in queue or downloading.",
                    }
                elif item.status == DownloadStatusEnum.FINISHED:
                    file_exists = bool(item.filename and os.path.exists(item.filename))
                    if file_exists or not item.filename:
                        return {
                            "is_duplicate": True,
                            "mode": "config",
                            "status": "finished",
                            "existing_id": item.id,
                            "title": item.title or request.title or clean_url,
                            "filename": item.filename,
                            "thumbnail": item.thumbnail,
                            "completed_at": item.completed_at,
                            "message": f"'{item.title or clean_url}' with matching options has already been downloaded.",
                        }

    return None


def _load_history():
    """Load download history from disk on startup."""
    if HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                data = json.load(f)
            
            loop = None
            try:
                loop = asyncio.get_event_loop()
            except:
                pass

            for item in data:
                status = DownloadStatus(**item)
                
                # Check actual file size on disk for completed downloads to repair any inaccurate sizes
                if status.status == DownloadStatusEnum.FINISHED:
                    if not status.completed_at:
                        if status.filename and os.path.exists(status.filename):
                            try:
                                status.completed_at = datetime.fromtimestamp(os.path.getmtime(status.filename)).isoformat()
                            except Exception:
                                status.completed_at = datetime.now().isoformat()
                        else:
                            status.completed_at = datetime.now().isoformat()
                    if status.filename and os.path.exists(status.filename):
                        try:
                            real_size = float(os.path.getsize(status.filename))
                            status.total_bytes = real_size
                            status.downloaded_bytes = real_size
                            status.filesize = format_bytes_human(real_size)
                        except Exception:
                            pass
                
                # If server crashed while DOWNLOADING, revert to QUEUED
                if status.status == DownloadStatusEnum.DOWNLOADING:
                    status.status = DownloadStatusEnum.QUEUED
                    
                download_registry[status.id] = status
                if status.request:
                    _download_requests[status.id] = status.request
                
                # Auto-resume QUEUED downloads
                if status.status == DownloadStatusEnum.QUEUED and loop:
                    with _queue_lock:
                        if status.id not in _pending_queue:
                            _pending_queue.append(status.id)
                    # We will call _process_queue outside the loop to avoid calling it repeatedly
                
                # Re-arm timer for scheduled downloads
                if status.status == DownloadStatusEnum.SCHEDULED and status.scheduled_for and loop:
                    _recreate_schedule_timer(status.id, status.scheduled_for, loop)
                    
            if loop and _pending_queue:
                with _queue_lock:
                    _process_queue(loop)
                    
        except Exception as e:
            logger.warning(f"Failed to load history: {e}")


def _save_history():
    """Persist completed downloads to disk."""
    completed = [
        s.model_dump(mode='json') for s in download_registry.values()
        if not s.is_incognito and s.status in (
            DownloadStatusEnum.FINISHED, 
            DownloadStatusEnum.ERROR, 
            DownloadStatusEnum.CANCELLED, 
            DownloadStatusEnum.SCHEDULED, 
            DownloadStatusEnum.PAUSED,
            DownloadStatusEnum.QUEUED,
            DownloadStatusEnum.DOWNLOADING
        )
    ]
    try:
        with open(HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(completed, f, indent=2, default=str)
    except Exception as e:
        logger.warning(f"Failed to save history: {e}")


def _parse_format(f: dict) -> FormatInfo:
    """Parse a single yt-dlp format dict into FormatInfo."""
    vcodec = f.get("vcodec", "none")
    acodec = f.get("acodec", "none")
    
    if vcodec == "none" and acodec != "none":
        fmt_type = "audio"
    elif vcodec != "none" and acodec == "none":
        fmt_type = "video"
    elif vcodec != "none" and acodec != "none":
        fmt_type = "combined"
    else:
        fmt_type = "video"

    return FormatInfo(
        format_id=f.get("format_id", ""),
        ext=f.get("ext", ""),
        resolution=f.get("resolution", "audio only" if fmt_type == "audio" else None),
        width=f.get("width"),
        height=f.get("height"),
        fps=f.get("fps"),
        vcodec=vcodec if vcodec != "none" else None,
        acodec=acodec if acodec != "none" else None,
        abr=f.get("abr"),
        asr=f.get("asr"),
        filesize=f.get("filesize"),
        filesize_approx=f.get("filesize_approx"),
        format_note=f.get("format_note"),
        tbr=f.get("tbr"),
        type=fmt_type,
    )


def fetch_formats_sync(url: str) -> VideoInfo:
    """Synchronously fetch available formats for a URL using yt-dlp, with JSON caching."""
    import hashlib
    import time
    
    settings = settings_manager.get()
    clean_url = normalize_url(url)
    
    # Setup cache directory
    CACHE_DIR = DATA_DIR / "format_cache"
    CACHE_DIR.mkdir(exist_ok=True)
    
    # Calculate hash and cache file path
    url_hash = hashlib.md5(clean_url.encode('utf-8')).hexdigest()
    cache_file = CACHE_DIR / f"{url_hash}.json"
    
    # Check cache validity (5 hours TTL matching YTDLnis)
    if cache_file.exists():
        try:
            mtime = cache_file.stat().st_mtime
            if (time.time() - mtime) < 5 * 3600:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)
                logger.info(f"Loaded formats from cache (5h TTL) for: {clean_url}")
                return VideoInfo(**cached_data)
            else:
                # Expired format cache (>5h) - delete to prevent stale 403 Forbidden CDN URLs
                try:
                    cache_file.unlink(missing_ok=True)
                except Exception:
                    pass
        except Exception as e:
            logger.warning(f"Failed to read cache for {clean_url}: {e}")
    
    actual_temp = resolve_temp_dir(settings.temp_dir)
    os.makedirs(actual_temp, exist_ok=True)
    
    ydl_opts = {
        "paths": {"temp": actual_temp},
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "noplaylist": True,
        "ignoreerrors": False,
        "retries": getattr(settings, "auto_retry_count", None) or getattr(settings, "retries", 3),
        "socket_timeout": getattr(settings, "socket_timeout", 30),
        "logger": YtDlpLogger(download_id=download_id) if 'download_id' in locals() and download_id else YtDlpLogger(),
    }
    
    cookie_temp_path = None
    if getattr(settings, "cookies_enabled", True):
        if getattr(settings, "cookie_file_path", None) and os.path.exists(settings.cookie_file_path):
            ydl_opts["cookiefile"] = settings.cookie_file_path
        else:
            import cookie_service
            merged_cookies = cookie_service.get_merged_cookie_content()
            if merged_cookies.strip():
                with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, prefix="ytdlp_fmt_cookies_") as tmp:
                    tmp.write(merged_cookies)
                    cookie_temp_path = tmp.name
                ydl_opts["cookiefile"] = cookie_temp_path

    try:
        _apply_js_engine(ydl_opts, settings)
    except Exception as e:
        logger.warning(f"Failed to apply JS engine setting: {e}")
    
    if getattr(settings, "ipv4_only", False) or getattr(settings, "force_ipv4", False):
        ydl_opts["force_ipv4"] = True
        
    proxy = getattr(settings, "proxy_url", None) or getattr(settings, "socks5_proxy", None)
    if proxy:
        ydl_opts["proxy"] = proxy
        
    if getattr(settings, "geo_bypass", True):
        ydl_opts["geo_bypass"] = True
    if getattr(settings, "geo_bypass_country", None):
        ydl_opts["geo_bypass_country"] = settings.geo_bypass_country
        
    if getattr(settings, "custom_user_agent", None):
        ydl_opts["http_headers"] = {"User-Agent": settings.custom_user_agent}
        
    if getattr(settings, "prefer_insecure", False):
        ydl_opts["prefer_insecure"] = True

    # Browser TLS Impersonation (Bypasses BotGuard fingerprinting on Datacenter/VPS IPs)
    impersonate_target = getattr(settings, "impersonate_target", None) or "chrome"
    if impersonate_target and str(impersonate_target).lower() != "none":
        try:
            from yt_dlp.networking.impersonate import ImpersonateTarget
            ydl_opts["impersonate"] = ImpersonateTarget.from_str(impersonate_target)
        except Exception as e:
            logger.debug(f"Failed to apply impersonate target in format fetch: {e}")
    
    logger.info(f"Fetching formats for normalized URL: {clean_url}")
    
    info = None
    last_error = None
    import io
    original_stderr = sys.stderr
    safe_stderr = open(os.devnull, 'w')
    sys.stderr = safe_stderr
    try:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl._out_files.error = safe_stderr
                info = ydl.extract_info(clean_url, download=False)
        except Exception as e:
            last_error = str(e)
            logger.warning(f"Primary format extraction failed: {e}")
        finally:
            sys.stderr = original_stderr
            try:
                safe_stderr.close()
            except Exception:
                pass

        # Automatic fallback for YouTube if blocked by BotGuard on datacenter/VPS IPs
        if not info and ("youtube.com" in clean_url or "youtu.be" in clean_url):
            logger.info("Attempting fallback YouTube player clients (android,mweb)...")
            fb_opts = dict(ydl_opts)
            fb_opts["ignoreerrors"] = False
            fb_args = dict(fb_opts.get("extractor_args", {}))
            fb_args["youtube"] = [
                "player_client=ios,android,mweb,web"
            ]
            fb_opts["extractor_args"] = fb_args
            try:
                with yt_dlp.YoutubeDL(fb_opts) as ydl:
                    info = ydl.extract_info(clean_url, download=False)
            except Exception as e:
                last_error = str(e)
                logger.warning(f"Fallback format extraction failed: {e}")
    finally:
        if cookie_temp_path and os.path.exists(cookie_temp_path):
            try:
                os.unlink(cookie_temp_path)
            except OSError:
                pass

    if not info:
        err_msg = last_error or "Unknown error"
        if "Sign in to confirm" in err_msg or "bot" in err_msg.lower():
            raise Exception("YouTube is requesting bot verification ('Sign in to confirm you’re not a bot'). To resolve this: import your YouTube cookies under Settings -> Cookies & Accounts, or enable Proof of Origin (PO Token).")
        raise Exception(f"Could not retrieve video information: {err_msg}")

    raw_formats = info.get("formats", [])
    parsed_formats = [_parse_format(f) for f in raw_formats]
    parsed_formats = [
        f for f in parsed_formats 
        if f.ext not in ("mhtml",) and "storyboard" not in (f.format_note or "").lower()
    ]
    
    logger.info(f"Found {len(parsed_formats)} formats for: {info.get('title', 'Unknown')}")
    
    duration = info.get("duration")
    duration_string = None
    if duration:
        mins, secs = divmod(int(duration), 60)
        hours, mins = divmod(mins, 60)
        if hours:
            duration_string = f"{hours}:{mins:02d}:{secs:02d}"
        else:
            duration_string = f"{mins}:{secs:02d}"
            
    thumbnail_url = info.get("thumbnail")
    video_title = info.get("title", "Unknown")
    uploader = info.get("uploader") or info.get("channel") or info.get("artist")
    
    # For YouTube Music and YouTube tracks, format title as "Artist - Title" if artist is not already in title
    if "music.youtube.com" in clean_url or "youtube.com" in clean_url:
        artist = info.get("artist") or info.get("creator") or uploader
        if artist and video_title and artist.lower() not in video_title.lower():
            video_title = f"{artist} - {video_title}"
    
    video_info = VideoInfo(
        id=info.get("id", ""),
        title=video_title,
        thumbnail=thumbnail_url,
        duration=duration,
        duration_string=duration_string,
        uploader=uploader,
        view_count=info.get("view_count"),
        webpage_url=info.get("webpage_url", clean_url),
        formats=parsed_formats,
    )

    try:
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(video_info.model_dump(), f)
        logger.info(f"Saved {len(parsed_formats)} formats to cache (5h TTL) for: {clean_url}")
    except Exception as e:
        logger.warning(f"Failed to write format cache for {clean_url}: {e}")

    return video_info


async def fetch_formats(url: str) -> VideoInfo:
    """Async wrapper to fetch formats in a thread pool."""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(_executor, fetch_formats_sync, url)


def _apply_js_engine(opts: dict, settings: AppSettings):
    """Apply JS engine setting, EJS solver script, and client rotation to yt-dlp options."""
    import shutil
    engine_map = {
        JsEngine.DENO: "deno",
        JsEngine.NODEJS: "nodejs",
        JsEngine.PHANTOMJS: "phantomjs",
    }
    raw_engine = engine_map.get(settings.js_engine, "nodejs")
    engine = raw_engine
    if engine == "deno" and not shutil.which("deno"):
        if shutil.which("node") or shutil.which("nodejs"):
            engine = "nodejs"
        else:
            engine = None
    elif engine == "nodejs" and not (shutil.which("node") or shutil.which("nodejs")):
        if shutil.which("deno"):
            engine = "deno"
        else:
            engine = None

    if "extractor_args" not in opts:
        opts["extractor_args"] = {}

    youtube_args = [
        "player_client=ios,android,mweb,web,tv_embedded"
    ]
    if engine:
        youtube_args.append(f"js_engine={engine}")

    opts["extractor_args"]["youtube"] = youtube_args

    # Configure core js_runtimes in ydl_opts
    # By default yt-dlp only enables 'deno'. Enabling both deno and node allows yt-dlp
    # to seamlessly decipher YouTube player challenges using whichever runtime is present.
    js_runtimes_dict = {}
    if shutil.which("deno"):
        js_runtimes_dict["deno"] = {}
    if shutil.which("node") or shutil.which("nodejs"):
        js_runtimes_dict["node"] = {}
    if not js_runtimes_dict:
        js_runtimes_dict = {"deno": {}, "node": {}}
    opts["js_runtimes"] = js_runtimes_dict
    opts["remote_components"] = ["ejs:github"]

    try:
        import po_token_service
        po_token_service.apply_po_token_args(opts, settings)
    except Exception as e:
        logger.warning(f"Failed to apply PO Token extractor args: {e}")


def clean_progress_string(s: Optional[str]) -> Optional[str]:
    """Strip ANSI escape color sequences (e.g. \\x1b[0;32m) and clean up extra ETA prefixes."""
    if not s:
        return None
    cleaned = re.sub(r'\x1b\[[0-9;]*[a-zA-Z]|\033\[[0-9;]*[a-zA-Z]', '', str(s))
    cleaned = re.sub(r'^ETA\s*', '', cleaned, flags=re.IGNORECASE).strip()
    return cleaned if cleaned else None


def resolve_temp_dir(settings_temp_dir: str) -> str:
    """Resolve the temp dir safely, redirecting raw '/tmp' or '\\tmp' to backend/tmp."""
    import tempfile
    
    if not settings_temp_dir or not settings_temp_dir.strip():
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp")
        
    cleaned = settings_temp_dir.strip()
    if cleaned in ("/tmp", "\\tmp", "tmp"):
        return os.path.join(os.path.dirname(os.path.abspath(__file__)), "tmp")
        
    return cleaned

def parse_time_to_seconds(time_val: Any) -> Optional[float]:
    """Parse string (HH:MM:SS, MM:SS, or seconds) or number into float seconds."""
    if time_val is None:
        return None
    if isinstance(time_val, (int, float)):
        return float(time_val)
    s = str(time_val).strip()
    if not s or s.lower() in ("inf", "infinity"):
        return float("inf")
    parts = s.split(":")
    if len(parts) > 1:
        try:
            num_parts = [float(p) for p in parts]
            if len(num_parts) == 2:
                return num_parts[0] * 60 + num_parts[1]
            elif len(num_parts) == 3:
                return num_parts[0] * 3600 + num_parts[1] * 60 + num_parts[2]
        except ValueError:
            pass
    try:
        return float(s)
    except ValueError:
        return None


def _build_ydl_opts(
    request: DownloadRequest,
    settings: Optional[AppSettings] = None,
    download_id: Optional[str] = None,
    staging_dir: Optional[str] = None,
    loop: Optional[asyncio.AbstractEventLoop] = None
) -> dict:
    """Build full yt-dlp options dict for isolated staging directory."""
    if settings is None:
        settings = settings_manager.get()
    if download_id is None:
        download_id = str(uuid.uuid4())
    if staging_dir is None:
        staging_dir = get_staging_dir(download_id)

    adv = getattr(request, "advanced_options", None) or getattr(request, "advanced", None)

    fname_tmpl = getattr(settings, "filename_template", None) or getattr(settings, "custom_filename_template", "%(title)s.%(ext)s")
    if not fname_tmpl:
        fname_tmpl = "%(title)s.%(ext)s"
        
    if getattr(settings, "create_subdirectories", False):
        sub_fmt = getattr(settings, "subdirectory_format", None) or getattr(settings, "subdirectory_template", "%(uploader)s")
        if sub_fmt:
            clean_sub = sub_fmt.strip('/\\')
            template = f"{clean_sub}/{fname_tmpl}"
        else:
            template = fname_tmpl
    else:
        template = fname_tmpl
    
    # Map filename_template: If provided, override outtmpl['default']
    outtmpl_dict = {"default": template}
    if adv and adv.filename_template:
        outtmpl_dict["default"] = adv.filename_template

    is_audio_only = bool(
        (request.audio_only or (adv and adv.recode_audio) or (request.audio_format_id and not request.video_format_id))
        and not (adv and adv.remove_audio)
    )

    opts = {
        "paths": {"home": staging_dir, "temp": staging_dir},
        "outtmpl": outtmpl_dict,
        "continuedl": getattr(settings, "continuedl", True),
        "nopart": False,
        "overwrites": False,
        "quiet": True,
        "no_warnings": True,
        "noprogress": True,
        "noplaylist": True,
        "no_color": True,
        "updatetime": False,  # Fixes OSError 22 on Windows for old timestamps
        "ignoreerrors": True, # Ignore subtitle/thumbnail 429 errors and continue download
        "retries": getattr(settings, "auto_retry_count", None) or getattr(settings, "retries", 3),
        "fragment_retries": getattr(settings, "fragment_retries", 10),
        "concurrent_fragment_downloads": getattr(settings, "concurrent_fragments", 5),
        "socket_timeout": getattr(settings, "socket_timeout", 30),
        "logger": YtDlpLogger(
            download_id=download_id, 
            is_audio=is_audio_only, 
            loop=loop, 
            is_incognito=bool(getattr(settings, "incognito_mode", False) or (download_id in download_registry and download_registry[download_id].is_incognito))
        ) if download_id else YtDlpLogger(is_audio=is_audio_only),
    }

    # Map download archive (yt-dlp native duplicate prevention)
    dup_mode = getattr(settings, "prevent_duplicate_downloads", "url_type") or "url_type"
    if str(dup_mode).strip().lower() == "download_archive" and not getattr(request, "force", False):
        archive_path = get_archive_file_path(settings)
        archive_path.parent.mkdir(parents=True, exist_ok=True)
        opts["download_archive"] = str(archive_path)

    # Speed limit
    if getattr(settings, "download_speed_limit", 0) and settings.download_speed_limit > 0:
        opts["ratelimit"] = settings.download_speed_limit

    # Retry delay
    retry_delay = getattr(settings, "retry_delay", None) or getattr(settings, "retry_sleep", None)
    if retry_delay and retry_delay > 0:
        try:
            _, _, _, retry_opts = yt_dlp.parse_options(["--retry-sleep", str(retry_delay)])
            if "retry_sleep_functions" in retry_opts:
                opts["retry_sleep_functions"] = retry_opts["retry_sleep_functions"]
        except Exception:
            pass

    # Prefer insecure
    if getattr(settings, "prefer_insecure", False):
        opts["prefer_insecure"] = True

    # Spoofing / Impersonation (Anti-bot)
    # Note: On Windows Python 3.13 curl_cffi impersonate target can raise RuntimeError; only set if explicitly supported
    impersonate_target = getattr(settings, "impersonate_target", None) or "chrome"
    if impersonate_target and str(impersonate_target).lower() != "none":
        try:
            from yt_dlp.networking.impersonate import ImpersonateTarget
            opts["impersonate"] = ImpersonateTarget.from_str(impersonate_target)
        except Exception:
            pass

    if getattr(settings, "custom_user_agent", None):
        opts["http_headers"] = {"User-Agent": settings.custom_user_agent}

    # Network / Proxy
    if getattr(settings, "ipv4_only", False) or getattr(settings, "force_ipv4", False):
        opts["force_ipv4"] = True
    proxy = getattr(settings, "proxy_url", None) or getattr(settings, "socks5_proxy", None)
    if proxy:
        opts["proxy"] = proxy
    if getattr(settings, "geo_bypass", True):
        opts["geo_bypass"] = True
    if getattr(settings, "geo_bypass_country", None):
        opts["geo_bypass_country"] = settings.geo_bypass_country

    # Aria2 external downloader
    if getattr(settings, "aria2_enabled", False):
        aria_cmd = getattr(settings, "aria2c_path", "aria2c") or "aria2c"
        opts["external_downloader"] = aria_cmd
        opts["external_downloader_args"] = {
            aria_cmd: ["-x", "16", "-s", "16", "-k", "1M"]
        }

    # Netscape cookies
    if getattr(settings, "cookies_enabled", True):
        if getattr(settings, "cookie_file_path", None) and os.path.exists(settings.cookie_file_path):
            opts["cookiefile"] = settings.cookie_file_path
        else:
            import cookie_service
            merged_cookies = cookie_service.get_merged_cookie_content()
            if merged_cookies.strip():
                cookie_file = tempfile.NamedTemporaryFile(
                    mode="w", suffix=".txt", delete=False, prefix="ytdlp_cookies_"
                )
                cookie_file.write(merged_cookies)
                cookie_file.close()
                opts["cookiefile"] = cookie_file.name

    postprocessors = []

    # Map remove_audio:
    remove_audio = bool(adv and (adv.remove_audio or adv.recode_video == 'gif'))

    if is_audio_only:
        opts["format"] = request.audio_format_id if request.audio_format_id else "bestaudio/best"
    else:
        video_container = getattr(settings, "default_video_container", "mp4") or "mp4"
        opts["merge_output_format"] = video_container
        video_codec = getattr(settings, "preferred_video_codec", "auto")
        if remove_audio:
            opts["format"] = request.video_format_id if request.video_format_id else "bestvideo"
            opts.setdefault("postprocessor_args", {}).setdefault("ffmpeg", []).extend(["-an"])
        else:
            if request.quick_download:
                if video_codec != "auto":
                    opts["format"] = f"bestvideo[vcodec^={video_codec}]+bestaudio/bestvideo+bestaudio/best"
                else:
                    opts["format"] = "bestvideo+bestaudio/best"
            elif request.video_format_id and request.audio_format_id:
                opts["format"] = f"{request.video_format_id}+{request.audio_format_id}"
            elif request.video_format_id:
                opts["format"] = f"{request.video_format_id}+bestaudio/best"
            else:
                opts["format"] = "bestvideo+bestaudio/best"

    # Map sponsorblock:
    # - If action == 'mark', use sponsorblock_mark: categories
    # - Else use sponsorblock_remove: categories
    sb_categories = None
    sb_action = "remove"
    if adv and getattr(adv, "sponsorblock", None) is not None:
        if isinstance(adv.sponsorblock, list):
            sb_categories = adv.sponsorblock if len(adv.sponsorblock) > 0 else None
            sb_action = getattr(adv, "sponsorblock_action", "remove") or "remove"
        elif isinstance(adv.sponsorblock, dict):
            cats = adv.sponsorblock.get("categories", [])
            sb_categories = cats if len(cats) > 0 else None
            sb_action = adv.sponsorblock.get("action", "remove") or getattr(adv, "sponsorblock_action", "remove") or "remove"
        elif hasattr(adv.sponsorblock, "categories"):
            cats = adv.sponsorblock.categories
            sb_categories = cats if len(cats) > 0 else None
            sb_action = getattr(adv.sponsorblock, "action", "remove") or getattr(adv, "sponsorblock_action", "remove") or "remove"
    elif request.sponsorblock_remove_override or getattr(settings, "remove_sponsorblock_default", False) or getattr(settings, "sponsorblock_remove", False):
        sb_categories = getattr(settings, "sponsorblock_categories", ["sponsor"])
        sb_action = "remove"

    if sb_categories:
        cat_list = [c.strip() for c in sb_categories if isinstance(c, str) and c.strip()]
        if cat_list:
            if sb_action == "mark":
                opts["sponsorblock_mark"] = cat_list
                postprocessors.append({
                    "key": "SponsorBlock",
                    "categories": set(cat_list)
                })
                postprocessors.append({
                    "key": "ModifyChapters",
                    "remove_sponsor_segments": set(),
                    "sponsorblock_chapter_title": "[SponsorBlock]: %(category_names)l"
                })
            else:
                opts["sponsorblock_remove"] = cat_list
                postprocessors.append({
                    "key": "SponsorBlock",
                    "categories": set(cat_list)
                })
                postprocessors.append({
                    "key": "ModifyChapters",
                    "remove_sponsor_segments": set(cat_list)
                })

    # Map subtitles:
    # - If write_subs: writesubtitles: True
    # - If write_auto_subs: writeautomaticsub: True
    # - If langs: subtitleslangs: [l.strip() for l in langs.split(',') if l.strip()]
    # - If embed: add {'key': 'FFmpegEmbedSubtitle'} to postprocessors
    # - If format: add {'key': 'FFmpegSubtitlesConvertor', 'format': format} to postprocessors
    sub_opts = None
    explicit_subtitles_override = False
    if adv and getattr(adv, "subtitles", None) is not None:
        explicit_subtitles_override = True
        sub_opts = adv.subtitles
        if isinstance(sub_opts, dict):
            sub_opts = SubtitleOptions(**sub_opts)

    if explicit_subtitles_override:
        if sub_opts and isinstance(sub_opts, SubtitleOptions):
            if sub_opts.write_subs:
                opts["writesubtitles"] = True
            if sub_opts.write_auto_subs or getattr(sub_opts, "write_auto", False):
                opts["writeautomaticsub"] = True
            if sub_opts.langs:
                if isinstance(sub_opts.langs, list):
                    opts["subtitleslangs"] = [l.strip() for l in sub_opts.langs if l.strip()]
                else:
                    opts["subtitleslangs"] = [l.strip() for l in sub_opts.langs.split(",") if l.strip()]
            sub_format = sub_opts.format or getattr(sub_opts, "sub_format", None)
            if sub_format:
                opts["subtitlesformat"] = sub_format
                postprocessors.append({"key": "FFmpegSubtitlesConvertor", "format": sub_format})
            if sub_opts.embed:
                if "subtitlesformat" not in opts:
                    opts["subtitlesformat"] = sub_format or "srt/best"
                opts.setdefault("compat_opts", []).append("no-keep-subs")
                postprocessors.append({"key": "FFmpegEmbedSubtitle"})
    else:
        embed_subtitles = request.embed_subtitles_override if request.embed_subtitles_override is not None else settings.embed_subtitles
        if embed_subtitles:
            opts["writesubtitles"] = True
            opts["writeautomaticsub"] = True
            langs = [l.strip() for l in settings.subtitle_languages.split(",") if l.strip()]
            opts["subtitleslangs"] = langs if langs else ["en.*", "en", ".*-orig"]
            opts["subtitlesformat"] = "srt/best"
            opts["sleep_interval_subtitles"] = 1  # Throttle subtitle requests to avoid 429
            opts.setdefault("compat_opts", []).append("no-keep-subs")
            postprocessors.append({"key": "FFmpegSubtitlesConvertor", "format": "srt"})
            postprocessors.append({"key": "FFmpegEmbedSubtitle"})

    # Map embed_chapters:
    # - Add {'key': 'FFmpegMetadata', 'add_chapters': True} to postprocessors
    embed_chapters = adv.embed_chapters if (adv and adv.embed_chapters is not None) else settings.embed_chapters

    # Embed metadata
    embed_metadata = request.embed_metadata_override if request.embed_metadata_override is not None else settings.embed_metadata
    if embed_metadata or embed_chapters:
        meta_pp = {"key": "FFmpegMetadata"}
        if embed_metadata:
            meta_pp["add_metadata"] = True
            if is_audio_only:
                audio_parse = []
                if getattr(request, "title", None) and request.title.strip():
                    opts.setdefault("replace_in_metadata", []).append(("title", r"^.*$", request.title.strip()))
                    audio_parse.append("%(title)s:%(meta_title)s")
                if getattr(request, "artist", None) and request.artist.strip():
                    opts.setdefault("replace_in_metadata", []).append(("uploader", r"^.*$", request.artist.strip()))

                # YTDLnis exact execution sequence: topic cleanup -> artist map -> first artist -> album -> album artist -> release year -> track number
                audio_parse.extend([
                    "%(artists,artist,creators,uploader,channel,creator|)s:^(?P<uploader>.*?)(?:(?= - Topic)|$)",
                    "%(uploader)s:%(artist)s",
                    "%(playlist_uploader,artist|)s:^(?P<first_artist>.*?)(?:(?=,\\s+)|$)",
                    "%(album,playlist_title,playlist|)s:%(meta_album)s",
                    "%(album_artist,first_artist|)s:%(album_artist)s",
                    "%(release_year,release_date>%Y,upload_date>%Y)s:(?P<meta_date>\\d+)",
                    "%(track_number,playlist_index)d:(?P<track_number>\\d+)"
                ])
                opts["parse_metadata"] = audio_parse
            else:
                opts["parse_metadata"] = [
                    "%(title)s:%(meta_title)s",
                    "%(uploader)s:%(artist)s"
                ]
        if embed_chapters:
            meta_pp["add_chapters"] = True
        postprocessors.append(meta_pp)

    # Map split_chapters:
    # - If True, set split_chapters: True (which yt-dlp supports natively)
    if adv and adv.split_chapters:
        opts["split_chapters"] = True
        postprocessors.append({"key": "FFmpegSplitChapters", "force_keyframes": False})

    # Map recode_video:
    # - Add {'key': 'FFmpegVideoConvertor', 'preferedformat': recode_video}
    if adv and adv.recode_video:
        opts["recode_video"] = adv.recode_video
        postprocessors.append({"key": "FFmpegVideoConvertor", "preferedformat": adv.recode_video})

    # Map recode_audio / audio_only:
    # - If audio_only or recode_audio, add {'key': 'FFmpegExtractAudio', 'preferredcodec': recode_audio or 'mp3', 'preferredquality': audio_quality or '192'}
    recode_audio = adv.recode_audio if adv else None
    audio_quality = (adv.audio_quality if adv else None) or "192"
    if is_audio_only or recode_audio:
        preferred_codec = recode_audio or (settings.preferred_audio_codec if getattr(settings, "preferred_audio_codec", "auto") != "auto" else (getattr(settings, "default_audio_container", "mp3") or "mp3"))
        postprocessors.append({
            "key": "FFmpegExtractAudio",
            "preferredcodec": preferred_codec,
            "preferredquality": audio_quality
        })
        if adv and adv.audio_quality:
            opts["audio_quality"] = adv.audio_quality

    # Map cut:
    # - Support single cut or multiple cuts / segments
    parsed_ranges = []
    if adv and adv.cut:
        raw_cut = adv.cut
        raw_segments = []
        if isinstance(raw_cut, dict):
            if "segments" in raw_cut and isinstance(raw_cut["segments"], list):
                raw_segments = raw_cut["segments"]
            elif raw_cut.get("start") or raw_cut.get("end"):
                raw_segments = [raw_cut]
        elif isinstance(raw_cut, list):
            raw_segments = raw_cut
        else:
            if hasattr(raw_cut, "segments") and getattr(raw_cut, "segments"):
                raw_segments = getattr(raw_cut, "segments")
            elif getattr(raw_cut, "start", None) or getattr(raw_cut, "end", None):
                raw_segments = [raw_cut]

        # Extract total video duration if known
        video_duration = None
        if isinstance(raw_cut, dict):
            cut_dur = raw_cut.get("video_duration") or raw_cut.get("duration")
        else:
            cut_dur = getattr(raw_cut, "video_duration", None) or getattr(raw_cut, "duration", None)
        if cut_dur:
            try:
                video_duration = float(cut_dur)
            except (ValueError, TypeError):
                video_duration = None

        status_obj = download_registry.get(download_id) if download_id else None
        if not video_duration and status_obj:
            dur_val = getattr(status_obj, "duration", None)
            if dur_val is not None:
                try:
                    video_duration = float(dur_val)
                except (ValueError, TypeError):
                    video_duration = None

        raw_ranges = []
        for seg in raw_segments:
            s_val = seg.get("start") if isinstance(seg, dict) else getattr(seg, "start", None)
            e_val = seg.get("end") if isinstance(seg, dict) else getattr(seg, "end", None)

            start_sec = parse_time_to_seconds(s_val) if s_val is not None and str(s_val).strip() != "" else 0.0
            if start_sec is None:
                start_sec = 0.0

            end_sec = parse_time_to_seconds(e_val) if e_val is not None and str(e_val).strip() != "" else float("inf")
            if end_sec is None:
                end_sec = float("inf")

            if video_duration and video_duration > 0:
                start_sec = min(start_sec, video_duration)
                if end_sec != float("inf"):
                    end_sec = min(end_sec, video_duration)

            if end_sec > start_sec:
                raw_ranges.append((start_sec, end_sec))

        # Determine cut action: "include" (default) or "remove"
        cut_action = "include"
        if isinstance(raw_cut, dict):
            cut_action = raw_cut.get("action") or raw_cut.get("mode") or "include"
        else:
            cut_action = getattr(raw_cut, "action", None) or getattr(raw_cut, "mode", None) or "include"
        cut_action = str(cut_action).lower().strip()

        if cut_action == "include" and raw_ranges:
            # Sort and merge any overlapping or contiguous intervals
            sorted_inc = sorted(raw_ranges, key=lambda r: r[0])
            merged_inc = []
            for s, e in sorted_inc:
                if not merged_inc:
                    merged_inc.append([s, e])
                else:
                    if s <= merged_inc[-1][1]:
                        merged_inc[-1][1] = max(merged_inc[-1][1], e)
                    else:
                        merged_inc.append([s, e])
            parsed_ranges = [(s, e) for s, e in merged_inc if e > s]

        elif cut_action == "remove" and raw_ranges:
            # Invert raw_ranges so only unselected portions are kept and downloaded
            sorted_rem = sorted(raw_ranges, key=lambda r: r[0])
            merged_rem = []
            for s, e in sorted_rem:
                if not merged_rem:
                    merged_rem.append([s, e])
                else:
                    if s <= merged_rem[-1][1]:
                        merged_rem[-1][1] = max(merged_rem[-1][1], e)
                    else:
                        merged_rem.append([s, e])

            limit = video_duration if (video_duration and video_duration > 0) else float("inf")
            kept_ranges = []
            curr = 0.0
            for s, e in merged_rem:
                if s >= limit:
                    break
                if s > curr:
                    kept_ranges.append((curr, min(s, limit)))
                curr = max(curr, e)

            # Only append remainder if curr is strictly less than limit (no empty tail at end of video)
            if curr < limit - 0.1:
                kept_ranges.append((curr, limit))

            parsed_ranges = [(s, e) for s, e in kept_ranges if e > s]

        # Double check sanity clamping against video_duration
        if video_duration and video_duration > 0:
            cleaned_ranges = []
            for s, e in parsed_ranges:
                if s >= video_duration - 0.1:
                    continue
                capped_e = min(e, video_duration)
                if capped_e > s + 0.1:
                    cleaned_ranges.append((s, capped_e))
            parsed_ranges = cleaned_ranges

        if parsed_ranges:
            from yt_dlp.utils import download_range_func
            opts["download_ranges"] = download_range_func(None, parsed_ranges)
            opts["force_keyframes_at_cuts"] = True
            opts["_parsed_ranges"] = parsed_ranges

            # When multiple cuts are defined, each slice needs a distinct filename so it won't overwrite
            if len(parsed_ranges) > 1:
                outtmpl_dict["default"] = "%(title)s_cutpart%(section_start)s.%(ext)s"

            # Pass -progress to FFmpeg downloader for live segment progress tracking
            ffmpeg_prog_file = os.path.join(staging_dir, "ffmpeg_progress.log").replace('\\', '/')
            opts.setdefault("external_downloader_args", {})["ffmpeg"] = ["-progress", ffmpeg_prog_file]

    has_multiple_cuts = bool(parsed_ranges and len(parsed_ranges) > 1)

    # Thumbnail processing
    embed_thumb = getattr(settings, "embed_thumbnail", True)
    if adv and getattr(adv, "embed_thumbnail", None) is not None:
        embed_thumb = adv.embed_thumbnail
    write_thumb = getattr(settings, "write_thumbnail", False)
    if adv and getattr(adv, "write_thumbnail", None) is not None:
        write_thumb = adv.write_thumbnail
    # WAV (RIFF container) does not support cover art tags
    if (is_audio_only or recode_audio) and (recode_audio == "wav" or (adv and getattr(adv, "recode_audio", None) == "wav")):
        embed_thumb = False

    if embed_thumb or write_thumb:
        opts["writethumbnail"] = True
        postprocessors.append({"key": "FFmpegThumbnailsConvertor", "format": "jpg"})
        # When multiple cuts are being downloaded, DO NOT embed thumbnail into intermediate cut parts!
        # Otherwise mutagen/ffmpeg attaches the thumbnail as an MJPEG video stream to intermediate cuts,
        # which causes FFmpeg concat to accidentally select the MJPEG thumbnail picture as the main video stream.
        if embed_thumb and not has_multiple_cuts:
            postprocessors.append({"key": "EmbedThumbnail"})
        if is_audio_only and embed_thumb:
            opts.setdefault("postprocessor_args", {})["ThumbnailsConvertor"] = [
                "-qmin", "1", "-q:v", "1", "-vf", "crop='if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'"
            ]

    # Map crop:
    if adv and adv.crop:
        crop_data = adv.crop
        if isinstance(crop_data, dict):
            cx = crop_data.get("x", 0) or 0
            cy = crop_data.get("y", 0) or 0
            cw = crop_data.get("w", 0) or 0
            ch = crop_data.get("h", 0) or 0
            ref_w = crop_data.get("ref_w", 0) or 0
            ref_h = crop_data.get("ref_h", 0) or 0
        else:
            cx = getattr(crop_data, "x", 0) or 0
            cy = getattr(crop_data, "y", 0) or 0
            cw = getattr(crop_data, "w", 0) or 0
            ch = getattr(crop_data, "h", 0) or 0
            ref_w = getattr(crop_data, "ref_w", 0) or 0
            ref_h = getattr(crop_data, "ref_h", 0) or 0

        if cw > 0 and ch > 0:
            if ref_w > 0 and ref_h > 0:
                crop_filter = f"crop=({cw}/{ref_w})*iw:({ch}/{ref_h})*ih:({cx}/{ref_w})*iw:({cy}/{ref_h})*ih"
            else:
                crop_filter = f"crop={cw}:{ch}:{cx}:{cy}"

            # Ensure video is re-encoded so ffmpeg filter graph executes
            if not is_audio_only and not (adv and adv.recode_video):
                opts["recode_video"] = "mp4"
                postprocessors.append({"key": "FFmpegVideoConvertor", "preferedformat": "mp4"})

            opts.setdefault("postprocessor_args", {}).setdefault("ffmpeg", []).extend(["-vf", crop_filter])
            opts.setdefault("postprocessor_args", {}).setdefault("VideoConvertor", []).extend(["-vf", crop_filter])

    # Map live_from_start:
    if adv and adv.live_from_start:
        opts["live_from_start"] = True

    # Map wait_for_video:
    if adv and adv.wait_for_video is not None:
        opts["wait_for_video"] = int(adv.wait_for_video)

    # Attach postprocessors
    opts["postprocessors"] = opts.get("postprocessors", []) + postprocessors

    # Map extra_commands:
    # - Safely parse extra args and inject into ydl_opts
    if adv and adv.extra_commands:
        import shlex
        try:
            extra_args = shlex.split(adv.extra_commands)
            if extra_args:
                _, _, _, default_opts = yt_dlp.parse_options([])
                _, _, _, parsed_opts = yt_dlp.parse_options(extra_args)
                for k, v in parsed_opts.items():
                    if v != default_opts.get(k):
                        if k == "postprocessors":
                            opts.setdefault("postprocessors", []).extend(v)
                        elif isinstance(v, dict) and isinstance(opts.get(k), dict):
                            opts[k].update(v)
                        else:
                            opts[k] = v
        except Exception as e:
            logger.error(f"Failed to parse extra_commands: {e}")

    # Custom command on request
    if getattr(request, "custom_command", None):
        import shlex
        try:
            custom_args = shlex.split(request.custom_command)
            if custom_args:
                _, _, _, default_opts = yt_dlp.parse_options([])
                _, _, _, custom_opts = yt_dlp.parse_options(custom_args)
                for k, v in custom_opts.items():
                    if v != default_opts.get(k):
                        if k == "postprocessors":
                            opts.setdefault("postprocessors", []).extend(v)
                        elif isinstance(v, dict) and isinstance(opts.get(k), dict):
                            opts[k].update(v)
                        else:
                            opts[k] = v
        except Exception as e:
            logger.error(f"Failed to parse custom command: {e}")

    _apply_js_engine(opts, settings)

    return opts

_build_ytdlp_opts = _build_ydl_opts



def _progress_hook(d: dict, download_id: str, loop: asyncio.AbstractEventLoop, has_multi_cuts: bool = False):
    """Callback from yt-dlp to report download progress."""
    flag = _cancel_flags.get(download_id)
    if flag == True:
        raise yt_dlp.utils.DownloadCancelled("Download cancelled by user")
    elif flag == "PAUSE":
        raise yt_dlp.utils.DownloadCancelled("Download paused by user")
    
    status_obj = download_registry.get(download_id)
    if not status_obj:
        return

    if d["status"] == "downloading":
        total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
        downloaded = d.get("downloaded_bytes", 0)
        percent = (downloaded / total * 100) if total > 0 else 0.0
        
        status_obj.status = DownloadStatusEnum.DOWNLOADING
        status_obj.downloaded_bytes = downloaded
        if total > 0:
            if status_obj.total_bytes is None or total > status_obj.total_bytes:
                status_obj.total_bytes = total
                status_obj.filesize = format_bytes_human(status_obj.total_bytes)
        status_obj.percent = round(percent, 1)
        status_obj.speed = clean_progress_string(d.get("_speed_str"))
        status_obj.eta = clean_progress_string(d.get("_eta_str"))
        
        if d.get("filename"):
            status_obj.filename = d["filename"]

    elif d["status"] == "finished":
        # In multi-cut downloads, individual cut completion should not set 100% or PROCESSING prematurely
        if not has_multi_cuts:
            status_obj.status = DownloadStatusEnum.PROCESSING
            status_obj.percent = 100.0
        if d.get("filename"):
            status_obj.filename = d["filename"]

    if progress_queue:
        loop.call_soon_threadsafe(
            progress_queue.put_nowait,
            status_obj.model_dump(mode='json')
        )


def _push_live_status(status_obj, text: str, loop: asyncio.AbstractEventLoop):
    """Push a live status text update to the WebSocket queue."""
    status_obj.live_status_text = text
    if progress_queue and loop:
        try:
            loop.call_soon_threadsafe(
                progress_queue.put_nowait,
                status_obj.model_dump(mode='json')
            )
        except Exception:
            pass


def generate_ytdlp_cli_command(opts: dict, clean_url: str, request: DownloadRequest, settings: AppSettings) -> tuple:
    """
    Reconstruct the equivalent yt-dlp CLI command from the options dictionary and request.
    Returns (multiline_command, single_line_command).
    """
    cmd_args = ["yt-dlp"]

    # Format specifier
    fmt = opts.get("format")
    if fmt:
        cmd_args.extend(["--format", f'"{fmt}"'])

    # Audio extraction vs Video container
    postprocessors = opts.get("postprocessors", [])
    extract_audio_pp = next((p for p in postprocessors if isinstance(p, dict) and p.get("key") == "FFmpegExtractAudio"), None)
    adv = getattr(request, "advanced_options", None) or getattr(request, "advanced", None)

    if extract_audio_pp or request.audio_only or (adv and adv.recode_audio):
        cmd_args.append("--extract-audio")
        codec = (extract_audio_pp.get("preferredcodec") if extract_audio_pp else None) or (adv.recode_audio if adv and adv.recode_audio else getattr(settings, "default_audio_container", "mp3")) or "mp3"
        cmd_args.extend(["--audio-format", codec])
        quality = (extract_audio_pp.get("preferredquality") if extract_audio_pp else None) or (adv.audio_quality if adv and adv.audio_quality else getattr(settings, "default_audio_quality", "0")) or "0"
        cmd_args.extend(["--audio-quality", str(quality)])
    elif opts.get("merge_output_format"):
        cmd_args.extend(["--merge-output-format", opts["merge_output_format"]])

    # Paths & Output Template
    paths = opts.get("paths", {})
    if paths.get("home"):
        cmd_args.extend(["--paths", f'"home:{paths["home"]}"'])
    outtmpl = opts.get("outtmpl", {})
    if isinstance(outtmpl, dict) and outtmpl.get("default"):
        cmd_args.extend(["--output", f'"{outtmpl["default"]}"'])
    elif isinstance(outtmpl, str):
        cmd_args.extend(["--output", f'"{outtmpl}"'])

    # Thumbnails & Metadata
    if opts.get("writethumbnail"):
        cmd_args.append("--write-thumbnail")
    if any(isinstance(p, dict) and p.get("key") == "EmbedThumbnail" for p in postprocessors):
        cmd_args.append("--embed-thumbnail")
    if any(isinstance(p, dict) and p.get("key") == "FFmpegThumbnailsConvertor" for p in postprocessors):
        cmd_args.extend(["--convert-thumbnails", "jpg"])
    if opts.get("postprocessor_args"):
        for pp_name, pp_args in opts["postprocessor_args"].items():
            if isinstance(pp_args, list) and pp_args:
                cmd_args.extend(["--ppa", f'"{pp_name}:{" ".join(pp_args)}"'])
    if any(isinstance(p, dict) and p.get("key") == "FFmpegMetadata" and p.get("add_metadata") for p in postprocessors):
        cmd_args.append("--embed-metadata")
    if opts.get("replace_in_metadata"):
        for rim in opts["replace_in_metadata"]:
            if len(rim) == 3:
                cmd_args.extend(["--replace-in-metadata", f'"{rim[0]}"', f'"{rim[1]}"', f'"{rim[2]}"'])
    if opts.get("parse_metadata"):
        for pm in opts["parse_metadata"]:
            cmd_args.extend(["--parse-metadata", f'"{pm}"'])
    if any(isinstance(p, dict) and p.get("key") == "FFmpegMetadata" and p.get("add_chapters") for p in postprocessors):
        cmd_args.append("--embed-chapters")
    if opts.get("split_chapters"):
        cmd_args.append("--split-chapters")

    # Subtitles
    if opts.get("writesubtitles"):
        cmd_args.append("--write-subs")
    if opts.get("writeautomaticsub"):
        cmd_args.append("--write-auto-subs")
    if opts.get("subtitleslangs"):
        langs = ",".join(opts["subtitleslangs"]) if isinstance(opts["subtitleslangs"], list) else str(opts["subtitleslangs"])
        cmd_args.extend(["--sub-langs", f'"{langs}"'])
    if opts.get("subtitlesformat"):
        cmd_args.extend(["--sub-format", opts["subtitlesformat"]])
    if any(isinstance(p, dict) and p.get("key") == "FFmpegEmbedSubtitle" for p in postprocessors):
        cmd_args.append("--embed-subs")

    # SponsorBlock
    if opts.get("sponsorblock_remove"):
        sb_rem = ",".join(opts["sponsorblock_remove"]) if isinstance(opts["sponsorblock_remove"], list) else str(opts["sponsorblock_remove"])
        cmd_args.extend(["--sponsorblock-remove", f'"{sb_rem}"'])
    if opts.get("sponsorblock_mark"):
        sb_mk = ",".join(opts["sponsorblock_mark"]) if isinstance(opts["sponsorblock_mark"], list) else str(opts["sponsorblock_mark"])
        cmd_args.extend(["--sponsorblock-mark", f'"{sb_mk}"'])

    # Cut segments / download sections
    parsed_ranges = opts.get("_parsed_ranges", [])
    if parsed_ranges:
        for start_s, end_s in parsed_ranges:
            start_str = format_seconds(start_s) if start_s != float("-inf") else "0:00"
            end_str = format_seconds(end_s) if end_s != float("inf") else "inf"
            cmd_args.extend(["--download-sections", f'"*{start_str}-{end_str}"'])

    # Network, Cookies & Auth
    if opts.get("cookiefile"):
        cmd_args.extend(["--cookies", f'"{opts["cookiefile"]}"'])
    if opts.get("proxy"):
        cmd_args.extend(["--proxy", f'"{opts["proxy"]}"'])
    if opts.get("force_ipv4"):
        cmd_args.append("--force-ipv4")
    if opts.get("geo_bypass"):
        cmd_args.append("--geo-bypass")
    if opts.get("impersonate"):
        imp_target = str(opts["impersonate"])
        if imp_target and imp_target.lower() != "none":
            cmd_args.extend(["--impersonate", imp_target])
    if opts.get("http_headers", {}).get("User-Agent"):
        cmd_args.extend(["--user-agent", f'"{opts["http_headers"]["User-Agent"]}"'])

    # Extractor args (PO Token, Client rotation)
    ext_args = opts.get("extractor_args", {})
    if ext_args and isinstance(ext_args, dict):
        for ext_key, sub_val in ext_args.items():
            if isinstance(sub_val, list):
                cmd_args.extend(["--extractor-args", f'"{ext_key}:{";".join(str(x) for x in sub_val)}"'])
            elif isinstance(sub_val, dict):
                sub_parts = []
                for sub_k, sub_v in sub_val.items():
                    if isinstance(sub_v, list):
                        sub_parts.append(f"{sub_k}={','.join(str(x) for x in sub_v)}")
                    else:
                        sub_parts.append(f"{sub_k}={sub_v}")
                if sub_parts:
                    cmd_args.extend(["--extractor-args", f'"{ext_key}:{";".join(sub_parts)}"'])
            elif isinstance(sub_val, str):
                cmd_args.extend(["--extractor-args", f'"{ext_key}:{sub_val}"'])

    # JavaScript Runtimes & Remote Components
    if opts.get("js_runtimes"):
        for rt in opts["js_runtimes"].keys():
            cmd_args.extend(["--js-runtimes", rt])
    if opts.get("remote_components"):
        for rc in opts["remote_components"]:
            cmd_args.extend(["--remote-components", rc])

    # Retries and Fragments
    if opts.get("concurrent_fragment_downloads"):
        cmd_args.extend(["--concurrent-fragments", str(opts["concurrent_fragment_downloads"])])
    if opts.get("retries") and opts["retries"] != 3:
        cmd_args.extend(["--retries", str(opts["retries"])])
    if opts.get("fragment_retries") and opts["fragment_retries"] != 10:
        cmd_args.extend(["--fragment-retries", str(opts["fragment_retries"])])
    if opts.get("ratelimit"):
        cmd_args.extend(["--limit-rate", str(opts["ratelimit"])])
    if opts.get("continuedl"):
        cmd_args.append("--continue")

    # Extra commands
    if adv and adv.extra_commands:
        cmd_args.append(adv.extra_commands.strip())
    if getattr(request, "custom_command", None):
        cmd_args.append(request.custom_command.strip())

    # URL
    cmd_args.append(f'"{clean_url}"')

    # Construct multiline formatted CLI string with backslashes
    multiline_lines = [cmd_args[0]]
    i = 1
    while i < len(cmd_args):
        token = cmd_args[i]
        if token.startswith("-") and i + 1 < len(cmd_args) and not cmd_args[i+1].startswith("-"):
            multiline_lines.append(f"  {token} {cmd_args[i+1]}")
            i += 2
        else:
            multiline_lines.append(f"  {token}")
            i += 1

    multiline_str = " \\\n".join(multiline_lines)
    single_line_str = " ".join(cmd_args)
    return multiline_str, single_line_str


def log_session_header(download_id: str, request: DownloadRequest, settings: AppSettings, clean_url: str, opts: dict):
    """Generate and write a comprehensive, clean pre-execution session header into the execution log."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        import yt_dlp.version
        ytdlp_ver = yt_dlp.version.__version__
    except Exception:
        ytdlp_ver = getattr(yt_dlp, "__version__", "unknown")
    py_ver = sys.version.split()[0]
    os_info = f"{platform.system()} {platform.release()}"

    ffmpeg_detected = False
    try:
        f_res = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True, timeout=2)
        ffmpeg_detected = (f_res.returncode == 0)
    except Exception:
        pass
    ffmpeg_str = "Available" if ffmpeg_detected else "Not detected in PATH"

    adv = getattr(request, "advanced_options", None) or getattr(request, "advanced", None)
    is_audio_only = bool(
        (request.audio_only or (adv and adv.recode_audio) or (request.audio_format_id and not request.video_format_id))
        and not (adv and adv.remove_audio)
    )

    if is_audio_only:
        target_codec = (adv.recode_audio if adv and adv.recode_audio else getattr(settings, "default_audio_container", "mp3")) or "mp3"
        quality_str = (adv.audio_quality if adv and adv.audio_quality else getattr(settings, "default_audio_quality", "0")) or "0"
        media_label = f"Audio Track [Extract & Recode -> {target_codec.upper()} | Quality: {quality_str}]"
    else:
        v_cont = getattr(settings, "default_video_container", "mp4") or "mp4"
        media_label = f"Video + Audio Stream [Container: {v_cont.upper()}]"

    format_spec = opts.get("format", "auto (bestvideo+bestaudio/best)")
    staging_path = opts.get("paths", {}).get("home", get_staging_dir(download_id))
    out_dir = settings.download_dir or str(Path.home() / "Downloads")

    cookie_str = "Active (Imported Netscape jar)" if opts.get("cookiefile") else "None (Guest Mode)"
    po_cfg = getattr(settings, "potoken_settings", None)
    po_mode = po_cfg.mode if po_cfg else "none"
    has_visitor = bool(po_cfg and po_cfg.visitor_data)
    po_summary = f"Mode: [{po_mode}] | VisitorData: {'Present' if has_visitor else 'None'}"

    clients_list = ["android", "mweb", "web", "ios"]
    if po_cfg and getattr(po_cfg, "player_clients", None):
        clients_list = po_cfg.player_clients
    clients_str = ", ".join(clients_list)

    proxy_str = opts.get("proxy") or "Direct (No proxy)"
    geo_bypass_str = "Enabled" if opts.get("geo_bypass") else "Disabled"

    embed_thumb = "Enabled" if any(isinstance(p, dict) and p.get("key") == "EmbedThumbnail" for p in opts.get("postprocessors", [])) else "Disabled"
    write_thumb_str = "Enabled" if (opts.get("writethumbnail") and (getattr(adv, "write_thumbnail", None) or getattr(settings, "write_thumbnail", False))) else "Disabled"
    embed_meta = "Enabled (yt-dlp Internal & Vorbis tags)" if getattr(settings, "embed_metadata", True) else "Disabled"
    synced_lyrics = "Enabled (LRC providers)" if (is_audio_only and getattr(settings, "embed_lyrics", True)) else "N/A"

    sb_str = "Disabled"
    if opts.get("sponsorblock_remove"):
        sb_str = f"Remove [{', '.join(opts['sponsorblock_remove'])}]"
    elif opts.get("sponsorblock_mark"):
        sb_str = f"Mark [{', '.join(opts['sponsorblock_mark'])}]"

    cli_multiline, _ = generate_ytdlp_cli_command(opts, clean_url, request, settings)

    header_lines = [
        "=" * 80,
        f"[SESSION] Execution Session Started: {now_str}",
        f"[SESSION] Task ID: {download_id}",
        f"[SESSION] Environment: yt-dlp {ytdlp_ver} | Python {py_ver} | FFmpeg ({ffmpeg_str}) | OS: {os_info}",
        "=" * 80,
        f"[TARGET] Original Input URL : {request.url}",
        f"[TARGET] Normalized Stream URL: {clean_url}",
        f"[CONFIG] Target Media Type  : {media_label}",
        f"[CONFIG] Format Selector    : {format_spec}",
        f"[CONFIG] Destination Folder : {out_dir}",
        f"[CONFIG] Sandbox Directory  : {staging_path}",
        f"[CONFIG] Network & Security :",
        f"  - Cookies State  : {cookie_str}",
        f"  - PO Token Bypass: {po_summary}",
        f"  - Client Rotation: {clients_str}",
        f"  - Impersonation  : {str(opts.get('impersonate')) if opts.get('impersonate') else 'Disabled'}",
        f"  - Network Route  : {proxy_str} | Geo-Bypass: {geo_bypass_str}",
        f"[CONFIG] Feature Toggles   :",
        f"  - Metadata Tagging : {embed_meta}",
        f"  - Thumbnail Cover  : {embed_thumb} | Save Image: {write_thumb_str}",
        f"  - Synced Lyrics    : {synced_lyrics}",
        f"  - SponsorBlock     : {sb_str}",
        "-" * 80,
        "[COMMAND] yt-dlp CLI Command:",
        cli_multiline,
        "=" * 80,
        "[EXECUTION] Spawning yt-dlp core stream extractor process...",
    ]

    for hl in header_lines:
        append_execution_log(download_id, hl)


def _run_download(download_id: str, request: DownloadRequest, settings: AppSettings, loop: asyncio.AbstractEventLoop):
    """Execute download synchronously in worker thread using temporary staging folder."""
    status_obj = download_registry[download_id]
    cookie_file_path = None
    start_time = time.time()
    
    output_dir = settings.download_dir
    if not output_dir or not os.path.isabs(output_dir) or (os.name != "nt" and (":" in output_dir or not os.path.exists(output_dir))):
        if os.path.isdir("/downloads"):
            output_dir = "/downloads"
        else:
            output_dir = str(Path.home() / "Downloads")
    os.makedirs(output_dir, exist_ok=True)
    
    staging_dir = get_staging_dir(download_id)
    _thread_download_context.download_id = download_id
    
    # ── Initialize StreamProcessExtractor & Memory Execution Logs ──
    extractor = StreamProcessExtractor(download_id=download_id, loop=loop)
    _active_extractors[download_id] = extractor
    with _subprocess_lock:
        if download_id not in _execution_logs:
            _execution_logs[download_id] = []

    try:
        opts = _build_ytdlp_opts(request, settings, download_id, staging_dir, loop=loop)
        cookie_file_path = opts.get("cookiefile")
        
        parsed_ranges = opts.get("_parsed_ranges")
        has_multi = bool(parsed_ranges and len(parsed_ranges) > 1)

        opts["progress_hooks"] = [
            lambda d: _progress_hook(d, download_id, loop, has_multi_cuts=has_multi)
        ]
        
        clean_url = normalize_url(request.url)
        logger.info(f"Starting download {download_id} for normalized URL: {clean_url}")

        # ── Pre-Execution Session Header & Equivalent CLI Command ──
        log_session_header(download_id, request, settings, clean_url, opts)
        
        # ── Route stdout/stderr through StreamProcessExtractor ──
        # Fixes OSError [Errno 22] on Windows background threads and captures 100% of execution logs
        original_stderr = sys.stderr
        original_stdout = sys.stdout
        sys.stderr = extractor
        sys.stdout = extractor

        # Start live progress watcher for FFmpeg segmented downloads
        stop_progress_monitor = threading.Event()

        def _monitor_ffmpeg_progress():
            prog_file = os.path.join(staging_dir, "ffmpeg_progress.log")
            total_cut_duration = 0.0
            cut_durations = []
            if parsed_ranges:
                for s, e in parsed_ranges:
                    d = (e - s) if e != float("inf") else 60.0
                    cut_durations.append(d)
                    total_cut_duration += d
            if total_cut_duration <= 0:
                total_cut_duration = 100.0

            last_pos = 0
            curr_cut_idx = 0
            completed_time = 0.0

            while not stop_progress_monitor.is_set():
                stop_progress_monitor.wait(0.5)
                if not os.path.exists(prog_file):
                    continue
                try:
                    with open(prog_file, "r", encoding="utf-8", errors="replace") as pf:
                        pf.seek(last_pos)
                        lines = pf.readlines()
                        last_pos = pf.tell()

                    for line in lines:
                        line = line.strip()
                        if line.startswith("out_time_us="):
                            try:
                                us = int(line.split("=")[1])
                                sec = us / 1000000.0
                                this_cut_dur = cut_durations[curr_cut_idx] if curr_cut_idx < len(cut_durations) else 30.0
                                total_elapsed = completed_time + min(sec, this_cut_dur)
                                pct = min(98.0, (total_elapsed / total_cut_duration) * 100.0)
                                if pct > (status_obj.percent or 0):
                                    status_obj.percent = round(pct, 1)
                                    status_obj.status = DownloadStatusEnum.DOWNLOADING
                                    _push_live_status(status_obj, f"Downloading cut segment {min(curr_cut_idx + 1, len(parsed_ranges))}/{len(parsed_ranges)} ({pct:.1f}%)...", loop)
                            except Exception:
                                pass
                        elif line.startswith("speed="):
                            sp_val = line.split("=")[1].strip()
                            if sp_val and sp_val != "N/A":
                                status_obj.speed = sp_val
                        elif line.startswith("total_size="):
                            try:
                                ts_val = int(line.split("=")[1].strip())
                                if ts_val > 0:
                                    status_obj.downloaded_bytes = ts_val
                            except Exception:
                                pass
                        elif line.startswith("progress=end"):
                            if curr_cut_idx < len(cut_durations):
                                completed_time += cut_durations[curr_cut_idx]
                            curr_cut_idx += 1
                except Exception:
                    pass

        monitor_thread = None
        if parsed_ranges:
            monitor_thread = threading.Thread(target=_monitor_ffmpeg_progress, daemon=True)
            monitor_thread.start()

        downloaded_info_dict = None
        try:
            with yt_dlp.YoutubeDL(opts) as ydl:
                ydl._out_files.error = extractor
                ydl._out_files.out = extractor
                
                if not status_obj.title or status_obj.title in ("Unknown", "Initializing..."):
                    try:
                        info_pre = ydl.extract_info(clean_url, download=False)
                        if info_pre:
                            if "entries" in info_pre and info_pre["entries"]:
                                info_pre = info_pre["entries"][0]
                            status_obj.title = info_pre.get("title", "Unknown")
                            status_obj.thumbnail = info_pre.get("thumbnail")
                            if info_pre.get("duration") and not status_obj.duration:
                                status_obj.duration = float(info_pre.get("duration"))
                            if info_pre.get("uploader") and not getattr(status_obj, "uploader", None):
                                try:
                                    status_obj.uploader = info_pre.get("uploader")
                                except Exception:
                                    pass
                            downloaded_info_dict = info_pre
                    except Exception:
                        pass
                
                info_res = ydl.extract_info(clean_url, download=True)
                if info_res:
                    if "entries" in info_res and info_res["entries"]:
                        info_res = info_res["entries"][0]
                    downloaded_info_dict = info_res
                    if not status_obj.title or status_obj.title in ("Unknown", "Initializing..."):
                        status_obj.title = downloaded_info_dict.get("title") or status_obj.title
                    if not status_obj.thumbnail:
                        status_obj.thumbnail = downloaded_info_dict.get("thumbnail")
                    if downloaded_info_dict.get("uploader"):
                        try:
                            status_obj.uploader = downloaded_info_dict.get("uploader")
                        except Exception:
                            pass
        finally:
            stop_progress_monitor.set()
            if monitor_thread and monitor_thread.is_alive():
                monitor_thread.join(timeout=1.0)
            sys.stderr = original_stderr
            sys.stdout = original_stdout
            extractor.flush()

        # ─── If multiple cuts were downloaded, merge them together with FFmpeg ───
        adv = getattr(request, "advanced_options", None) or getattr(request, "advanced", None)
        if os.path.exists(staging_dir):
            media_exts = {".mp4", ".mkv", ".webm", ".mov", ".flv", ".avi", ".ts", ".m4v", ".mp3", ".m4a", ".opus", ".flac", ".wav", ".ogg", ".aac"}
            cut_parts = []
            for item in os.listdir(staging_dir):
                ext = os.path.splitext(item)[1].lower()
                if "_cutpart" in item and ext in media_exts and not item.endswith((".part", ".ytdl")):
                    fp = os.path.join(staging_dir, item)
                    if os.path.isfile(fp):
                        cut_parts.append(fp)

            if len(cut_parts) > 1:
                def _extract_start(p):
                    base_name = os.path.splitext(os.path.basename(p))[0]
                    m = re.search(r'_cutpart([0-9]+(?:\.[0-9]+)?)', base_name)
                    if m:
                        try:
                            return float(m.group(1))
                        except ValueError:
                            pass
                    return 0.0

                cut_parts.sort(key=_extract_start)
                _push_live_status(status_obj, f"Merging {len(cut_parts)} cut segments with FFmpeg...", loop)
                logger.info(f"Merging {len(cut_parts)} cut segments into a single file with FFmpeg...")
                append_execution_log(download_id, "=" * 80)
                append_execution_log(download_id, f"[POSTPROCESS] Multi-segment trim mode: Found {len(cut_parts)} cut segments.")
                append_execution_log(download_id, f"[POSTPROCESS] Merging cut segments into a single file with FFmpeg concat...")

                first_p = cut_parts[0]
                clean_base = re.sub(r'_cutpart[0-9]+(?:\.[0-9]+)?', '', os.path.basename(first_p))
                merged_output = os.path.join(staging_dir, f"merged_concat_{clean_base}")
                concat_list_file = os.path.join(staging_dir, "concat_cuts.txt")

                with open(concat_list_file, "w", encoding="utf-8") as cf:
                    for cp in cut_parts:
                        safe_path = cp.replace('\\', '/').replace("'", "'\\''")
                        cf.write(f"file '{safe_path}'\n")

                concat_cmd = [
                    "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                    "-i", concat_list_file,
                    "-map", "0:V:0?", "-map", "0:a?", "-map", "0:s?",
                    "-c", "copy",
                    merged_output
                ]
                append_execution_log(download_id, f"[POSTPROCESS] Executing FFmpeg copy concat command: {' '.join(concat_cmd)}")
                res = subprocess.run(concat_cmd, capture_output=True, text=True)
                if res.returncode != 0 or not os.path.exists(merged_output) or os.path.getsize(merged_output) == 0:
                    logger.warning(f"FFmpeg copy concat failed, retrying with re-encode: {res.stderr}")
                    append_execution_log(download_id, f"[WARN] Direct stream copy concat failed; re-encoding cuts with FFmpeg fallback...")
                    first_ext = os.path.splitext(first_p)[1].lower()
                    if first_ext in (".mp3", ".m4a", ".opus", ".flac", ".wav", ".ogg", ".aac"):
                        fallback_cmd = [
                            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                            "-i", concat_list_file,
                            "-map", "0:a?",
                            "-c:a", "aac",
                            merged_output
                        ]
                    else:
                        fallback_cmd = [
                            "ffmpeg", "-y", "-f", "concat", "-safe", "0",
                            "-i", concat_list_file,
                            "-map", "0:V:0?", "-map", "0:a?",
                            "-c:v", "libx264", "-c:a", "aac",
                            merged_output
                        ]
                    append_execution_log(download_id, f"[POSTPROCESS] Executing FFmpeg re-encode fallback: {' '.join(fallback_cmd)}")
                    subprocess.run(fallback_cmd, capture_output=True, text=True)

                if os.path.exists(merged_output) and os.path.getsize(merged_output) > 0:
                    for cp in cut_parts:
                        try:
                            os.remove(cp)
                        except Exception:
                            pass
                    try:
                        os.remove(concat_list_file)
                    except Exception:
                        pass
                    final_target = os.path.join(staging_dir, clean_base)
                    if os.path.exists(final_target):
                        try:
                            os.remove(final_target)
                        except Exception:
                            pass
                    os.rename(merged_output, final_target)
                    logger.info(f"Successfully merged cuts into final file: {final_target}")
                    append_execution_log(download_id, f"[POSTPROCESS] Successfully merged {len(cut_parts)} cuts into unified file: {os.path.basename(final_target)}")

                    # Attach thumbnail to final merged MP4 video file if available
                    embed_thumb = getattr(settings, "embed_thumbnail", True)
                    if adv and getattr(adv, "embed_thumbnail", None) is not None:
                        embed_thumb = adv.embed_thumbnail
                    if embed_thumb and final_target.lower().endswith((".mp4", ".m4v")):
                        thumb_file = None
                        for sf in os.listdir(staging_dir):
                            if sf.lower().endswith((".jpg", ".jpeg", ".png")) and not sf.startswith("merged_"):
                                thumb_file = os.path.join(staging_dir, sf)
                                break
                        if thumb_file and os.path.exists(thumb_file):
                            try:
                                from mutagen.mp4 import MP4, MP4Cover
                                mp4_obj = MP4(final_target)
                                with open(thumb_file, "rb") as tf:
                                    mp4_obj["covr"] = [MP4Cover(tf.read(), imageformat=MP4Cover.FORMAT_JPEG)]
                                mp4_obj.save()
                                logger.info(f"Embedded cover thumbnail to final merged MP4: {final_target}")
                                append_execution_log(download_id, f"[POSTPROCESS] Attached cover thumbnail to merged video file.")
                            except Exception as th_err:
                                logger.debug(f"Mutagen MP4 cover art attach error: {th_err}")
            elif len(cut_parts) == 1:
                clean_base = re.sub(r'_cutpart[0-9]+(?:\.[0-9]+)?', '', os.path.basename(cut_parts[0]))
                final_target = os.path.join(staging_dir, clean_base)
                if os.path.exists(final_target):
                    try:
                        os.remove(final_target)
                    except Exception:
                        pass
                try:
                    os.rename(cut_parts[0], final_target)
                except Exception:
                    pass
                embed_thumb = getattr(settings, "embed_thumbnail", True)
                if adv and getattr(adv, "embed_thumbnail", None) is not None:
                    embed_thumb = adv.embed_thumbnail
                if embed_thumb and final_target.lower().endswith((".mp4", ".m4v")):
                    thumb_file = None
                    for sf in os.listdir(staging_dir):
                        if sf.lower().endswith((".jpg", ".jpeg", ".png")) and not sf.startswith("merged_"):
                            thumb_file = os.path.join(staging_dir, sf)
                            break
                    if thumb_file and os.path.exists(thumb_file):
                        try:
                            from mutagen.mp4 import MP4, MP4Cover
                            mp4_obj = MP4(final_target)
                            if "covr" not in mp4_obj:
                                with open(thumb_file, "rb") as tf:
                                    mp4_obj["covr"] = [MP4Cover(tf.read(), imageformat=MP4Cover.FORMAT_JPEG)]
                                mp4_obj.save()
                        except Exception:
                            pass

        # ─── FFmpeg is NOW 100% finished writing the audio file! ───
        # Scan staging_dir for audio file, poster image, and downloaded lyrics
        audio_path = None
        thumbnail_path = None
        lyrics_text = None

        staging_files = []
        if os.path.exists(staging_dir):
            for root, _, files in os.walk(staging_dir):
                for f in files:
                    staging_files.append(os.path.join(root, f))

        for full_p in staging_files:
            item = os.path.basename(full_p)
            ext = os.path.splitext(item)[1].lower()
            if ext in (".mp3", ".m4a", ".opus", ".flac", ".ogg", ".aac"):
                audio_path = full_p
            elif ext in (".jpg", ".jpeg", ".png", ".webp"):
                thumbnail_path = full_p
            elif ext in (".lrc", ".vtt", ".srt", ".txt"):
                try:
                    with open(full_p, "r", encoding="utf-8", errors="ignore") as lf:
                        lyrics_text = lf.read().strip()
                except Exception:
                    pass

        adv = getattr(request, "advanced_options", None) or getattr(request, "advanced", None)
        is_audio_download = bool(
            (request.audio_only or (adv and adv.recode_audio) or (request.audio_format_id and not request.video_format_id))
            and not (adv and adv.remove_audio)
        )

        if is_audio_download and audio_path:
            append_execution_log(download_id, "=" * 80)
            append_execution_log(download_id, "[POSTPROCESS] Audio track detected; executing audio enrichment pipeline...")
            append_execution_log(download_id, f"[POSTPROCESS] Audio Stream: {os.path.basename(audio_path)}")
            
            # Extract internal yt-dlp metadata (Title, Artist, Album, Year, Genre) without external iTunes APIs
            _push_live_status(status_obj, "Processing internal audio metadata...", loop)
            append_execution_log(download_id, "[POSTPROCESS] Extracting native stream metadata via yt-dlp internal parser...")
            audio_meta = extract_ytdlp_audio_metadata(downloaded_info_dict, status_obj)
            append_execution_log(download_id, f"[POSTPROCESS] Native Metadata: \"{audio_meta['TITLE']}\" by {audio_meta['ARTIST']} (Album: \"{audio_meta['ALBUM']}\", Year: {audio_meta['DATE'] or 'N/A'})")
            
            # Prepare clean query for synchronized lyrics search
            search_q = f"{audio_meta['ARTIST']} {audio_meta['TITLE']}".strip() if audio_meta['ARTIST'] else audio_meta['TITLE']
            
            # Ensure the authentic video/track thumbnail is always preserved (from yt-dlp / YouTube)
            embed_thumb = getattr(settings, "embed_thumbnail", True)
            if adv and getattr(adv, "embed_thumbnail", None) is not None:
                embed_thumb = adv.embed_thumbnail
                
            if embed_thumb:
                # If no thumbnail was downloaded into staging_dir, fetch the authentic source thumbnail from status_obj
                if (not thumbnail_path or not os.path.exists(thumbnail_path)) and status_obj.thumbnail:
                    try:
                        _push_live_status(status_obj, "Downloading authentic source thumbnail...", loop)
                        append_execution_log(download_id, f"[POSTPROCESS] Fetching authentic source thumbnail from: {status_obj.thumbnail}")
                        raw_thumb_path = os.path.join(staging_dir, "source_thumb_raw")
                        source_jpg_path = os.path.join(staging_dir, "source_cover.jpg")
                        req = urllib.request.Request(status_obj.thumbnail, headers={'User-Agent': 'Mozilla/5.0'})
                        with urllib.request.urlopen(req, timeout=10) as response, open(raw_thumb_path, 'wb') as out_f:
                            shutil.copyfileobj(response, out_f)
                        # Crop to square JPG with ffmpeg (matching YTDLnis)
                        cmd = [
                            "ffmpeg", "-y", "-i", raw_thumb_path,
                            "-vf", "crop='if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'",
                            "-qmin", "1", "-q:v", "1", source_jpg_path
                        ]
                        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
                        thumbnail_path = source_jpg_path
                        append_execution_log(download_id, f"[POSTPROCESS] Authentic source thumbnail prepared successfully (1:1 square crop).")
                    except Exception as th_err:
                        logger.warning(f"Failed to fetch source thumbnail from URL: {th_err}")
                        append_execution_log(download_id, f"[WARN] Failed to fetch source thumbnail: {th_err}")
                elif thumbnail_path and os.path.exists(thumbnail_path):
                    # Ensure audio thumbnail is converted to high-quality 1:1 square JPEG for maximum player compatibility
                    try:
                        sq_jpg_path = os.path.join(staging_dir, "cover_square.jpg")
                        subprocess.run(
                            [
                                "ffmpeg", "-y", "-i", thumbnail_path,
                                "-vf", "crop='if(gt(ih,iw),iw,ih)':'if(gt(iw,ih),ih,iw)'",
                                "-qmin", "1", "-q:v", "1", sq_jpg_path
                            ],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True
                        )
                        if os.path.exists(sq_jpg_path) and os.path.getsize(sq_jpg_path) > 0:
                            thumbnail_path = sq_jpg_path
                            append_execution_log(download_id, f"[POSTPROCESS] Converted and cropped cover art to 1:1 square JPEG.")
                    except Exception as sq_err:
                        logger.debug(f"Could not crop/convert thumbnail {thumbnail_path}: {sq_err}")
            
            # Fetch synced lyrics if not already downloaded and setting is enabled
            if not lyrics_text and settings.embed_lyrics:
                _push_live_status(status_obj, "Searching synced lyrics...", loop)
                append_execution_log(download_id, f"[POSTPROCESS] Searching synchronized lyrics (LRC) for \"{search_q}\"...")
                lyrics_text = fetch_synced_lyrics(search_q)
                if lyrics_text:
                    append_execution_log(download_id, f"[POSTPROCESS] Synchronized lyrics retrieved ({len(lyrics_text.splitlines())} lines).")
                    try:
                        clean_a = re.sub(r'[\\/*?:"<>|\0-\x1f]', "", audio_meta['ARTIST']).strip()
                        clean_t = re.sub(r'[\\/*?:"<>|\0-\x1f]', "", audio_meta['TITLE']).strip()
                        lrc_fname = f"{clean_a} - {clean_t}.lrc" if (clean_a and clean_t) else f"{clean_t}.lrc"
                        with open(os.path.join(staging_dir, lrc_fname), "w", encoding="utf-8") as lrc_file:
                            lrc_file.write(lyrics_text)
                    except Exception as lrc_e:
                        logger.debug(f"Failed to write sidecar .lrc file: {lrc_e}")
                else:
                    append_execution_log(download_id, f"[POSTPROCESS] No synchronized lyrics matched for this track.")
                
            # Add COMMENT for mutagen (download URL)
            audio_meta['COMMENT'] = f"Downloaded via yt-dlp App. Source: {status_obj.url}"
                
            # Apply Mutagen tagging AFTER FFmpeg completes so cover art and ID3 tags are preserved!
            _push_live_status(status_obj, "Embedding audio tags & artwork...", loop)
            append_execution_log(download_id, f"[POSTPROCESS] Applying Mutagen tags (ID3v2.4 / Vorbis / MP4 tags, native cover art, synced lyrics, source URL)...")
            apply_mutagen_audio_tags(audio_path, thumbnail_path if embed_thumb else None, lyrics_text, audio_meta, status_obj.title or "")
            append_execution_log(download_id, f"[POSTPROCESS] Mutagen tags successfully embedded into media container.")

        # Move final tagged file(s) from staging_dir to output_dir
        _push_live_status(status_obj, "Moving file to Downloads...", loop)
        append_execution_log(download_id, "=" * 80)
        append_execution_log(download_id, f"[POSTPROCESS] Relocating output files to destination folder: {output_dir}")
        final_files = []
        
        final_name_base = None
        if is_audio_download and 'audio_meta' in locals() and audio_meta and audio_meta.get('TITLE') and audio_meta.get('ARTIST'):
            # Sanitize invalid Windows filename chars including control characters
            clean_artist = re.sub(r'[\\/*?:"<>|\0-\x1f]', "", audio_meta['ARTIST']).strip()
            clean_title = re.sub(r'[\\/*?:"<>|\0-\x1f]', "", audio_meta['TITLE']).strip()
            if clean_artist and clean_title:
                final_name_base = f"{clean_artist} - {clean_title}".rstrip('. ')

        media_extensions = {".mp3", ".m4a", ".opus", ".flac", ".ogg", ".aac", ".mp4", ".mkv", ".webm"}
        
        # Refresh staging files list to capture files converted or created by FFmpeg/Mutagen
        staging_files = []
        if os.path.exists(staging_dir):
            for root, _, files in os.walk(staging_dir):
                for f in files:
                    staging_files.append(os.path.join(root, f))

        # Check if there are any .part files left over. If so, yt-dlp failed prematurely.
        has_part_files = any(f.endswith((".part", ".ytdl")) for f in staging_files)
        if has_part_files:
            raise Exception(f"Download failed: incomplete .part files found in staging dir.")
            
        for source_path in staging_files:
            if not os.path.exists(source_path):
                continue
            item = os.path.basename(source_path)
            base, ext = os.path.splitext(item)
            
            # Handle auxiliary image files (save if write_thumbnail requested, otherwise delete)
            if ext.lower() in {".jpg", ".jpeg", ".webp", ".png"}:
                write_thumb = getattr(settings, "write_thumbnail", False)
                if adv and getattr(adv, "write_thumbnail", None) is not None:
                    write_thumb = adv.write_thumbnail
                if write_thumb:
                    rel_path = os.path.relpath(source_path, staging_dir)
                    target_path = os.path.join(output_dir, rel_path)
                    if final_name_base:
                        rel_dir = os.path.dirname(rel_path)
                        target_path = os.path.join(output_dir, rel_dir, f"{final_name_base}{ext}")
                    if os.path.exists(target_path):
                        target_dir = os.path.dirname(target_path)
                        cur_base = os.path.splitext(os.path.basename(target_path))[0]
                        target_path = os.path.join(target_dir, f"{cur_base}_{download_id[:6]}{ext}")
                    os.makedirs(os.path.dirname(target_path), exist_ok=True)
                    shutil.move(source_path, target_path)
                    append_execution_log(download_id, f"[POSTPROCESS] Saved standalone thumbnail image: {os.path.basename(source_path)} -> {target_path}")
                else:
                    try:
                        os.remove(source_path)
                    except Exception:
                        pass
                continue
                
            # Do not move partial yt-dlp files
            if item.endswith(".part") or item.endswith(".ytdl"):
                continue

            # Do not move log files into user's Downloads folder - logs belong in data/logs!
            if ext.lower() == ".log" or item == "execution.log":
                continue
                
            rel_path = os.path.relpath(source_path, staging_dir)
            target_path = os.path.join(output_dir, rel_path)
            
            if final_name_base and ext.lower() in media_extensions:
                rel_dir = os.path.dirname(rel_path)
                target_path = os.path.join(output_dir, rel_dir, f"{final_name_base}{ext}")
            
            if os.path.exists(target_path):
                target_dir = os.path.dirname(target_path)
                cur_base = os.path.splitext(os.path.basename(target_path))[0]
                target_path = os.path.join(target_dir, f"{cur_base}_{download_id[:6]}{ext}")
                    
            os.makedirs(os.path.dirname(target_path), exist_ok=True)
            shutil.move(source_path, target_path)
            if ext.lower() in media_extensions:
                final_files.append(target_path)
            append_execution_log(download_id, f"[POSTPROCESS] Relocated: {os.path.basename(source_path)} -> {target_path}")
                            
        # Debug capture before cleanup
        debug_contents = []
        try:
            debug_contents = os.listdir(staging_dir)
        except Exception:
            pass
            
        # Final cleanup
        try:
            shutil.rmtree(staging_dir, ignore_errors=True)
            append_execution_log(download_id, f"[CLEANUP] Staging sandbox directory successfully cleaned up.")
        except Exception as cl_e:
            append_execution_log(download_id, f"[CLEANUP] Sandbox cleanup notice: {cl_e}")
            
        if final_files:
            status_obj.filename = final_files[0]
            try:
                if os.path.exists(final_files[0]):
                    real_file_size = float(os.path.getsize(final_files[0]))
                    status_obj.total_bytes = real_file_size
                    status_obj.downloaded_bytes = real_file_size
                    status_obj.filesize = format_bytes_human(real_file_size)
                    logger.info(f"Updated final file size for {final_files[0]}: {real_file_size} bytes ({status_obj.filesize})")
                    append_execution_log(download_id, f"[VERIFY] Verifying storage integrity on disk:")
                    append_execution_log(download_id, f"  - Destination : {final_files[0]}")
                    append_execution_log(download_id, f"  - File Exists : True")
                    append_execution_log(download_id, f"  - Exact Size  : {int(real_file_size):,} bytes ({status_obj.filesize})")
            except Exception as e:
                logger.warning(f"Could not calculate final file size: {e}")
        else:
            # If ignoreerrors=True suppressed a fatal error and no final file was produced
            raise Exception(f"Download failed: No final media file was produced. Staging dir contained: {debug_contents}")
            
        status_obj.status = DownloadStatusEnum.FINISHED
        status_obj.percent = 100.0
        status_obj.completed_at = datetime.now().isoformat()
        logger.info(f"Download {download_id} finished successfully!")

        elapsed_sec = time.time() - start_time
        duration_str = format_seconds(elapsed_sec)
        append_execution_log(download_id, "=" * 80)
        append_execution_log(download_id, f"[COMPLETE] Download task completed successfully!")
        append_execution_log(download_id, f"[SUMMARY] Final Status : FINISHED")
        append_execution_log(download_id, f"[SUMMARY] Elapsed Time : {duration_str} ({elapsed_sec:.1f}s)")
        append_execution_log(download_id, f"[SUMMARY] Total Size   : {status_obj.filesize}")
        append_execution_log(download_id, f"[SUMMARY] Saved File   : {status_obj.filename}")
        append_execution_log(download_id, "=" * 80)
        
    except yt_dlp.utils.DownloadCancelled as e:
        is_paused = _cancel_flags.get(download_id) == "PAUSE"
        elapsed_sec = time.time() - start_time
        duration_str = format_seconds(elapsed_sec)
        if is_paused:
            status_obj.status = DownloadStatusEnum.PAUSED
            logger.info(f"Download {download_id} was paused.")
            append_execution_log(download_id, "=" * 80)
            append_execution_log(download_id, f"[PAUSED] Download task was paused by user after {duration_str} ({elapsed_sec:.1f}s).")
            append_execution_log(download_id, "=" * 80)
        else:
            status_obj.status = DownloadStatusEnum.CANCELLED
            logger.info(f"Download {download_id} was cancelled.")
            append_execution_log(download_id, "=" * 80)
            append_execution_log(download_id, f"[CANCELLED] Download task was cancelled by user after {duration_str} ({elapsed_sec:.1f}s).")
            append_execution_log(download_id, "=" * 80)
    except Exception as e:
        status_obj.status = DownloadStatusEnum.ERROR
        tb = traceback.format_exc()
        status_obj.error_message = f"{str(e)}\n\nTraceback:\n{tb}"
        logger.error(f"Download {download_id} failed: {e}\n{tb}")
        elapsed_sec = time.time() - start_time
        duration_str = format_seconds(elapsed_sec)
        append_execution_log(download_id, "=" * 80)
        append_execution_log(download_id, f"[ERROR] Download task encountered fatal error after {duration_str} ({elapsed_sec:.1f}s): {str(e)}")
        append_execution_log(download_id, "[TRACEBACK] Python Exception Traceback:")
        for tb_line in tb.strip().splitlines():
            append_execution_log(download_id, f"  {tb_line}")
        append_execution_log(download_id, "=" * 80)
    finally:
        _thread_download_context.download_id = None
        _active_extractors.pop(download_id, None)
        with _subprocess_lock:
            _active_subprocesses.pop(download_id, None)

        if cookie_file_path and os.path.exists(cookie_file_path):
            try:
                os.unlink(cookie_file_path)
            except OSError:
                pass
                
        # IMPORTANT: In YTDLnis parity, partial .part files in staging_dir must be PRESERVED
        # for PAUSED, CANCELLED, and ERROR downloads so the user can resume or retry!
        # staging_dir is ONLY cleaned up when status is FINISHED (after moving final file)
        # or when explicitly deleted by the user.
        if status_obj.status == DownloadStatusEnum.FINISHED:
            cleanup_staging_dir(download_id)
                
        _cancel_flags.pop(download_id, None)
        
        _save_history()
            
        if progress_queue:
            loop.call_soon_threadsafe(
                progress_queue.put_nowait,
                status_obj.model_dump(mode='json')
            )
            
        with _queue_lock:
            _active_downloads.discard(download_id)
            _process_queue(loop)


def _process_queue(loop: asyncio.AbstractEventLoop):
    """Process pending download requests respecting max_concurrent_downloads limit."""
    settings = settings_manager.get()
    max_concurrent = getattr(settings, "max_concurrent_downloads", None) or getattr(settings, "concurrent_downloads", 3) or 3
    
    while len(_active_downloads) < max_concurrent and _pending_queue:
        next_id = _pending_queue.pop(0)
        req = _download_requests.get(next_id)
        if not req:
            continue
            
        _active_downloads.add(next_id)
        
        status_obj = download_registry.get(next_id)
        if status_obj:
            status_obj.status = DownloadStatusEnum.DOWNLOADING
            if progress_queue:
                loop.call_soon_threadsafe(
                    progress_queue.put_nowait,
                    status_obj.model_dump(mode='json')
                )
                
        _executor.submit(_run_download, next_id, req, settings, loop)


def _recreate_schedule_timer(download_id: str, scheduled_for: str, loop: asyncio.AbstractEventLoop):
    """Recreate the background timer for a scheduled download."""
    try:
        from datetime import timezone
        dt = datetime.fromisoformat(scheduled_for.replace('Z', '+00:00'))
        now = datetime.now(timezone.utc)
        delay = (dt - now).total_seconds()
        
        async def waiter():
            if delay > 0:
                await asyncio.sleep(delay)
            
            # After sleeping, check if the download is still in SCHEDULED state (not cancelled)
            status_obj = download_registry.get(download_id)
            if status_obj and status_obj.status == DownloadStatusEnum.SCHEDULED:
                with _queue_lock:
                    _pending_queue.append(download_id)
                    _process_queue(loop)
                    
        loop.create_task(waiter())
    except Exception as e:
        logger.warning(f"Failed to recreate schedule timer for {download_id}: {e}")

async def start_download(request: DownloadRequest, existing_id: str = None) -> DownloadStatus:
    """Queue or start a new download job."""
    settings = settings_manager.get()
    download_id = existing_id or str(uuid.uuid4())
    loop = asyncio.get_event_loop()
    
    clean_url = normalize_url(request.url)
    request.url = clean_url

    # Duplicate Prevention Check (YTDLnis Parity)
    if not getattr(request, "force", False) and not existing_id:
        dup = check_duplicate(request, settings)
        if dup:
            logger.info(f"Duplicate download prevented for {clean_url}: {dup.get('message')}")
            raise DuplicateDownloadError(dup)

    existing_status = download_registry.get(download_id) if existing_id else None
    
    title = (existing_status.title if existing_status and existing_status.title and existing_status.title != "Initializing..." 
             else (request.title if hasattr(request, 'title') and request.title else "Initializing..."))
    thumbnail = (existing_status.thumbnail if existing_status and existing_status.thumbnail 
                 else (request.thumbnail if hasattr(request, 'thumbnail') else None))
    initial_percent = existing_status.percent if existing_status else 0.0
    downloaded_bytes = existing_status.downloaded_bytes if existing_status else None
    total_bytes = existing_status.total_bytes if existing_status else None
    
    format_info_str = None
    if request.audio_only:
        format_info_str = "Audio Only"
    elif request.video_format_id or request.audio_format_id:
        v = request.video_format_id or ""
        a = request.audio_format_id or ""
        format_info_str = f"{v}+{a}".strip("+")
    elif existing_status and existing_status.format_info:
        format_info_str = existing_status.format_info
    
    initial_status = DownloadStatusEnum.SCHEDULED if getattr(request, 'scheduled_for', None) else DownloadStatusEnum.QUEUED
    if existing_status:
        status_obj = existing_status
        status_obj.url = clean_url
        status_obj.title = title
        status_obj.thumbnail = thumbnail
        status_obj.status = initial_status
        status_obj.percent = initial_percent
        status_obj.downloaded_bytes = downloaded_bytes
        status_obj.total_bytes = total_bytes
        status_obj.format_info = format_info_str
        status_obj.error_message = None
        status_obj.request = request
    else:
        status_obj = DownloadStatus(
            id=download_id,
            url=clean_url,
            title=title,
            thumbnail=thumbnail,
            status=initial_status,
            percent=initial_percent,
            downloaded_bytes=downloaded_bytes,
            total_bytes=total_bytes,
            format_info=format_info_str,
            started_at=datetime.now().isoformat(),
            scheduled_for=getattr(request, 'scheduled_for', None),
            is_incognito=settings.incognito_mode,
            request=request
        )
        download_registry[download_id] = status_obj
    _cancel_flags[download_id] = False
    
    with _queue_lock:
        _download_requests[download_id] = request
        if not getattr(request, 'scheduled_for', None):
            _pending_queue.append(download_id)
            _process_queue(loop)
        else:
            _recreate_schedule_timer(download_id, request.scheduled_for, loop)
            
        _save_history() # immediately save to history so it persists on restart
        
        if progress_queue:
            loop.call_soon_threadsafe(
                progress_queue.put_nowait,
                status_obj.model_dump(mode='json')
            )
        
    return status_obj


def cancel_download(download_id: str, is_pause: bool = False, loop: asyncio.AbstractEventLoop = None) -> bool:
    """Cancel or pause an active or queued download."""
    if download_id in download_registry:
        _cancel_flags[download_id] = "PAUSE" if is_pause else True
        status_obj = download_registry[download_id]
        
        with _queue_lock:
            if download_id in _pending_queue:
                _pending_queue.remove(download_id)
                status_obj.status = DownloadStatusEnum.PAUSED if is_pause else DownloadStatusEnum.CANCELLED
                
                if progress_queue and loop:
                    try:
                        loop.call_soon_threadsafe(
                            progress_queue.put_nowait,
                            status_obj.model_dump(mode='json')
                        )
                    except Exception: pass
                _save_history()
                return True
                
        # Force UI update instantly
        status_obj.status = DownloadStatusEnum.PAUSED if is_pause else DownloadStatusEnum.CANCELLED
        _save_history()
        
        if progress_queue and loop:
            try:
                loop.call_soon_threadsafe(
                    progress_queue.put_nowait,
                    status_obj.model_dump(mode='json')
                )
            except Exception: pass
        
        # Aggressively kill any ffmpeg/aria2c subprocesses tied to this download
        with _subprocess_lock:
            pids = list(_active_subprocesses.get(download_id, set()))
            
        for pid in pids:
            try:
                proc = psutil.Process(pid)
                for child in proc.children(recursive=True):
                    try:
                        child.kill()
                    except Exception:
                        pass
                proc.kill()
                logger.info(f"Killed child process PID {pid} for download {download_id}")
            except Exception:
                pass
                
            if sys.platform == "win32":
                try:
                    _original_popen(["taskkill", "/F", "/T", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                except Exception:
                    pass
            
        return True
    return False

def resume_download(download_id: str) -> bool:
    """Resume a paused download by putting it back into the queue."""
    if download_id in download_registry:
        status_obj = download_registry[download_id]
        if status_obj.status == DownloadStatusEnum.PAUSED:
            _cancel_flags[download_id] = False
            status_obj.status = DownloadStatusEnum.QUEUED
            
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                
            with _queue_lock:
                if download_id not in _pending_queue:
                    _pending_queue.append(download_id)
                _process_queue(loop)
                
            _save_history()
            if progress_queue:
                try:
                    loop.call_soon_threadsafe(
                        progress_queue.put_nowait,
                        status_obj.model_dump(mode='json')
                    )
                except Exception: pass
            return True
    return False

def reorder_queue(download_id: str, position: str = "top") -> bool:
    """Move a queued download to 'top' or 'bottom' of _pending_queue."""
    with _queue_lock:
        if download_id in _pending_queue:
            _pending_queue.remove(download_id)
            if position == "top":
                _pending_queue.insert(0, download_id)
            else:
                _pending_queue.append(download_id)
            return True
        elif download_id in download_registry and download_registry[download_id].status == DownloadStatusEnum.QUEUED:
            if position == "top":
                _pending_queue.insert(0, download_id)
            else:
                _pending_queue.append(download_id)
            return True
    return False

async def retry_download(download_id: str) -> Optional[str]:
    """Retry a failed or cancelled download. Reuses the ID and staging dir so it resumes from partial .part file."""
    if download_id in download_registry:
        old_status = download_registry[download_id]
        if old_status.status in [DownloadStatusEnum.ERROR, DownloadStatusEnum.CANCELLED, DownloadStatusEnum.FINISHED, DownloadStatusEnum.PAUSED]:
            req = old_status.request
            if not req:
                req = DownloadRequest(
                    url=old_status.url,
                    title=old_status.title,
                    thumbnail=old_status.thumbnail
                )
            _cancel_flags[download_id] = False
            old_status.error_message = None
            new_status = await start_download(req, existing_id=download_id)
            return new_status.id
    return None

def _cleanup_orphaned_staging_dirs():
    """Only delete staging directories for downloads that NO LONGER EXIST in download_registry."""
    if not STAGING_DIR_ROOT.exists():
        return
    active_or_historical_ids = set(download_registry.keys())
    for item in os.listdir(STAGING_DIR_ROOT):
        p = STAGING_DIR_ROOT / item
        if p.is_dir() and item not in active_or_historical_ids:
            try:
                shutil.rmtree(str(p), ignore_errors=True)
            except Exception:
                pass


# Load history and clean up truly orphaned staging files on module import
_load_history()
_cleanup_orphaned_staging_dirs()
