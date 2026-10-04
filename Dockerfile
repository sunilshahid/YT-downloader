# ====================================================================
# Unified Production Multi-Stage Dockerfile for YTDLnis Web
# ====================================================================

# ── Stage 1: Build Frontend (Lightweight Node Alpine) ────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Copy dependencies first for Docker layer caching
COPY frontend/package*.json ./
RUN npm install

# Copy source and build production bundle
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Full-Stack Runtime (Python 3.12 Slim) ───────────────────
FROM python:3.12-slim

# Set environment variables
ENV PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

# Install system dependencies required for media processing and yt-dlp:
# - ffmpeg: audio/video multiplexing, cropping, cutting, stream merging
# - aria2: multi-connection high-speed download accelerator
# - nodejs: JavaScript challenge / n-sig cipher execution for yt-dlp
# - ca-certificates: TLS/SSL certs for HTTPS extraction
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ffmpeg \
        aria2 \
        nodejs \
        ca-certificates && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache Python dependencies in a separate layer
COPY backend/requirements.txt ./backend/requirements.txt
RUN pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend application source code
COPY backend/ ./backend/

# Copy compiled frontend production assets from Stage 1
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose single full-stack port
EXPOSE 8000

# Persist application database, logs, cookies, and downloads
VOLUME ["/app/backend/data", "/downloads"]

# Working directory is backend where main.py resides
WORKDIR /app/backend

# Run FastAPI backend (which also serves the frontend SPA and WebSockets)
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
