import { useState, useEffect, useCallback, useRef } from 'react';

const API_BASE = typeof window !== 'undefined' && window.location 
  ? (window.location.port === '5173' ? `${window.location.protocol}//${window.location.hostname}:8000` : window.location.origin)
  : 'http://127.0.0.1:8000';

export default function useSettings(autoFetch = true) {
  const [settings, setSettings] = useState(null);
  const [isLoading, setIsLoading] = useState(autoFetch);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef(null);

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings`);
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to fetch settings:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (autoFetch) {
      fetchSettings();
    }
  }, [autoFetch, fetchSettings]);

  const saveSettings = useCallback(async (newSettings) => {
    setIsSaving(true);
    try {
      const res = await fetch(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data);
      }
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  }, []);

  const updateSetting = useCallback((key, value, immediate = false) => {
    setSettings(prev => {
      const updated = { ...prev, [key]: value };
      // Keep known alias pairs synchronized so the PUT payload never contains a stale conflicting key
      if (key === 'custom_filename_template') {
        updated.filename_template = value;
      } else if (key === 'filename_template') {
        updated.custom_filename_template = value;
      } else if (key === 'subdirectory_template') {
        updated.subdirectory_format = value;
      } else if (key === 'subdirectory_format') {
        updated.subdirectory_template = value;
      } else if (key === 'concurrent_downloads') {
        updated.max_concurrent_downloads = value;
      } else if (key === 'max_concurrent_downloads') {
        updated.concurrent_downloads = value;
      } else if (key === 'auto_retry_count') {
        updated.retries = value;
      } else if (key === 'retries') {
        updated.auto_retry_count = value;
      } else if (key === 'retry_sleep') {
        updated.retry_delay = value;
      } else if (key === 'retry_delay') {
        updated.retry_sleep = value;
      } else if (key === 'continue_downloads') {
        updated.continuedl = value;
      } else if (key === 'continuedl') {
        updated.continue_downloads = value;
      } else if (key === 'browser_download') {
        updated.enable_browser_download = value;
      } else if (key === 'enable_browser_download') {
        updated.browser_download = value;
      } else if (key === 'sponsorblock_remove') {
        updated.remove_sponsorblock_default = value;
      } else if (key === 'remove_sponsorblock_default') {
        updated.sponsorblock_remove = value;
      } else if (key === 'ytdlp_release_channel') {
        updated.ytdlp_channel = value;
      } else if (key === 'ytdlp_channel') {
        updated.ytdlp_release_channel = value;
      }

      clearTimeout(debounceRef.current);
      if (immediate || typeof value === 'boolean') {
        saveSettings(updated);
      } else {
        debounceRef.current = setTimeout(() => saveSettings(updated), 500);
      }
      return updated;
    });
  }, [saveSettings]);

  return { settings, updateSetting, refetchSettings: fetchSettings, isLoading, isSaving };
}
