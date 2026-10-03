import sys
import asyncio

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass

    # Safeguard against Windows pipe flush OSError [Errno 22] / invalid handle in Python 3.13
    import logging
    _orig_stream_flush = logging.StreamHandler.flush
    def _safe_stream_flush(self):
        try:
            _orig_stream_flush(self)
        except OSError as e:
            if getattr(e, 'errno', None) in (22, 9, 32) or getattr(e, 'winerror', None) in (6, 109):
                pass
            else:
                raise
    logging.StreamHandler.flush = _safe_stream_flush

    _orig_handle_error = logging.Handler.handleError
    def _safe_handle_error(self, record):
        exc = sys.exc_info()[1]
        if isinstance(exc, OSError) and (getattr(exc, 'errno', None) in (22, 9, 32) or getattr(exc, 'winerror', None) in (6, 109)):
            return
        _orig_handle_error(self, record)
    logging.Handler.handleError = _safe_handle_error

import json
import logging
from contextlib import asynccontextmanager
from typing import List, Set, Optional, Any, Union, Dict
from datetime import datetime
import os

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, JSONResponse
import tempfile, zipfile, shutil
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware

from models import UrlRequest, DownloadRequest, AppSettings, VideoInfo, ReorderRequest
from settings_manager import settings_manager
import downloader

DATA_DIR = Path(__file__).parent / "data"
DATA_DIR.mkdir(exist_ok=True)
SEARCH_HISTORY_FILE = DATA_DIR / "search_history.json"
SETTINGS_FILE = DATA_DIR / "settings.json"
HISTORY_FILE = DATA_DIR / "download_history.json"
LOGS_DIR = DATA_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Track connected WebSocket clients
connected_clients: Set[WebSocket] = set()


async def broadcast_progress():
    """Background task: read from progress_queue and broadcast to all WS clients."""
    while True:
        try:
            data = await downloader.progress_queue.get()
            message = json.dumps(data, default=str)
            
            # Send to all connected clients
            disconnected = set()
            for ws in connected_clients:
                try:
                    await ws.send_text(message)
                except Exception:
                    disconnected.add(ws)
            
            # Cleanup disconnected clients
            connected_clients.difference_update(disconnected)
            
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Broadcast error: {e}")
            await asyncio.sleep(0.1)


async def auto_cleanup_worker():
    """Background worker: periodically checks and removes expired finished downloads."""
    while True:
        try:
            await asyncio.sleep(20)
            loop = None
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                pass
            downloader.perform_auto_cleanup(loop=loop)
        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.warning(f"Error in auto_cleanup_worker: {e}")
            await asyncio.sleep(5)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """App startup/shutdown lifecycle."""
    # Initialize the progress queue
    downloader.progress_queue = asyncio.Queue()
    
    # Start background tasks
    broadcast_task = asyncio.create_task(broadcast_progress())
    cleanup_task = asyncio.create_task(auto_cleanup_worker())
    logger.info("yt-dlp Web UI backend started")
    
    yield
    
    # Shutdown
    broadcast_task.cancel()
    cleanup_task.cancel()
    try:
        await asyncio.gather(broadcast_task, cleanup_task, return_exceptions=True)
    except Exception:
        pass
    logger.info("Backend shutdown complete")


app = FastAPI(
    title="yt-dlp Web UI",
    description="Modern web interface for yt-dlp",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — allow all local origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length", "Accept-Ranges"],
)


# ─── Format Fetching ───

