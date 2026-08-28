# Project Structure — Distributed Multi-Site Architecture

This document provides a comprehensive overview of the **Skybee Distributed WhatsApp Bot Platform** architecture, directory layout, ground site files (`bot-pairing-web`), and standalone bot engine files (`bot-worker-engine`).

---

## 📁 Repository Directory Tree

```text
bot-site/
├── .firebaserc                          # Firebase project configuration
├── .gitignore                           # Git ignore rules
├── MULTI_SITE_BOT_ARCHITECTURE_BLUEPRINT.md # Reusable distributed architecture blueprint
├── PROJECT_STRUCTURE.md                 # Project architecture & file documentation
├── README.md                            # Master repository guide
│
├── 🌐 bot-pairing-web/                   # SITE A: Web Pairing & Management Portal
│   ├── index.js                         # Express Pairing API & WhatsApp Handshake Server
│   ├── firebaseSync.js                  # Cloud Firestore sync & session persistence
│   ├── package.json                     # Standalone Web API dependencies
│   ├── package-lock.json                # Pinned dependency lockfile
│   ├── render.yaml                      # Render.com cloud deployment config
│   ├── vercel.json                      # Vercel deployment config
│   ├── README.md                        # Site A setup & deployment guide
│   └── public/                          # Static Frontend Web UI
│       ├── index.html                   # Pairing portal (Phone input, Pairing & QR Code generator)
│       ├── admin.html                   # Administrative dashboard & bot control interface
│       ├── store.html                   # Bot store & session management dashboard
│       ├── router.html                  # Navigation & route redirection
│       ├── style.css                    # UI styling, glassmorphism & responsive design
│       ├── logo.png                     # Site branding logo (PNG)
│       └── logo.jpg                     # Site branding logo (JPG)
│
└── 🤖 bot-worker-engine/                 # SITE B: 24/7 Dedicated Multi-Bot Runner
    ├── cloud-worker.js                  # Real-time Firestore session listener & multi-bot spawner
    ├── bot-engine.js                    # Bot instance process manager & lifecycle runner
    ├── cypher.js                        # Core Baileys connection & command dispatcher
    ├── index.js                         # Standalone bot entrypoint
    ├── cloud-start.js                   # Single-session cloud loader
    ├── system.js                        # System utilities, configurations & database setup
    ├── package.json                     # Bot dependencies & scripts (Baileys, ffmpeg, etc.)
    ├── package-lock.json                # Bot lockfile
    ├── README.md                        # Site B setup & deployment guide
    ├── lib/                             # Media conversion & stream utility helpers
    │   ├── catbox.js                    # File uploading to Catbox.moe
    │   ├── color.js                     # Terminal color formatter
    │   ├── converter.js                 # Audio/Video conversion utilities (ffmpeg)
    │   ├── exif.js                      # Sticker EXIF metadata modifier
    │   ├── myfunc.js                    # General utility & stream parsing functions
    │   └── remini.js                    # Image enhancement tool
    │
    └── plugins/                         # 🔌 Modular Command Plugins (25 plugins)
        ├── ai.js                        # AI chat & image query handlers
        ├── alive.js                     # Bot uptime and live ping check
        ├── anticall.js                  # WhatsApp auto-call rejection
        ├── antidelete.js                # Deleted message logger & recovery
        ├── autostatus.js                # WhatsApp status auto-view & reactions
        ├── bible.js                     # Scripture & Bible reference lookup
        ├── clearsessions.js             # Session cleanup utility
        ├── downloader.js                # Universal media / video / audio downloader
        ├── group.js                     # Group administration tools
        ├── ig.js                        # Instagram media downloader
        ├── link.js                      # WhatsApp invite link handlers
        ├── menu.js                      # Interactive command menu generator
        ├── motivation.js                # Motivational quotes & messages
        ├── movie.js                     # Movie & IMDb lookup
        ├── ping.js                      # Response latency check
        ├── play.js                      # Music / YouTube audio stream fetcher
        ├── quran.js                     # Quran recitation & verse lookup
        ├── react.js                     # Auto-reactions to messages
        ├── session.js                   # Session ID generator & validator
        ├── sticker.js                   # Image/video to WhatsApp sticker maker
        ├── tagall.js                    # Group mention tool
        ├── tiktok.js                    # TikTok video downloader (no watermark)
        ├── tomp3.js                     # Video/audio to MP3 converter
        ├── vv.js                        # View-Once message saver & viewer
        └── welcome.js                   # Group join/leave greeting messages
```

---

## 🌐 1. Site A: Ground Site (`bot-pairing-web/`)

These files handle user interactions, web dashboard management, and WhatsApp pairing over HTTP/WebSocket:

* **`bot-pairing-web/public/index.html`**: The main user-facing portal where users input their phone number to generate an 8-digit WhatsApp pairing code or scan a QR code.
* **`bot-pairing-web/public/admin.html`**: Admin panel for controlling and inspecting running bot instances and managing access keys.
* **`bot-pairing-web/public/store.html`**: Bot dashboard displaying connected sessions, status indicators, and deployment options.
* **`bot-pairing-web/public/router.html`**: Frontend router for navigation between views.
* **`bot-pairing-web/public/style.css`**: Modern dark-themed styling with responsive components, glassmorphism effects, and animations.
* **`bot-pairing-web/index.js`**: The primary Express server. It hosts the REST endpoints, coordinates `@whiskeysockets/baileys` socket pairing, and pushes authenticated sessions to Firebase Firestore.
* **`bot-pairing-web/firebaseSync.js`**: Cloud Firestore sync module that backs up and restores session credentials across server restarts and cloud hosting redeployments.

---

## 🤖 2. Site B: Bot Core Engine (`bot-worker-engine/`)

These files control 24/7 WhatsApp socket connectivity, message interception, command parsing, and execution:

* **`bot-worker-engine/cloud-worker.js`**: The 24/7 multi-bot runner. Connects to Firestore, listens in real time for new/updated sessions from Site A, and automatically spawns/manages bot child processes.
* **`bot-worker-engine/bot-engine.js`**: The process runner that maintains and monitors individual bot sockets.
* **`bot-worker-engine/cypher.js`**: The primary WhatsApp bot listener. Serializes incoming messages, manages event emitters, and runs the command execution loop.
* **`bot-worker-engine/system.js`**: Runtime configurations, global variables, SQLite/JSON database helpers, and environment variables.
* **`bot-worker-engine/cloud-start.js`**: Helper entrypoint to bootstrap single-session bot deployments via environment variables (`SESSION_ID`).
* **`bot-worker-engine/lib/`**: Helper utilities for media conversion (`converter.js`), WhatsApp sticker metadata (`exif.js`), image enhancement (`remini.js`), and stream handling (`myfunc.js`).
* **`bot-worker-engine/plugins/`**: Contains **25 command plugins** providing over 50 commands (AI chat, media downloaders, group moderation, status viewing, anti-delete, etc.).
