from pydantic import BaseModel, Field, model_validator
import os
from typing import Optional, List, Dict, Union, Any
from enum import Enum
import uuid

class FormatInfo(BaseModel):
    """Single available format stream from yt-dlp."""
    format_id: str
    ext: str
    resolution: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    vcodec: Optional[str] = None
    acodec: Optional[str] = None
    abr: Optional[float] = None  # audio bitrate
    asr: Optional[int] = None    # audio sample rate
    filesize: Optional[int] = None
    filesize_approx: Optional[int] = None
    format_note: Optional[str] = None
    tbr: Optional[float] = None  # total bitrate
    type: str = "unknown"  # "video", "audio", "video+audio"

class VideoInfo(BaseModel):
    """Parsed video metadata with available formats."""
    id: str
    title: str
    thumbnail: Optional[str] = None
    duration: Optional[int] = None
    duration_string: Optional[str] = None
    uploader: Optional[str] = None
    view_count: Optional[int] = None
    webpage_url: str
    formats: List[FormatInfo] = []

class CutSegment(BaseModel):
    start: Optional[Union[str, float, int]] = None
    end: Optional[Union[str, float, int]] = None

class CutOptions(BaseModel):
    start: Optional[Union[str, float, int]] = None
    end: Optional[Union[str, float, int]] = None
    segments: Optional[List[CutSegment]] = None
    action: Optional[str] = "include"  # "include" or "remove"
    mode: Optional[str] = None
    video_duration: Optional[float] = None
    duration: Optional[float] = None

    @model_validator(mode="before")
    @classmethod
    def sync_action_mode(cls, data: Any) -> Any:
        if isinstance(data, dict):
            act = data.get("action") or data.get("mode") or "include"
            act_str = str(act).lower().strip()
            data["action"] = act_str
            data["mode"] = act_str
        return data

class SubtitleOptions(BaseModel):
    embed: bool = False
    write_subs: bool = False
    write_auto_subs: bool = False
    write_auto: Optional[bool] = None
    langs: Optional[str] = ".*-orig"
    format: Optional[str] = None
    sub_format: Optional[str] = None

    @model_validator(mode="before")
    @classmethod
    def sync_subtitle_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "write_auto" in data and "write_auto_subs" not in data:
                data["write_auto_subs"] = bool(data["write_auto"])
            elif "write_auto_subs" in data and "write_auto" not in data:
                data["write_auto"] = bool(data["write_auto_subs"])
            if "format" in data and "sub_format" not in data:
                data["sub_format"] = data["format"]
            elif "sub_format" in data and "format" not in data:
                data["format"] = data["sub_format"]
        return data

class CropOptions(BaseModel):
    x: int = 0
    y: int = 0
    w: int = 0
    h: int = 0
    ref_w: int = 0
    ref_h: int = 0

class SponsorBlockOptions(BaseModel):
    categories: List[str] = Field(default_factory=list)
    action: str = "remove"  # "remove" or "mark"

class AdvancedDownloadOptions(BaseModel):
    sponsorblock: Optional[Union[List[str], SponsorBlockOptions, Dict[str, Any]]] = None
    sponsorblock_action: Optional[str] = None
    subtitles: Optional[Union[SubtitleOptions, Dict[str, Any]]] = None
    embed_chapters: Optional[bool] = None
    split_chapters: Optional[bool] = None
    remove_audio: Optional[bool] = None
    recode_video: Optional[str] = None
    recode_audio: Optional[str] = None
    audio_quality: Optional[str] = None
    cut: Optional[Union[CutOptions, List[CutSegment], List[Dict[str, Any]], Dict[str, Any]]] = None
    crop: Optional[Union[CropOptions, Dict[str, Any]]] = None
    filename_template: Optional[str] = None
    extra_commands: Optional[str] = None
    live_from_start: Optional[bool] = None
    wait_for_video: Optional[int] = None
    embed_thumbnail: Optional[bool] = None
    write_thumbnail: Optional[bool] = None

    class Config:
        extra = "ignore"

# Backwards compatibility alias
AdvancedOptions = AdvancedDownloadOptions