@app.post("/api/formats", response_model=VideoInfo)
async def get_formats(request: UrlRequest):
    """Fetch available formats for a URL."""
    try:
        info = await downloader.fetch_formats(request.url)
        return info
    except Exception as e:
        logger.error(f"Format fetch error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


# ─── Download Management ───

@app.post("/api/download")
async def start_download(request: DownloadRequest):
    """Start a new download."""
    try:
        status_obj = await downloader.start_download(request)
        return {"id": status_obj.id, "status": "queued"}
    except downloader.DuplicateDownloadError as e:
        logger.info(f"Duplicate download prevented: {e.duplicate_info}")
        return JSONResponse(
            status_code=409,
            content={
                "detail": "duplicate",
                "is_duplicate": True,
                "duplicate_info": e.duplicate_info,
                "message": str(e)
            }
        )
    except Exception as e:
        logger.error(f"Download start error: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/api/downloads/check-duplicate")
async def check_duplicate_download(request: DownloadRequest):
    """Check if a URL would be flagged as a duplicate download."""
    dup_info = downloader.check_duplicate(request)
    return {
        "is_duplicate": bool(dup_info),
        "duplicate_info": dup_info
    }


@app.get("/api/archive/status")
async def get_archive_status():
    """Get current yt-dlp download archive status and item count."""
    return downloader.get_archive_status()


@app.get("/api/archive/entries")
async def get_archive_entries(limit: int = 100):
    """Get recent entries from yt-dlp download archive."""
    return downloader.get_archive_entries(limit=limit)


@app.post("/api/archive/clear")
async def clear_download_archive():
    """Clear yt-dlp download archive."""
    success = downloader.clear_archive()
    return {"status": "success" if success else "error"}


@app.post("/api/download/{download_id}/cancel")
@app.post("/api/downloads/{download_id}/cancel")
async def cancel_download(download_id: str):
    """Cancel an active or queued download."""
    if downloader.cancel_download(download_id, loop=asyncio.get_event_loop()):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Download not found")

@app.post("/api/download/{download_id}/pause")
@app.post("/api/downloads/{download_id}/pause")
async def pause_download(download_id: str):
    """Pause an active or queued download."""
    if downloader.cancel_download(download_id, is_pause=True, loop=asyncio.get_event_loop()):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Download not found")

@app.post("/api/download/{download_id}/resume")
@app.post("/api/downloads/{download_id}/resume")
async def resume_download(download_id: str):
    """Resume a paused download."""
    if downloader.resume_download(download_id):
        return {"status": "success"}
    raise HTTPException(status_code=404, detail="Download not found")


@app.post("/api/downloads/pause-all")
@app.post("/api/download/pause-all")
async def pause_all_downloads():
    """Pause all active and queued downloads."""
    loop = asyncio.get_event_loop()
    count = downloader.pause_all_downloads(loop=loop)
    return {"status": "success", "paused_count": count}

@app.post("/api/downloads/resume-all")
@app.post("/api/download/resume-all")
async def resume_all_downloads():
    """Resume all paused downloads."""
    count = downloader.resume_all_downloads()
    return {"status": "success", "resumed_count": count}

@app.post("/api/downloads/reorder")
@app.post("/api/download/reorder")
@app.post("/api/queue/reorder")
@app.post("/api/downloads/queue/reorder")
async def reorder_download_endpoint(
    req: Optional[dict] = None,
    download_id: Optional[str] = None,
    position: Optional[Any] = None,
    action: Optional[str] = None
):
    """Reorder a queued download (accepts download_id and position or action: 'top' | 'bottom')."""
    did = None
    pos = None
    act = None
    if req:
        did = req.get("download_id")
        pos = req.get("position")
        act = req.get("action")
    did = did or download_id
    pos = pos if pos is not None else position
    act = act or action

    if not did:
        raise HTTPException(status_code=400, detail="download_id required")

    success = downloader.reorder_download(download_id=did, position=pos, action=act)
    if success:
        return {"status": "success", "download_id": did, "position": pos, "action": act}
    raise HTTPException(status_code=404, detail="Download not found in queue or registry")


@app.get("/api/downloads")
async def list_downloads():
    """Get all downloads (active + history)."""
    return downloader.get_all_downloads()


@app.post("/api/downloads/{download_id}/open")
@app.post("/api/download/{download_id}/open")
async def open_download_file(download_id: str):
    """Open the downloaded file using the default system application."""
    status = downloader.download_registry.get(download_id)
    if not status or not status.filename or not os.path.exists(status.filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        import platform
        import subprocess
        if platform.system() == "Windows":
            os.startfile(status.filename)
        elif platform.system() == "Darwin":
            subprocess.call(["open", status.filename])
        else:
            subprocess.call(["xdg-open", status.filename])
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to open file {status.filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/downloads/{download_id}/open-folder")
@app.post("/api/download/{download_id}/open-folder")
async def open_download_folder(download_id: str):
    """Open the containing folder and highlight the downloaded file."""
    status = downloader.download_registry.get(download_id)
    if not status or not status.filename or not os.path.exists(status.filename):
        raise HTTPException(status_code=404, detail="File not found")
    
    try:
        import platform
        import subprocess
        if platform.system() == "Windows":
            subprocess.run(["explorer", "/select,", os.path.normpath(status.filename)], check=False)
        elif platform.system() == "Darwin":
            subprocess.call(["open", "-R", status.filename])
        else:
            folder = os.path.dirname(status.filename) or "."
            subprocess.call(["xdg-open", folder])
        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to open folder for {status.filename}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/downloads")
async def delete_downloads(ids: str, delete_file: bool = False):
    """Delete multiple downloads by IDs (comma separated). Optionally delete from disk."""
    download_ids = [did.strip() for did in ids.split(",")]
    deleted_count = 0
    registry = downloader.download_registry
    
    for did in download_ids:
        if did in registry:
            download = registry[did]
            # Cancel if running or paused
            if download.status in [downloader.DownloadStatusEnum.QUEUED, downloader.DownloadStatusEnum.DOWNLOADING, downloader.DownloadStatusEnum.SCHEDULED, downloader.DownloadStatusEnum.PAUSED]:
                downloader.cancel_download(did, loop=asyncio.get_event_loop())
            
            # Delete file if requested and finished
            if delete_file and download.filename and os.path.exists(download.filename):
                try:
                    os.remove(download.filename)
                    logger.info(f"Deleted file from storage: {download.filename}")
                except Exception as e:
                    logger.error(f"Failed to delete file {download.filename}: {e}")
                    
            # Always clean up staging directory and logs for deleted downloads
            downloader.cleanup_staging_dir(did, remove_all=True)
            downloader._execution_logs.pop(did, None)
            disk_log = downloader.LOGS_DIR / f"{did}.log"
            if disk_log.exists():
                try:
                    os.remove(disk_log)
                except Exception:
                    pass
            
            # Remove from history
            del registry[did]
            
            # Also remove from download requests cache if there
            if did in downloader._download_requests:
                del downloader._download_requests[did]
                
            deleted_count += 1
            
    downloader._save_history()
            
    # Notify clients to refresh
    if downloader.progress_queue:
        await downloader.progress_queue.put({"type": "deleted", "ids": download_ids})
        
    return {"status": "success", "deleted_count": deleted_count}

@app.post("/api/downloads/{download_id}/retry")
@app.post("/api/download/{download_id}/retry")
async def api_retry_download(download_id: str):
    """Retry a failed or cancelled download."""
    new_id = await downloader.retry_download(download_id)
    if not new_id:
        raise HTTPException(status_code=404, detail="Download not found, or not in error/cancelled/paused state.")
    return {"status": "success", "new_id": new_id}

@app.get("/api/downloads/{download_id}/log")
@app.get("/api/download/{download_id}/log")
async def get_download_log(download_id: str):
    """Get the complete raw execution log for a download."""
    log_content = downloader.get_execution_log(download_id)
    if log_content is not None:
        return {"status": "success", "log": log_content}
    return {"status": "error", "log": "No log file available for this download."}


@app.api_route("/api/downloads/{download_id}/file", methods=["GET", "HEAD"])
@app.api_route("/api/download/{download_id}/file", methods=["GET", "HEAD"])
async def download_media_file(download_id: str):
    """Download the completed media file directly to the client browser."""
    target_path = None
    stored_fn = None
    
    registry = downloader.download_registry
    if download_id in registry:
        status = registry[download_id]
        if status.filename:
            stored_fn = status.filename
            resolved = downloader.resolve_media_path(status.filename, download_id)
            if resolved:
                target_path = Path(resolved)

    if not target_path and HISTORY_FILE.exists():
        try:
            with open(HISTORY_FILE, "r", encoding="utf-8") as f:
                history = json.load(f)
                for item in history:
                    if item.get("id") == download_id:
                        fn = item.get("filename")
                        if fn:
                            if not stored_fn:
                                stored_fn = fn
                            resolved = downloader.resolve_media_path(fn, download_id)
                            if resolved:
                                target_path = Path(resolved)
                                break
        except Exception as e:
            logger.warning(f"Error checking history for download {download_id}: {e}")

    if not target_path or not target_path.exists():
        logger.warning(f"Media file not found for download {download_id}. Stored path: {stored_fn}")
        raise HTTPException(status_code=404, detail="Downloaded media file not found on server storage.")

    target_str = str(target_path.resolve())
    filename = target_path.name
    import mimetypes
    media_type, _ = mimetypes.guess_type(target_str)
    if not media_type:
        media_type = "application/octet-stream"

    return FileResponse(
        path=target_str,
        media_type=media_type,
        filename=filename
    )


@app.post("/api/history/clear")
async def clear_download_history(clear_files: bool = False):
    """Clear all finished, cancelled, and errored download history as well as search history."""
    cleared_ids = []
    registry = downloader.download_registry
    
    with downloader._queue_lock:
        target_ids = [
            did for did, s in list(registry.items())
            if s.status in (
                downloader.DownloadStatusEnum.FINISHED,
                downloader.DownloadStatusEnum.ERROR,
                downloader.DownloadStatusEnum.CANCELLED,
            )
        ]

    for did in target_ids:
        cleared_ids.append(did)
        status = registry.get(did)
        if clear_files and status and status.filename and os.path.exists(status.filename):
            try:
                os.remove(status.filename)
            except Exception as e:
                logger.warning(f"Failed to delete file {status.filename} on clear history: {e}")

        downloader.cleanup_staging_dir(did, remove_all=True)
        with downloader._subprocess_lock:
            downloader._execution_logs.pop(did, None)
        disk_log = downloader.LOGS_DIR / f"{did}.log"
        if disk_log.exists():
            try:
                os.remove(disk_log)
            except Exception:
                pass
        with downloader._queue_lock:
            registry.pop(did, None)
            downloader._download_requests.pop(did, None)

    downloader._save_history()

    # Also clear search history
    try:
        with open(SEARCH_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception as e:
        logger.warning(f"Failed to clear search history during history wipe: {e}")

    if downloader.progress_queue and cleared_ids:
        try:
            await downloader.progress_queue.put({"type": "deleted", "ids": cleared_ids})
        except Exception:
            pass

    return {"status": "success", "cleared_count": len(cleared_ids), "cleared_ids": cleared_ids}


@app.post("/api/logs/clear")
async def clear_all_execution_logs():
    """Clear all yt-dlp execution logs from disk and in-memory caches."""
    cleared_count = 0
    with downloader._subprocess_lock:
        downloader._execution_logs.clear()

    if downloader.LOGS_DIR.exists():
        for log_file in downloader.LOGS_DIR.glob("*.log"):
            try:
                os.remove(log_file)
                cleared_count += 1
            except Exception as e:
                logger.warning(f"Failed to remove log file {log_file}: {e}")

    return {"status": "success", "cleared_logs_count": cleared_count}


@app.get("/api/backup")
async def create_backup():
    """Create a zip backup of settings and history."""
    try:
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, "ytdlnis_backup.zip")
        
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
            for file in ["settings.json", "download_history.json", "search_history.json", "cookies.txt"]:
                full_path = DATA_DIR / file
                if full_path.exists():
                    zipf.write(full_path, arcname=file)
                    
        return FileResponse(zip_path, media_type="application/zip", filename="ytdlnis_backup.zip")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/restore")
async def restore_backup(file: UploadFile = File(...)):
    """Restore settings and history from a zip file."""
    if not file.filename.endswith('.zip'):
        raise HTTPException(status_code=400, detail="Must be a zip file.")
        
    try:
        temp_dir = tempfile.mkdtemp()
        zip_path = os.path.join(temp_dir, "uploaded.zip")
        
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        with zipfile.ZipFile(zip_path, 'r') as zipf:
            for member in zipf.namelist():
                if member in ["settings.json", "download_history.json", "search_history.json", "cookies.txt"]:
                    zipf.extract(member, DATA_DIR)
                    
        # Reload history in downloader
        downloader._load_history()
        
        # Load and update settings in memory
        if SETTINGS_FILE.exists():
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    settings_manager.update(AppSettings(**data))
                
        # Broadcast refresh
        if downloader.progress_queue:
            await downloader.progress_queue.put({"type": "settings_updated"})
            await downloader.progress_queue.put({"type": "deleted", "ids": []}) # hack to refresh history
            
        return {"status": "success", "message": "Backup restored successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/search-history")
async def get_search_history():
    """Retrieve saved search history queries."""
    if SEARCH_HISTORY_FILE.exists():
        try:
            with open(SEARCH_HISTORY_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    data = json.loads(content)
                    if isinstance(data, list):
                        return data
        except Exception as e:
            logger.warning(f"Error reading search history: {e}")
            return []
    return []

@app.post("/api/search-history")
async def add_search_history(req: dict):
    """Save a search query unless incognito mode or save_search_history is disabled."""
    settings = settings_manager.get()
    if settings.incognito_mode or not getattr(settings, "save_search_history", True):
        return {"status": "ignored", "message": "Search history saving is disabled"}

    query = (req.get("query") or "").strip()
    if not query:
        return {"status": "error", "message": "Query cannot be empty"}
        
    history = []
    if SEARCH_HISTORY_FILE.exists():
        try:
            with open(SEARCH_HISTORY_FILE, "r", encoding="utf-8") as f:
                content = f.read().strip()
                if content:
                    loaded = json.loads(content)
                    if isinstance(loaded, list):
                        history = loaded
        except Exception:
            history = []
            
    if query in history:
        history.remove(query)
    history.insert(0, query)
    history = history[:20]  # Keep last 20
    
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(SEARCH_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history, f, indent=2)
    except Exception as e:
        logger.error(f"Failed to write search history: {e}")
        raise HTTPException(status_code=500, detail=str(e))
        
    return {"status": "success", "history": history}

@app.delete("/api/search-history")
async def clear_search_history():
    """Clear all saved search history."""
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        with open(SEARCH_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump([], f)
    except Exception as e:
        logger.error(f"Failed to clear search history: {e}")
    return {"status": "success"}

@app.get("/api/select-folder")
async def select_folder():
    """Opens a native system folder dialog and returns the selected absolute path."""
    import tkinter as tk
    from tkinter import filedialog
    import asyncio
    
    def _open_dialog():
        root = tk.Tk()
        root.withdraw()
        # Forces the window to the top
        root.attributes('-topmost', True)
        folder_path = filedialog.askdirectory(title="Select Download Folder")
        root.destroy()
        return folder_path

    # Run blocking tkinter code in thread to avoid freezing FastAPI
    loop = asyncio.get_event_loop()
    selected_path = await loop.run_in_executor(None, _open_dialog)
    
    if selected_path:
        return {"path": selected_path}
    else:
        raise HTTPException(status_code=400, detail="No folder selected")


@app.get("/api/settings", response_model=AppSettings)
async def get_settings():
    """Get current application settings."""
    return settings_manager.get()


@app.put("/api/settings", response_model=AppSettings)
async def update_settings(new_settings: AppSettings):
    """Update application settings."""
    old_settings = settings_manager.get()
    updated = settings_manager.update(new_settings)

    # If incognito mode is turned off, immediately purge all incognito downloads, files, staging, and memory
    if old_settings.incognito_mode and not updated.incognito_mode:
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        downloader.purge_incognito_data(loop=loop)

    # If auto-cleanup timer is enabled, immediately check for any expired downloads
    if updated.enable_browser_download and updated.auto_cleanup_timer > 0:
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        downloader.perform_auto_cleanup(loop=loop)

    if downloader.progress_queue:
        await downloader.progress_queue.put({
            "type": "settings_updated",
            "settings": updated.model_dump(mode='json')
        })
    return updated

@app.post("/api/incognito/purge")
async def api_purge_incognito():
    """Explicitly purge all incognito downloads, files, and staging."""
    loop = None
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        pass
    purged = downloader.purge_incognito_data(loop=loop)
    return {"status": "success", "purged_count": len(purged), "purged_ids": purged}


@app.post("/api/settings/reset", response_model=AppSettings)
async def reset_settings():
    """Reset application settings to defaults."""
    reset_s = settings_manager.reset()
    if downloader.progress_queue:
        await downloader.progress_queue.put({"type": "settings_updated"})
    return reset_s


@app.get("/api/ytdlp-version")
async def get_ytdlp_version():
    """Get current yt-dlp version and channel info."""
    try:
        import yt_dlp.version
        ver = yt_dlp.version.__version__
    except Exception:
        ver = "Unknown"
    settings = settings_manager.get()
    return {
        "status": "success",
        "ytdlp_version": ver,
        "app_version": "1.0.0",
        "release_channel": getattr(settings, 'ytdlp_release_channel', 'stable')
    }



# ─── Cookie Management ───

from models import SiteCookie, ParsePastedCookiesRequest
import cookie_service

@app.post("/api/cookies/site/verify/{site_id}")
async def verify_site_cookie(site_id: str):
    """Verify saved site cookies using yt-dlp test extraction."""
    valid, message = cookie_service.verify_site_cookie(site_id)
    if not valid:
        raise HTTPException(status_code=400, detail=message)
    return {
        "status": "success",
        "message": message,
        "settings": settings_manager.get()
    }


@app.post("/api/cookies/site/toggle/{site_id}")
async def toggle_site_cookie(site_id: str):
    """Toggle a site-specific cookie ON/OFF."""
    settings = settings_manager.get()
    site = next((c for c in settings.site_cookies if c.id == site_id), None)
    if not site:
        raise HTTPException(status_code=404, detail="Site cookie entry not found")
    site.enabled = not site.enabled
    updated = settings_manager.update(settings)
    return updated


@app.post("/api/cookies/parse-pasted")
async def parse_pasted_cookies(req: ParsePastedCookiesRequest):
    """Parse raw pasted Netscape cookies and convert into enabled SiteCookie entries."""
    count, domains = cookie_service.parse_and_save_pasted_cookies(req.raw_text)
    if count == 0:
        raise HTTPException(status_code=400, detail="No valid Netscape format cookie lines found in pasted text.")
    return {
        "status": "success",
        "message": f"Successfully parsed and activated cookies for {count} website(s): {', '.join(domains)}",
        "domains": domains,
        "settings": settings_manager.get()
    }


@app.delete("/api/cookies/site/{site_id}")
async def delete_site_cookie(site_id: str):
    """Delete a site-specific cookie entry."""
    settings = settings_manager.get()
    settings.site_cookies = [c for c in settings.site_cookies if c.id != site_id]
    updated = settings_manager.update(settings)
    return updated


@app.delete("/api/cookies/all")
async def clear_all_cookies():
    """Clear all saved site cookies and global cookies."""
    cookie_service.clear_all_cookies()
    return {"status": "success", "settings": settings_manager.get()}


# ─── YouTube Proof of Origin (PO Token) ───

from models import TestBgUtilsRequest, GeneratePoTokenRequest
import po_token_service

@app.get("/api/potoken/status")
async def get_potoken_status():
    """Get current PO Token status and check BgUtils daemon if applicable."""
    settings = settings_manager.get()
    po_cfg = getattr(settings, "potoken_settings", None)
    daemon_status = None
    if po_cfg and po_cfg.mode == "bgutil_http":
        daemon_status = po_token_service.check_bgutils_status(po_cfg.bgutil_base_url)
    
    return {
        "status": "success",
        "potoken_settings": po_cfg,
        "daemon_status": daemon_status
    }


@app.post("/api/potoken/test-provider")
async def test_bgutils_provider(req: TestBgUtilsRequest):
    """Test connection to BgUtils HTTP provider daemon."""
    res = po_token_service.check_bgutils_status(req.base_url)
    return res


@app.post("/api/potoken/generate")
async def generate_po_tokens_endpoint(req: GeneratePoTokenRequest):
    """Trigger PO token generation for specified mode (no_auth, auth_cookie, bgutil_http, manual)."""
    res = po_token_service.generate_po_tokens(mode=req.mode, test_video_id=req.test_video_id)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("message", "Token generation failed"))
    return res


# ─── WebSocket ───

@app.websocket("/ws/progress")
async def websocket_progress(websocket: WebSocket):
    """WebSocket endpoint for real-time download progress."""
    await websocket.accept()
    connected_clients.add(websocket)
    logger.info(f"WebSocket client connected. Total: {len(connected_clients)}")
    
    try:
        # Send current download states on connect
        current = downloader.get_all_downloads()
        current_list = [s.model_dump(mode='json') for s in current.values()]
        await websocket.send_text(json.dumps({"type": "init", "downloads": current_list}))
        
        # Keep connection alive – listen for client messages (ping/pong)
        while True:
            data = await websocket.receive_text()
            # Client can send ping to keep alive
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    
    except WebSocketDisconnect:
        logger.info("WebSocket client disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        connected_clients.discard(websocket)


# ─── Health Check ───

@app.get("/api/health")
async def health_check():
    """Health check endpoint."""
    return {"status": "ok", "version": "1.0.0"}


@app.post("/api/update")
async def update_ytdlp():
    """Update yt-dlp based on the configured release channel."""
    settings = settings_manager.get()
    channel = (getattr(settings, 'ytdlp_channel', None) or getattr(settings, 'ytdlp_release_channel', 'stable')).lower()
    
    if channel == "nightly":
        url = "https://github.com/yt-dlp/yt-dlp-nightly-builds/archive/master.zip"
        cmd = [sys.executable, "-m", "pip", "install", "-U", url]
    elif channel == "master":
        url = "https://github.com/yt-dlp/yt-dlp/archive/master.zip"
        cmd = [sys.executable, "-m", "pip", "install", "-U", url]
    else:
        cmd = [sys.executable, "-m", "pip", "install", "-U", "yt-dlp"]
        
    try:
        import subprocess
        from pathlib import Path
        process = subprocess.run(cmd, capture_output=True, text=True, check=True)
        
        # Touch main.py to trigger Uvicorn reload
        Path("main.py").touch()
        
        return {"status": "success", "message": f"Updated yt-dlp ({channel}) successfully! Restarting...", "logs": process.stdout}
    except subprocess.CalledProcessError as e:
        raise HTTPException(status_code=500, detail=f"Update failed:\n{e.stderr}")


# ─── Production Frontend Static Files & SPA Routing ───
from fastapi.staticfiles import StaticFiles

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path(__file__).parent / "dist"
if not FRONTEND_DIST.exists():
    FRONTEND_DIST = Path("/app/frontend/dist")

if FRONTEND_DIST.exists():
    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

    @app.get("/{full_path:path}")
    async def serve_production_frontend(full_path: str):
        # Do not intercept API, WS, or documentation endpoints
        if full_path.startswith("api/") or full_path.startswith("ws/") or full_path in ("docs", "redoc", "openapi.json"):
            raise HTTPException(status_code=404, detail="Not Found")
        
        file_path = FRONTEND_DIST / full_path
        if full_path and file_path.exists() and file_path.is_file():
            return FileResponse(file_path)
        
        index_file = FRONTEND_DIST / "index.html"
        if index_file.exists():
            return FileResponse(index_file)
        raise HTTPException(status_code=404, detail="Frontend production build not found")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app", 
        host="127.0.0.1", 
        port=8000, 
        reload=True, 
        reload_excludes=["backend_data/*", "data/*", "tmp/*", "*.json"]
    )
