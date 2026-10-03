import json
import threading
import logging
from pathlib import Path
from models import AppSettings
import os

logger = logging.getLogger(__name__)

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
SETTINGS_FILE = DATA_DIR / "settings.json"

class SettingsManager:
    """Thread-safe persistent settings manager with migration and YTDLnis parity."""
    
    def __init__(self):
        self._lock = threading.Lock()
        self._settings = self._load()
    
    def _defaults(self) -> AppSettings:
        """Create default settings cleanly."""
        project_root = Path(__file__).parent.parent
        downloads_dir = str(project_root / "Downloads")
        staging_dir = str(DATA_DIR / "staging")
        return AppSettings(
            download_dir=downloads_dir,
            temp_dir=staging_dir
        )
    
    def _load(self) -> AppSettings:
        """Load settings from disk, or create defaults, migrating missing fields."""
        if SETTINGS_FILE.exists():
            try:
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                settings = AppSettings(**data)
                
                # Check for migration: if any model field is missing from on-disk json
                saved_keys = set(data.keys()) if isinstance(data, dict) else set()
                model_keys = set(AppSettings.model_fields.keys())
                if not model_keys.issubset(saved_keys):
                    logger.info("Migrating settings.json to include new YTDLnis configuration fields.")
                    with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                        json.dump(settings.model_dump(), f, indent=2)
                        
                return settings
            except Exception as e:
                logger.warning(f"Failed to load settings from {SETTINGS_FILE}: {e}. Restoring defaults.")
                defaults = self._defaults()
                with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                    json.dump(defaults.model_dump(), f, indent=2)
                return defaults
                
        defaults = self._defaults()
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(defaults.model_dump(), f, indent=2)
        return defaults
    
    def _save(self):
        """Persist settings to disk."""
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(self._settings.model_dump(), f, indent=2)
    
    def get(self) -> AppSettings:
        """Get current settings (thread-safe)."""
        with self._lock:
            s = self._settings.model_copy()
            # Map legacy docker /downloads or empty or relative 'downloads' to project's Downloads folder
            if not s.download_dir or s.download_dir in ("/downloads", "\\downloads", "downloads"):
                project_root = Path(__file__).parent.parent
                s.download_dir = str(project_root / "Downloads")
            return s
    
    def update(self, new_settings: AppSettings) -> AppSettings:
        """Update and persist settings (thread-safe)."""
        with self._lock:
            self._settings = new_settings
            
            # Project's Downloads folder fallback
            project_root = Path(__file__).parent.parent
            default_dl_dir = str(project_root / "Downloads")
            
            if not self._settings.download_dir or self._settings.download_dir in ("/downloads", "\\downloads", "downloads"):
                self._settings.download_dir = default_dl_dir
                
            self._save()
            return self._settings.model_copy()

    def reset(self) -> AppSettings:
        """Reset settings to default values (thread-safe) and persist."""
        with self._lock:
            self._settings = self._defaults()
            self._save()
            return self._settings.model_copy()

settings_manager = SettingsManager()
