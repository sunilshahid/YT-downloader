import os
import sys
import shutil
import tempfile
import logging
import datetime
import urllib.parse
from typing import List, Dict, Optional, Tuple
import yt_dlp

from models import SiteCookie, AppSettings
from settings_manager import settings_manager

logger = logging.getLogger(__name__)


def format_cookies_to_netscape(cookies_list: List[dict], default_domain: str = "") -> str:
    """
    Convert a list of cookie dicts (from CDP or Playwright or cookiejar) to Netscape HTTP Cookie format.
    Netscape Format: domain \t include_subdomains \t path \t secure \t expiration \t name \t value
    """
    lines = ["# Netscape HTTP Cookie File", "# http://curl.haxx.se/rfc/cookie_spec.html", ""]
    
    for c in cookies_list:
        if hasattr(c, 'domain'):
            domain = c.domain
            include_sub = "TRUE" if domain.startswith(".") else "FALSE"
            path = c.path or "/"
            secure = "TRUE" if c.secure else "FALSE"
            expires_str = str(int(c.expires)) if c.expires else str(int(datetime.datetime.now().timestamp()) + 31536000)
            name = c.name
            value = c.value
        else:
            domain = c.get("domain") or default_domain
            if not domain:
                continue
            include_sub = "TRUE" if domain.startswith(".") else "FALSE"
            path = c.get("path") or "/"
            secure = "TRUE" if c.get("secure", False) else "FALSE"
            expires = c.get("expires") or c.get("expirationDate") or (int(datetime.datetime.now().timestamp()) + 31536000)
            try:
                expires_str = str(int(expires))
            except Exception:
                expires_str = str(int(datetime.datetime.now().timestamp()) + 31536000)
            name = c.get("name", "")
            value = c.get("value", "")
        
        if name:
            lines.append(f"{domain}\t{include_sub}\t{path}\t{secure}\t{expires_str}\t{name}\t{value}")
            
    return "\n".join(lines)


def get_domain_from_url(url: str) -> str:
    """Extract clean domain name from URL (e.g., https://www.youtube.com/watch -> youtube.com)."""
    parsed = urllib.parse.urlparse(url if "://" in url else f"https://{url}")
    netloc = parsed.netloc or parsed.path
    netloc = netloc.split(":")[0]  # remove port
    parts = netloc.split(".")
    if len(parts) >= 2:
        return ".".join(parts[-2:])  # e.g., youtube.com, instagram.com
    return netloc


def parse_and_save_pasted_cookies(raw_text: str) -> Tuple[int, List[str]]:
    """
    Parse raw pasted Netscape cookie text, group cookie lines by domain,
    save/update SiteCookie entries with enabled=True, AND clear manual text box.
    """
    if not raw_text.strip():
        return 0, []
        
    domain_groups: Dict[str, List[str]] = {}
    
    for line in raw_text.splitlines():
        line_str = line.strip()
        if not line_str:
            continue
        
        # Netscape cookie file comments start with #, but HttpOnly cookies start with #HttpOnly_
        if line_str.startswith("#") and not line_str.startswith("#HttpOnly_"):
            continue
            
        parts = line_str.split("\t")
        if len(parts) >= 7:
            # If it's HttpOnly, parts[0] has "#HttpOnly_" prefix which we want to strip for domain parsing
            domain_part = parts[0]
            if domain_part.startswith("#HttpOnly_"):
                domain_part = domain_part[10:]
                
            raw_domain = domain_part.strip().lstrip(".")
            clean_domain = get_domain_from_url(raw_domain)
            if not clean_domain:
                continue
                
            if clean_domain not in domain_groups:
                domain_groups[clean_domain] = ["# Netscape HTTP Cookie File", ""]
            domain_groups[clean_domain].append(line_str)

    saved_domains = []
    for domain, lines in domain_groups.items():
        cookies_content = "\n".join(lines)
        count = len(lines) - 2
        save_or_update_site_cookie(domain, cookies_content, count)
        saved_domains.append(domain)
        
    # Clear manual paste text area after saving!
    settings = settings_manager.get()
    settings.cookies_content = ""
    settings_manager.update(settings)
        
    return len(saved_domains), saved_domains





