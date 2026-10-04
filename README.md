<div align="center">

  <img src="favicon.svg" width="96" height="96" alt="YTDL Downloader Logo" />

  # YTDL Downloader
  ### A Modern, Feature-Packed Full-Stack Web Interface for yt-dlp

  [![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](#prerequisites)
  [![FastAPI](https://img.shields.io/badge/FastAPI-0.115%2B-009688?style=for-the-badge&logo=fastapi&logoColor=white)](#backend)
  [![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](#frontend)
  [![yt-dlp](https://img.shields.io/badge/Engine-yt--dlp-red?style=for-the-badge&logo=youtube&logoColor=white)](https://github.com/yt-dlp/yt-dlp)
  [![Docker Hub](https://img.shields.io/badge/Docker_Hub-sunilshahid%2Fyt--downloader-2496ED?style=for-the-badge&logo=docker&logoColor=white)](https://hub.docker.com/r/sunilshahid/yt-downloader)
  [![License](https://img.shields.io/badge/License-MIT-purple?style=for-the-badge)](#license)

  <p align="center">
    <b>YTDL Downloader</b> brings the unmatched power of <code>yt-dlp</code> into a polished, responsive, and reactive web application. Packed with visual video trimming, interactive crop geometry, YouTube Proof of Origin (PO Token) generation, multi-account cookie management, live byte-level progress streaming, and granular post-processing overrides.
  </p>

  <p align="center">
    <a href="#quick-start">Quick Start</a> •
    <a href="#key-features">Key Features</a> •
    <a href="#docker">Docker Deployment</a> •
    <a href="#screenshots">Screenshots</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#configuration">Configuration</a> •
    <a href="#warnings-and-troubleshooting">⚠️ Warnings, Cookies & Troubleshooting</a>
  </p>

</div>

---

<a id="key-features"></a>
## 🌟 Key Features & Highlights

- **⚡ Full-Stack in One Command**: Run the entire application (FastAPI backend + optimized production React SPA) with a single command: `python main.py`.
- **✂️ Visual Video Trimming (Cut)**: Interactive range scrubbing, multi-segment time slicing, and dual mode operation (keep selected slices or cut out intervals).
- **📐 Interactive Crop Geometry**: Drag-and-drop crop overlay with locked aspect ratios (16:9, 4:3, 1:1, 9:16) and direct FFmpeg filter synthesis.
- **🛡️ Proof of Origin (PO Token) Engine**: Headless BgUtils challenge execution and BotGuard token minting to bypass YouTube 403 Forbidden errors.
- **🍪 Multi-Account & Individual Cookie Manager**: Import Netscape-formatted cookies, manage site-specific accounts, and toggle individual sessions per domain.
- **🚫 SponsorBlock Integration**: Automatically excise paid promotions, intros, and filler segments or mark them as navigable chapters.
- **📜 Live Terminal Logs & Command Reconstructor**: Real-time WebSocket log streaming with stage-by-stage progress hooks and full yt-dlp CLI command reconstruction.
- **🎛️ Advance Options & Reactive Synchronization**: Per-video download overrides that dynamically inherit from global settings and revert cleanly on subsequent requests.
- **🕵️ Incognito Mode**: Zero-trace downloading with history wiping, private sessions, and hidden staging artifacts.

---

<a id="quick-start"></a>
## 🚀 Quick Start

### Prerequisites

Make sure the following tools are installed on your system:
- **Python 3.10+** (Python 3.11 or 3.12/3.13 recommended)
- **FFmpeg**: Required for audio extraction, muxing, cropping, and thumbnail embedding ([Download FFmpeg](https://ffmpeg.org/download.html))
- *(Optional)* **aria2c**: Required if you enable multi-connection accelerated downloading

### Choose Your Way to Run

You can run the full-stack application (React UI + FastAPI + yt-dlp) in two easy ways:

#### ⚡ Option A: Native Python (Virtual Environment)

FastAPI serves the pre-built React frontend and all API/WebSocket endpoints together:

```bash
# 1. Clone the repository and enter directory
git clone https://github.com/sunilshahid/YT-downloader.git
cd YT-downloader

# 2. Create and activate a Python virtual environment
# Linux / macOS / Ubuntu VPS:
python3 -m venv venv
source venv/bin/activate

# Windows (PowerShell):
# python -m venv venv
# .\venv\Scripts\Activate.ps1

# 3. Install Python dependencies
pip install -r backend/requirements.txt

# 4. Run the full-stack application
cd backend
python main.py # or python3 main.py on Linux
```

Access the UI at: **`http://localhost:8000`**

---

#### 🐳 Option B: Docker (Pre-Built Container)

Run everything inside an optimized, production-ready container with FFmpeg, aria2, **Deno**, and Node.js pre-installed:

##### 1. Using Docker Compose (Recommended)

Create a folder, create `docker-compose.yml` with `nano`, paste the configuration, and launch:

```bash
# 1. Create folder and navigate into it
mkdir yt-downloader && cd yt-downloader

# 2. Create and edit docker-compose.yml
nano docker-compose.yml
```

Paste the following YAML content:
```yaml
services:
  app:
    image: sunilshahid/yt-downloader:latest
    container_name: yt-downloader
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/backend/data
      - ./downloads:/downloads
```

> **To save and exit in nano:** Press `Ctrl + O`, hit `Enter`, then press `Ctrl + X`.

Start the container in the background:
```bash
docker compose up -d
```

##### 2. Or Single-Command Docker Run

```bash
docker run -d \
  --name yt-downloader \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ./data:/app/backend/data \
  -v ./downloads:/downloads \
  sunilshahid/yt-downloader:latest
```

Access the UI at: **`http://localhost:8000`**

> [!WARNING]
> **⚠️ Running on a Cloud VPS / Datacenter (Hetzner, DigitalOcean, AWS, OVH, Contabo, etc.)?**
> YouTube challenges datacenter IPs with *"Sign in to confirm you're not a bot"*. See our [⚠️ Warnings, Cookies & Troubleshooting Guide](#warnings-and-troubleshooting) below to bypass this in under a minute!

---

## 🛠️ Development Mode (Optional)

If you wish to modify the React frontend with hot-module replacement (HMR):

1. **Start the Backend**:
   ```bash
   cd backend
   python main.py
   ```

2. **Start the Vite Dev Server**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. Open **`http://localhost:5173`** for local development.

To rebuild the production assets after making frontend edits:
```bash
cd frontend
npm run build
```

---

<a id="screenshots"></a>
<a id="screenshots-walkthrough"></a>
## 📸 Screenshots Walkthrough

### 1. Modern Dashboard & Video Discovery
A clean, dark-mode user interface featuring instant URL parsing, format inspection, download scheduling, incognito browsing, and fast search history.

| Home Dashboard | Downloads & Sub-Tabs | Codec & Quality Selection |
| :---: | :---: | :---: |
| ![Home Dashboard](screenshots/Home.png) | ![Downloads & Sub-Tabs](screenshots/Downloads.png) | ![Quality & Codec](screenshots/Video%20Quality%20and%20Codec.png) |

---

### 2. Visual Video Trimming & Crop Geometry
Precision video editing before downloading begins. Cut multiple segments or excise filler, and crop frames using interactive aspect-ratio bounding boxes.

| Interactive Timeline Trimmer | Aspect-Ratio Crop Geometry |
| :---: | :---: |
| ![Trim & Cut](screenshots/Trim%20and%20Crop.png) | ![Crop Geometry Overlay](screenshots/Trim%20and%20Crop%202.png) |

- **Time-Slice Trimmer**: Precise scrubbing with live preview, multi-segment markers, and automatic overlapping interval merging.
- **Crop Geometry Engine**: Visual bounding box with rule-of-thirds grid, corner/edge drag handles, and resolution scaling (`crop=w:h:x:y`).

---

### 3. Advance Options & Post-Processing
Fine-tune yt-dlp execution parameters on a per-video basis or configure system-wide defaults in Settings.

| Thumbnail Embedding | Chapter Control | Subtitles Manager |
| :---: | :---: | :---: |
| ![Thumbnail](screenshots/Thumbnail.png) | ![Chapters](screenshots/Chapters.png) | ![Subtitles](screenshots/Subtitles.png) |

| SponsorBlock Filtering | Container & Codec Overrides |
| :---: | :---: |
| ![SponsorBlock](screenshots/SponserBlock.png) | ![Container Options](screenshots/Output%20file%20Container.png) |

- **Thumbnails**: High-resolution cover embedding or standalone `.jpg`/`.webp` image extraction.
- **Chapters**: Native metadata chapter embedding or automatic splitting into individually numbered files (`--split-chapters`).
- **Subtitles**: Multi-language selection, auto-generated platform caption fallback, and soft-sub muxing (`.srt`, `.vtt`, `.ass`, `.lrc`).
- **SponsorBlock**: Excises sponsored segments, self-promotions, interaction reminders, and intros.

---

### 4. Enterprise Engine: Cookies & Anti-Bot Bypasses
Overcome platform blocks, age-restrictions, and rate-limits with dedicated session and token tooling.

| Proof of Origin (PO Token) | Multi-Account Cookie Manager |
| :---: | :---: |
| ![Proof of Origin](screenshots/Poof%20of%20Origin.png) | ![Cookies Manager](screenshots/Cookies.png) |

- **YouTube Proof of Origin (PO Token)**: Mint guest and authenticated BotGuard tokens via headless BgUtils integration to bypass HTTP 403 Forbidden throttling.
- **Netscape Cookie Session Manager**: Add, edit, test, and toggle site-specific cookies for YouTube Premium, age-restricted videos, and member-only streams.

---

### 5. Transparency & System Controls
Inspect live execution internals and keep your downloader up-to-date with upstream extractors.

| Real-Time Execution Logs & CLI Reconstructor | Private Incognito Mode | Release Channel Updates |
| :---: | :---: | :---: |
| ![Logs System](screenshots/Logging%20System.png) | ![Incognito Mode](screenshots/Incognito%20Mode.png) | ![Update System](screenshots/Update%20System.png) |

- **Log Streaming & CLI Reconstructor**: Live terminal output paired with a 1:1 reconstructed CLI equivalent command that you can copy and re-run anywhere.
- **Incognito Mode**: Disables history logging and wipes intermediate files immediately after download.
- **Update System**: Switch between **Stable**, **Nightly**, and **Master** git channels with one click directly from the UI.

---

<a id="architecture"></a>
## 🏗️ Architecture

```
YT-downloader/
├── backend/
│   ├── main.py                  # FastAPI application & SPA static router
│   ├── downloader.py            # yt-dlp wrapper, progress hooks & post-processors
│   ├── models.py                # Pydantic schemas & validation models
│   ├── settings_manager.py      # Thread-safe persistent settings manager
│   ├── cookie_service.py        # Netscape cookie storage & domain parser
│   ├── po_token_service.py      # Proof of Origin (PO Token) generation service
│   ├── requirements.txt         # Backend Python dependencies
│   └── data/                    # Staging, logs, history, and configuration storage
├── frontend/
│   ├── dist/                    # Compiled production assets (served by FastAPI)
│   ├── src/
│   │   ├── components/          # React components (HomeTab, FormatSelector, Modals)
│   │   ├── hooks/               # WebSocket & Settings hooks
│   │   └── App.jsx              # Main application shell
│   ├── package.json             # Frontend dependencies & build scripts
│   └── vite.config.js           # Vite build & bundler configuration
├── screenshots/                 # Showcase screenshots
└── favicon.svg                  # Application brand icon
```

### Full-Stack Dataflow
1. **Client Interaction**: User configures download parameters in React (format, cuts, crop, cookies, PO token).
2. **WebSocket & REST**: Backend accepts request via FastAPI (`POST /api/download`) and assigns a unique task UUID.
3. **In-Process yt-dlp Pipeline**: Runs directly inside Python bindings with custom progress hooks and real-time output interception.
4. **Post-Processing Chain**: FFmpeg performs stream remuxing, video slicing, audio extraction, thumbnail embeds, and chapter splitting.
5. **Real-Time Broadcast**: Progress queue streams speed, ETA, percentage, and log lines to all connected WebSocket clients.

---

<a id="configuration"></a>
## ⚙️ Configuration & Settings

The settings panel allows you to customize every aspect of your downloading pipeline:

| Category | Key Options | Description |
| :--- | :--- | :--- |
| **General** | `theme`, `incognito_mode`, `save_search_history` | UI appearance, private downloading, and search caching |
| **Directories** | `download_dir`, `subdirectory_format`, `filename_template` | Output folder location and customizable filename token formatting |
| **Downloading** | `concurrent_downloads`, `speed_limit`, `retries`, `aria2` | Concurrency, rate limits, network retries, and aria2c acceleration |
| **Formats** | `default_container`, `preferred_codec`, `audio_quality` | Preferred video containers (MP4/MKV/WebM) and audio codecs |
| **SponsorBlock** | `sponsorblock_remove`, `sponsorblock_categories` | Auto-removal of promotional segments and category filtering |
| **Network** | `proxy_url`, `geo_bypass`, `custom_user_agent` | SOCKS5/HTTP proxies, geo-restriction bypass, and headers |
| **Cookies** | `site_cookies`, `cookies_enabled` | Per-domain Netscape session cookies management |
| **PO Token** | `bgutil_base_url`, `player_clients`, `use_only_po_token` | YouTube anti-bot Proof of Origin token minting |
| **Updates** | `ytdlp_release_channel`, `auto_update` | Automatic updates tracking Stable or Nightly channels |

---

<a id="docker"></a>
<a id="docker-deployment"></a>
## 🐳 Docker & Container Deployment

YTDL Downloader includes an optimized, production-ready multi-stage Docker build that bundles the built React frontend, FastAPI backend, FFmpeg, aria2, **Deno** (official JS challenge engine), and **Node.js** into a single unified container.

> [!TIP]
> **🚀 Out-of-the-Box Anti-Bot Bypass:**
> The Docker container comes pre-configured with **Deno**, **yt-dlp-ejs**, and **Chrome TLS Impersonation** (`curl_cffi`). When paired with your cookies, downloads in **4K (2160p), 1440p, 1080p, VP9, and AV1** succeed right out of the box!

### 1. Using Docker Compose (Recommended)

You can launch the entire stack in seconds using Docker Compose:

```bash
# 1. Create a directory for YTDL Downloader
mkdir yt-downloader && cd yt-downloader

# 2. Create the docker-compose.yml file
nano docker-compose.yml
```

Paste the following configuration:
```yaml
services:
  app:
    image: sunilshahid/yt-downloader:latest
    container_name: yt-downloader
    restart: unless-stopped
    ports:
      - "8000:8000"
    volumes:
      - ./data:/app/backend/data
      - ./downloads:/downloads
```

> **To save and exit in nano:** Press `Ctrl + O`, hit `Enter`, then press `Ctrl + X`.

Start the container in the background:
```bash
docker compose up -d
```

### 2. Single-Command Docker Run
If you prefer running a single container without a compose file:
```bash
docker run -d \
  --name yt-downloader \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ./data:/app/backend/data \
  -v ./downloads:/downloads \
  sunilshahid/yt-downloader:latest
```

Access the web interface at: **`http://localhost:8000`** *(or `http://YOUR_SERVER_IP:8000`)*

---

### 3. Build & Push to Docker Hub (From Source)
If you made modifications and want to build and publish your own image:
```bash
# 1. Build the production multi-stage image
docker build -t sunilshahid/yt-downloader:latest .

# 2. Test locally
docker run -d \
  --name yt-downloader \
  --restart unless-stopped \
  -p 8000:8000 \
  -v ./data:/app/backend/data \
  -v ./downloads:/downloads \
  sunilshahid/yt-downloader:latest

# 3. Log in and push to Docker Hub
docker login
docker push sunilshahid/yt-downloader:latest
```

### 🪟 Windows & Lightweight WSL2 Setup
On Windows, Docker Desktop utilizes WSL2. A lightweight setup has been pre-configured:
1. **Lightweight Resource Limits (`.wslconfig`)**: Limits memory to 2GB and 2 CPUs so your host system never slows down.
2. **1-Click Virtualization & WSL Setup**:
   - Right-click `setup-wsl-docker.bat` and select **"Run as administrator"**.
   - It enables Windows Virtual Machine Platform and installs Debian (lightweight distro, ~80MB).
   - If prompted, restart your PC once so Windows loads the hypervisor, then launch Docker Desktop!

---

<a id="warnings-and-troubleshooting"></a>
<a id="troubleshooting"></a>
## ⚠️ Warnings, Cookie Guide & Troubleshooting

<a id="cloud-vps-warning"></a>
### 1. ⚠️ Cloud VPS & Datacenter Bot Wall (*"Sign in to confirm you're not a bot"*)
YouTube aggressively restricts cloud VPS and datacenter IP addresses (Hetzner, DigitalOcean, AWS, OVH, Linode, Contabo, etc.) with BotGuard bot checks and SABR streaming locks.

* **Why it happens:** Datacenter IP ranges are automatically flagged as potential scraping bots by YouTube.
* **The Solution:** Import cookies exported from an Incognito browser session (detailed below). Our container automatically applies Chrome TLS Impersonation (`curl_cffi`) and Deno JS cipher solving to make your server look like a genuine Google Chrome browser.

---

### 2. ⚠️ CRITICAL WARNING: Account Safety & Ban Prevention

> [!CAUTION]
> **DO NOT USE YOUR PRIMARY PERSONAL OR SENSITIVE GOOGLE ACCOUNT!**
> 
> When you export session cookies from a personal Google account and use them on a cloud server/VPS:
> - If you download videos in bulk or trigger rate limits, Google's automated anti-abuse algorithms may flag the activity as automated scraping.
> - **High-Risk Consequences:** Session revocation, mandatory CAPTCHA challenges, or in severe cases of automated abuse, **permanent suspension or deletion of your Google account**.
> - **Rule of Thumb:** **Always create and use a dedicated throwaway / secondary Google account** created specifically for downloading. Never expose your personal email, Google Drive, or primary workspace account!

---

### 3. 🍪 Step-by-Step: How to Export Cookies via Incognito

> [!IMPORTANT]
> **Why Unauthenticated Incognito Only Shows 360p:**
> If you export cookies from Incognito *without* logging in, YouTube classifies the connection as an anonymous guest and caps formats to **360p**.
> 
> To unlock **4K (2160p), 1440p, 1080p, VP9, AV1, and high-bitrate audio**, you must sign into a Google account inside Incognito following the steps below.

#### Recommended Extension: "Get cookies.txt LOCALLY"
We strongly recommend **[Get cookies.txt LOCALLY](https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc)** over *Cookie-Editor*. Extensions like *Cookie-Editor* often only export ~14 basic cookies, missing vital authentication and security tokens. **Get cookies.txt LOCALLY** exports the complete Netscape cookie jar with all 50+ essential cookies (including `LOGIN_INFO`, `SID`, `HSID`, `SSID`, `SAPISID`, and `*PSIDTS`).

#### The Exact 5-Step Incognito Workflow:
1. **Enable the Extension in Incognito**:
   - In Chrome, go to `chrome://extensions`, find **Get cookies.txt LOCALLY** &rarr; **Details**, and toggle **"Allow in Incognito"** to **ON**.
2. **Open an Incognito / Private Window**:
   - Press `Ctrl+Shift+N` (or `Cmd+Shift+N` on Mac).
3. **Sign In to Your Secondary / Throwaway Account**:
   - Navigate to [youtube.com](https://www.youtube.com) and sign in using your **disposable/secondary Google account**.
4. **Export the Netscape Cookies**:
   - Click the **Get cookies.txt LOCALLY** icon in the toolbar.
   - Click **Export** &rarr; copy the Netscape formatted text (starts with `# Netscape HTTP Cookie File`).
   - Close the Incognito window (closing the window stops Chrome from actively rotating session tokens in the background, keeping the exported cookies stable!).
5. **Import into YTDL Downloader**:
   - Open YTDL Downloader &rarr; **Settings &rarr; Cookies & Accounts**.
   - Make sure **Enable Cookies** is toggled **ON**.
   - Click **Add Site Cookie**, select `youtube.com`, paste the Netscape cookie text into the box, and click **Save**.

---

### 4. HTTP 403 Forbidden on Media Chunks
- Ensure your Netscape cookies are updated under **Settings &rarr; Cookies & Accounts**.
- If YouTube rotated the tokens, re-export them from an Incognito tab and paste the updated text.

### 5. FFmpeg Not Detected
- Ensure `ffmpeg` and `ffprobe` are installed and available in your system's `PATH`.
- On Windows: `winget install Gyan.FFmpeg`
- On macOS: `brew install ffmpeg`
- On Linux: `sudo apt install ffmpeg`

### 6. Port 8000 Already in Use
- Run with a custom port:
  ```bash
  uvicorn main:app --host 127.0.0.1 --port 8080
  ```

---

<a id="license"></a>
## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">
  <sub>Built with ❤️ using FastAPI, React, and yt-dlp.</sub>
</div>