class DownloadRequest(BaseModel):
    """Request to start a download."""
    url: str
    video_format_id: Optional[str] = None  # None for audio-only
    audio_format_id: Optional[str] = None  # None for video-only
    quick_download: bool = False  # If true, use bestvideo+bestaudio
    audio_only: bool = False  # If true, download pure audio with thumbnail & metadata
    embed_lyrics: bool = True # If true, fetch and embed synced lyrics
    scheduled_for: Optional[str] = None # ISO format timestamp for future download
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    embed_metadata_override: Optional[bool] = None
    embed_subtitles_override: Optional[bool] = None
    sponsorblock_remove_override: Optional[bool] = None
    custom_command: Optional[str] = None
    advanced_options: Optional[AdvancedDownloadOptions] = None
    advanced: Optional[AdvancedDownloadOptions] = None
    force: bool = False  # If true, bypass duplicate download prevention

    @model_validator(mode="before")
    @classmethod
    def sync_advanced(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "advanced" in data and "advanced_options" not in data:
                data["advanced_options"] = data["advanced"]
            elif "advanced_options" in data and "advanced" not in data:
                data["advanced"] = data["advanced_options"]
        return data

class DownloadStatusEnum(str, Enum):
    QUEUED = "queued"
    SCHEDULED = "scheduled"
    DOWNLOADING = "downloading"
    PROCESSING = "processing"
    PAUSED = "paused"
    FINISHED = "finished"
    ERROR = "error"
    CANCELLED = "cancelled"
    DUPLICATE = "duplicate"

class DownloadStatus(BaseModel):
    """Real-time status of a download."""
    id: str
    url: str
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[float] = None
    status: DownloadStatusEnum = DownloadStatusEnum.QUEUED
    percent: float = 0.0
    speed: Optional[str] = None
    eta: Optional[str] = None
    filesize: Optional[str] = None
    downloaded_bytes: Optional[float] = None
    total_bytes: Optional[float] = None
    filename: Optional[str] = None
    format_info: Optional[str] = None
    error_message: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    scheduled_for: Optional[str] = None
    is_incognito: bool = False
    request: Optional[DownloadRequest] = None
    file_exists_on_disk: bool = True
    live_status_text: Optional[str] = None
    phase: Optional[str] = None
    eta_seconds: Optional[int] = None
    speed_bytes_per_sec: Optional[float] = None

class ReorderRequest(BaseModel):
    download_id: str
    position: Optional[int] = None
    action: Optional[str] = None  # 'top' | 'bottom'

class JsEngine(str, Enum):
    DENO = "deno"
    NODEJS = "nodejs"
    PHANTOMJS = "phantomjs"

class SiteCookie(BaseModel):
    """Individual website cookie entry with toggle control."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    domain: str                           # e.g., "youtube.com", "instagram.com"
    enabled: bool = True                  # Site-specific cookie toggle
    cookies_text: str = ""                # Netscape HTTP cookie format lines
    cookie_count: int = 0
    last_updated: Optional[str] = None

class YoutubePoTokenSettings(BaseModel):
    """Configuration for YouTube Proof of Origin (PO Token) bot detection bypass."""
    enabled: bool = False
    mode: str = "no_auth"  # 'bgutil_http' | 'no_auth' | 'auth_cookie' | 'manual'
    bgutil_base_url: str = "http://127.0.0.1:4416"
    player_clients: List[str] = ["android", "mweb", "web", "ios"]
    use_only_po_token: bool = False
    gvs_token: Optional[str] = ""
    player_token: Optional[str] = ""
    subs_token: Optional[str] = ""
    visitor_data: Optional[str] = ""
    last_generated: Optional[str] = None
    token_status: Optional[str] = "idle"  # 'idle' | 'generating' | 'ready' | 'connected' | 'error'
    status_message: Optional[str] = None
    test_video_id: str = "aqz-KE-bpKQ"

class AppSettings(BaseModel):
    """Application settings with full YTDLnis parity."""
    # General
    incognito_mode: bool = False
    save_search_history: bool = True
    theme: str = "dark"
    notifications_enabled: bool = True
    quick_download: bool = False
    default_video_quality: str = "best"
    default_audio_quality: str = "best"
    
    # Directories
    download_dir: str = "downloads"
    temp_dir: str = "data/staging"
    create_subdirectories: bool = False
    subdirectory_format: str = "%(uploader)s"
    subdirectory_template: Optional[str] = None  # Backward-compatible alias
    filename_template: str = "%(title)s.%(ext)s"
    custom_filename_template: Optional[str] = None  # Backward-compatible alias
    
    # Downloading
    max_concurrent_downloads: int = Field(default=3, ge=1, le=10)
    concurrent_downloads: Optional[int] = None  # Backward-compatible alias
    download_speed_limit: int = Field(default=0, ge=0)  # bytes/s (0 = unlimited)
    auto_retry_count: int = Field(default=3, ge=0)
    retries: Optional[int] = None  # Backward-compatible alias
    retry_delay: int = Field(default=5, ge=0)
    retry_sleep: Optional[int] = None  # Backward-compatible alias
    continuedl: bool = True
    continue_downloads: Optional[bool] = None  # Backward-compatible alias
    prefer_insecure: bool = False
    concurrent_fragments: int = Field(default=5, ge=1, le=25)
    fragment_retries: int = Field(default=10, ge=0)
    aria2_enabled: bool = False
    aria2c_path: str = "aria2c"

    # Duplicate Prevention (YTDLnis parity: 'off' | 'url_type' | 'url' | 'download_archive' | 'config')
    prevent_duplicate_downloads: str = "url_type"
    download_archive_path: Optional[str] = "data/download_archive.txt"

    # Execution Logging (YTDLnis log_downloads parity)
    log_downloads: bool = True
    
    # Direct File Download & Auto-Cleanup (Docker / Remote Support)
    enable_browser_download: bool = False
    browser_download: Optional[bool] = None  # Backward-compatible alias
    auto_cleanup_timer: int = Field(default=0, ge=0)  # Cleanup timer in minutes (0 = disabled)
    auto_cleanup_preset: str = "disabled"             # 'disabled' | '30m' | '1h' | '2h' | 'custom'
    
    # Network & Proxy
    proxy_url: Optional[str] = None
    socks5_proxy: Optional[str] = None  # Backward-compatible alias
    custom_user_agent: Optional[str] = None
    socket_timeout: int = Field(default=30, ge=5)
    geo_bypass: bool = True
    geo_bypass_country: Optional[str] = None
    ipv4_only: bool = False
    force_ipv4: Optional[bool] = None  # Backward-compatible alias
    
    # Formats & Containers
    default_video_container: str = "mp4"
    default_audio_container: str = "mp3"
    preferred_video_codec: str = "auto"
    preferred_audio_codec: str = "auto"
    
    # Processing Defaults
    embed_metadata: bool = True
    embed_thumbnail: bool = True
    write_thumbnail: bool = False
    embed_subtitles: bool = False
    embed_chapters: bool = True
    remove_sponsorblock_default: bool = False
    sponsorblock_remove: Optional[bool] = None  # Backward-compatible alias
    sponsorblock_categories: List[str] = ["sponsor"]
    subtitle_languages: str = "en.*,en,.*-orig"
    embed_lyrics: bool = True
    
    # Cookies & Accounts
    cookie_file_path: Optional[str] = None
    cookies_enabled: bool = True
    cookies_content: str = ""             # Global Netscape cookies textarea
    site_cookies: List[SiteCookie] = []   # Site-specific cookie entries
    
    # Updating & Engine
    auto_update_ytdlp: bool = False
    ytdlp_channel: str = "stable"
    ytdlp_release_channel: Optional[str] = None  # Backward-compatible alias
    js_engine: JsEngine = JsEngine.NODEJS

    # YouTube Proof of Origin (PO Token)
    potoken_settings: YoutubePoTokenSettings = Field(default_factory=YoutubePoTokenSettings)

    @model_validator(mode="before")
    @classmethod
    def sync_legacy_fields_before(cls, data: Any) -> Any:
        if isinstance(data, dict):
            # Directories aliases
            # When both keys exist, prefer the non-null value to avoid clobbering
            # a valid string with None when one alias was never set.
            if "subdirectory_template" in data and "subdirectory_format" not in data:
                data["subdirectory_format"] = data["subdirectory_template"]
            elif "subdirectory_format" in data and "subdirectory_template" not in data:
                data["subdirectory_template"] = data["subdirectory_format"]
            elif "subdirectory_template" in data and "subdirectory_format" in data:
                tmpl = data["subdirectory_template"]
                fmt  = data["subdirectory_format"]
                if tmpl is None and fmt is not None:
                    # legacy alias is null — keep the canonical value
                    data["subdirectory_template"] = fmt
                elif fmt is None and tmpl is not None:
                    # canonical is null — promote the legacy alias
                    data["subdirectory_format"] = tmpl
                elif tmpl != fmt and tmpl is not None:
                    # Both non-null and different — legacy alias wins
                    data["subdirectory_format"] = tmpl

            if "custom_filename_template" in data and "filename_template" not in data:
                data["filename_template"] = data["custom_filename_template"]
            elif "filename_template" in data and "custom_filename_template" not in data:
                data["custom_filename_template"] = data["filename_template"]
            elif "custom_filename_template" in data and "filename_template" in data:
                custom = data["custom_filename_template"]
                canon  = data["filename_template"]
                if custom is None and canon is not None:
                    # custom alias is null — keep the canonical value
                    data["custom_filename_template"] = canon
                elif canon is None and custom is not None:
                    # canonical is null — promote the custom alias
                    data["filename_template"] = custom
                elif custom != canon and custom is not None:
                    # Both non-null and different — custom alias wins (frontend sets this key)
                    data["filename_template"] = custom

            # Downloading aliases
            if "concurrent_downloads" in data and "max_concurrent_downloads" not in data:
                data["max_concurrent_downloads"] = data["concurrent_downloads"]
            if "max_concurrent_downloads" in data and "concurrent_downloads" not in data:
                data["concurrent_downloads"] = data["max_concurrent_downloads"]
                
            if "retries" in data and "auto_retry_count" not in data:
                data["auto_retry_count"] = data["retries"]
            if "auto_retry_count" in data and "retries" not in data:
                data["retries"] = data["auto_retry_count"]
                
            if "retry_sleep" in data and "retry_delay" not in data:
                data["retry_delay"] = data["retry_sleep"]
            if "retry_delay" in data and "retry_sleep" not in data:
                data["retry_sleep"] = data["retry_delay"]
                
            if "continue_downloads" in data and "continuedl" not in data:
                data["continuedl"] = data["continue_downloads"]
            if "continuedl" in data and "continue_downloads" not in data:
                data["continue_downloads"] = data["continuedl"]

            # Browser download aliases
            if "browser_download" in data and "enable_browser_download" not in data:
                data["enable_browser_download"] = bool(data["browser_download"])
            if "enable_browser_download" in data and "browser_download" not in data:
                data["browser_download"] = data["enable_browser_download"]

            # Duplicate prevention aliases
            if "prevent_duplicate" in data and "prevent_duplicate_downloads" not in data:
                data["prevent_duplicate_downloads"] = data["prevent_duplicate"]
            elif "prevent_duplicate_downloads" in data and "prevent_duplicate" not in data:
                data["prevent_duplicate"] = data["prevent_duplicate_downloads"]

            # Logging aliases
            if "log_download" in data and "log_downloads" not in data:
                data["log_downloads"] = bool(data["log_download"])
            elif "log_downloads" in data and "log_download" not in data:
                data["log_download"] = bool(data["log_downloads"])

            # Network aliases
            if "socks5_proxy" in data and "proxy_url" not in data:
                data["proxy_url"] = data["socks5_proxy"] or None
            if "proxy_url" in data and "socks5_proxy" not in data:
                data["socks5_proxy"] = data["proxy_url"] or ""
                
            if "force_ipv4" in data and "ipv4_only" not in data:
                data["ipv4_only"] = data["force_ipv4"]
            if "ipv4_only" in data and "force_ipv4" not in data:
                data["force_ipv4"] = data["ipv4_only"]

            # Processing aliases
            if "sponsorblock_remove" in data and "remove_sponsorblock_default" not in data:
                data["remove_sponsorblock_default"] = data["sponsorblock_remove"]
            if "remove_sponsorblock_default" in data and "sponsorblock_remove" not in data:
                data["sponsorblock_remove"] = data["remove_sponsorblock_default"]

            # Updating aliases
            if "ytdlp_release_channel" in data and "ytdlp_channel" not in data:
                data["ytdlp_channel"] = data["ytdlp_release_channel"]
            if "ytdlp_channel" in data and "ytdlp_release_channel" not in data:
                data["ytdlp_release_channel"] = data["ytdlp_channel"]
                
        return data

    @model_validator(mode="after")
    def sync_legacy_fields_after(self) -> "AppSettings":
        # NOTE: filename_template/custom_filename_template and subdirectory_format/subdirectory_template
        # are NOT synced here because when both are present with different values (e.g. frontend updated
        # only one key), forcing one over the other causes a destructive overwrite.
        # The before-validator handles the one-key-missing case, and __setattr__ handles runtime sync.

        self.concurrent_downloads = self.max_concurrent_downloads
        self.retries = self.auto_retry_count
        self.retry_sleep = self.retry_delay
        self.continue_downloads = self.continuedl
        self.socks5_proxy = self.proxy_url or ""
        self.force_ipv4 = self.ipv4_only
        self.sponsorblock_remove = self.remove_sponsorblock_default
        self.ytdlp_release_channel = self.ytdlp_channel
        return self

    def __setattr__(self, name: str, value: Any):
        super().__setattr__(name, value)
        if name == "max_concurrent_downloads":
            super().__setattr__("concurrent_downloads", value)
        elif name == "concurrent_downloads":
            super().__setattr__("max_concurrent_downloads", value)
        elif name == "auto_retry_count":
            super().__setattr__("retries", value)
        elif name == "retries":
            super().__setattr__("auto_retry_count", value)
        elif name == "retry_delay":
            super().__setattr__("retry_sleep", value)
        elif name == "retry_sleep":
            super().__setattr__("retry_delay", value)
        elif name == "continuedl":
            super().__setattr__("continue_downloads", value)
        elif name == "continue_downloads":
            super().__setattr__("continuedl", value)
        elif name == "proxy_url":
            super().__setattr__("socks5_proxy", value or "")
        elif name == "socks5_proxy":
            super().__setattr__("proxy_url", value or None)
        elif name == "ipv4_only":
            super().__setattr__("force_ipv4", value)
        elif name == "force_ipv4":
            super().__setattr__("ipv4_only", value)
        elif name == "remove_sponsorblock_default":
            super().__setattr__("sponsorblock_remove", value)
        elif name == "sponsorblock_remove":
            super().__setattr__("remove_sponsorblock_default", value)
        elif name == "filename_template":
            super().__setattr__("custom_filename_template", value)
        elif name == "custom_filename_template":
            super().__setattr__("filename_template", value)
        elif name == "subdirectory_format":
            super().__setattr__("subdirectory_template", value)
        elif name == "subdirectory_template":
            super().__setattr__("subdirectory_format", value)
        elif name == "ytdlp_channel":
            super().__setattr__("ytdlp_release_channel", value)
        elif name == "ytdlp_release_channel":
            super().__setattr__("ytdlp_channel", value)

class UrlRequest(BaseModel):
    """Simple URL request body."""
    url: str

class ParsePastedCookiesRequest(BaseModel):
    """Request to parse pasted Netscape cookies."""
    raw_text: str

class TestBgUtilsRequest(BaseModel):
    base_url: str = "http://127.0.0.1:4416"

class GeneratePoTokenRequest(BaseModel):
    mode: Optional[str] = None
    test_video_id: Optional[str] = "aqz-KE-bpKQ"