def verify_site_cookie(site_id: str) -> Tuple[bool, str]:
    """Test saved site cookies using yt-dlp info extraction in a try/except block."""
    settings = settings_manager.get()
    site = next((c for c in settings.site_cookies if c.id == site_id), None)
    if not site or not site.cookies_text.strip():
        return False, "No cookies stored for this site."
        
    with tempfile.NamedTemporaryFile(mode="w", suffix=".txt", delete=False, prefix="ytdlp_test_cookies_") as tmp:
        tmp.write(site.cookies_text)
        tmp_path = tmp.name

    test_urls = [
        f"https://www.{site.domain}",
        f"https://{site.domain}",
    ]
    if "youtube.com" in site.domain or "youtu.be" in site.domain:
        test_urls.insert(0, "https://www.youtube.com/watch?v=dQw4w9WgXcQ")

    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
        "cookiefile": tmp_path,
        "extractor_args": {
            "youtube": ["player_client=android,mweb,web"]
        }
    }
    impersonate_target = getattr(settings, "impersonate_target", None) or "chrome"
    if impersonate_target and str(impersonate_target).lower() != "none":
        try:
            from yt_dlp.networking.impersonate import ImpersonateTarget
            ydl_opts["impersonate"] = ImpersonateTarget.from_str(impersonate_target)
        except Exception:
            pass
    
    error_msg = "Cookie validation failed."
    for test_url in test_urls:
        try:
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                ydl.extract_info(test_url, download=False)
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            now_str = datetime.datetime.now().strftime("%H:%M")
            site.last_updated = f"Verified Valid at {now_str}"
            settings_manager.update(settings)
            return True, f"Cookies for {site.domain} are valid and working!"
        except Exception as e:
            error_msg = str(e)
            
    try:
        os.unlink(tmp_path)
    except OSError:
        pass
        
    return False, f"Cookie check failed: {error_msg}"


def save_or_update_site_cookie(domain: str, cookies_text: str, count: int = 0) -> SiteCookie:
    """Save or update site-specific cookie in AppSettings with enabled=True by default."""
    settings = settings_manager.get()
    clean_domain = get_domain_from_url(domain)
    
    if count == 0:
        count = len([l for l in cookies_text.splitlines() if l.strip() and not l.startswith("#")])
        
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
    
    existing = next((c for c in settings.site_cookies if c.domain.lower() == clean_domain.lower()), None)
    
    if existing:
        existing.cookies_text = cookies_text
        existing.cookie_count = count
        existing.enabled = True
        existing.last_updated = now_str
        target_site = existing
    else:
        new_site = SiteCookie(
            domain=clean_domain,
            enabled=True,
            cookies_text=cookies_text,
            cookie_count=count,
            last_updated=now_str
        )
        settings.site_cookies.append(new_site)
        target_site = new_site
        
    settings_manager.update(settings)
    return target_site


def has_active_cookies() -> bool:
    """Return True only if there is at least one active, non-comment cookie entry."""
    settings = settings_manager.get()
    for site in settings.site_cookies:
        if site.enabled and site.cookies_text.strip():
            for line in site.cookies_text.splitlines():
                line = line.strip()
                if line and not line.startswith("#"):
                    return True
                if line.startswith("#HttpOnly_"):
                    return True
    if settings.cookies_content.strip():
        for line in settings.cookies_content.splitlines():
            line = line.strip()
            if line and not line.startswith("#"):
                return True
            if line.startswith("#HttpOnly_"):
                return True
    return False


def get_merged_cookie_content() -> str:
    """Combine ONLY ENABLED site cookies into a single clean Netscape cookie string."""
    settings = settings_manager.get()
    cookie_entries = []
    
    for site in settings.site_cookies:
        if site.enabled and site.cookies_text.strip():
            entry_lines = [
                line for line in site.cookies_text.splitlines()
                if line.strip() and not line.strip().startswith("# Netscape HTTP Cookie") and not line.strip().startswith("# http://curl.haxx.se")
            ]
            has_records = any(l.strip() and (not l.strip().startswith("#") or l.strip().startswith("#HttpOnly_")) for l in entry_lines)
            if has_records:
                cookie_entries.append(f"# --- Site Cookies: {site.domain} (Active) ---")
                cookie_entries.extend(entry_lines)
                cookie_entries.append("")
                
    if settings.cookies_content.strip():
        entry_lines = [
            line for line in settings.cookies_content.splitlines()
            if line.strip() and not line.strip().startswith("# Netscape HTTP Cookie") and not line.strip().startswith("# http://curl.haxx.se")
        ]
        has_records = any(l.strip() and (not l.strip().startswith("#") or l.strip().startswith("#HttpOnly_")) for l in entry_lines)
        if has_records:
            cookie_entries.append("# --- Manual Global Cookies ---")
            cookie_entries.extend(entry_lines)
            cookie_entries.append("")
            
    if not cookie_entries:
        return ""
        
    return "\n".join(["# Netscape HTTP Cookie File", "# http://curl.haxx.se/rfc/cookie_spec.html", ""] + cookie_entries)



def clear_all_cookies() -> bool:
    """Remove all site cookies and global cookies."""
    settings = settings_manager.get()
    settings.site_cookies = []
    settings.cookies_content = ""
    settings_manager.update(settings)
    return True

