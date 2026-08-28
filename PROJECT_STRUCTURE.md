# Project Structure — Dragon Pair Web / CypherX

This document provides a comprehensive overview of the **Dragon Pair Web / CypherX WhatsApp Bot** architecture, directory layout, ground site files, and bot core engine details.

---

## 📁 Directory Tree

```text
bot-site/
├── .firebaserc                          # Firebase project configuration
├── .gitignore                           # Git ignore rules
├── firebaseSync.js                      # Cloud Firestore session sync & persistence logic
├── index.js                             # Primary Express backend API & WhatsApp pairing manager
├── package.json                         # Main Node.js project manifest & dependencies
├── package-lock.json                    # Pinned dependency lockfile
├── PROJECT_STRUCTURE.md                 # Project architecture & file documentation
├── render.yaml                          # Render.com cloud deployment config
├── serviceAccountKey.json               # Firebase Admin SDK credentials (if configured)
├── sessions_vault.json                  # Local session metadata vault
├── vercel.json                          # Vercel deployment config
│
├── public/                              # 🌐 Ground Site (Frontend Web UI)
│   ├── index.html                       # Pairing portal (Phone input, Pairing & QR Code generator)
│   ├── admin.html                       # Administrative dashboard & bot control interface
│   ├── store.html                       # Bot store & session management dashboard
│   ├── router.html                      # Navigation & route redirection
│   ├── style.css                        # UI styling, dark mode & responsive design
│   ├── logo.png                         # Site branding logo (PNG)
│   └── logo.jpg                         # Site branding logo (JPG)
│
├── sessions/                            # Active WhatsApp authentication session files
├── temp_sessions/                       # Temporary session workspaces during pairing
│
└── CypherX/
    └── CypherX-main/                    # 🤖 WhatsApp Bot Engine
        ├── package.json                 # Bot dependencies & scripts
        ├── package-lock.json            # Bot lockfile
        ├── bot-engine.js                # Bot instance process manager & lifecycle runner
        ├── cypher.js                    # Core Baileys connection, message handler & command dispatcher
        ├── index.js                     # Bot standalone entrypoint
        ├── cloud-start.js               # Single-session cloud loader
        ├── cloud-worker.js              # Real-time multi-bot cloud worker (Site B engine)
        ├── system.js                    # System utilities, configurations & database setup
        ├── tmp/                         # Temporary media processing directory
        ├── session/                     # Local fallback session storage
        ├── lib/                         # Media conversion & stream utility helpers
        │   ├── catbox.js                # File uploading to Catbox.moe
        │   ├── color.js                 # Terminal color formatter
        │   ├── converter.js             # Audio/Video conversion utilities (ffmpeg)
        │   ├── exif.js                  # Sticker EXIF metadata modifier
        │   ├── myfunc.js                # General utility & stream parsing functions
        │   └── remini.js                # Image enhancement tool
        │
        └── plugins/                     # 🔌 Modular Command Plugins (25 plugins)
            ├── ai.js                    # AI chat & image query handlers
            ├── alive.js                 # Bot uptime and live ping check
            ├── anticall.js              # WhatsApp auto-call rejection
            ├── antidelete.js            # Deleted message logger & recovery
            ├── autostatus.js            # WhatsApp status auto-view & reactions
            ├── bible.js                 # Scripture & Bible reference lookup
            ├── clearsessions.js         # Session cleanup utility
            ├── downloader.js            # Universal media / video / audio downloader
            ├── group.js                 # Group administration tools
            ├── ig.js                    # Instagram media downloader
            ├── link.js                  # WhatsApp invite link handlers
            ├── menu.js                  # Interactive command menu generator
            ├── motivation.js            # Motivational quotes & messages
            ├── movie.js                 # Movie & IMDb lookup
            ├── ping.js                  # Response latency check
            ├── play.js                  # Music / YouTube audio stream fetcher
            ├── quran.js                 # Quran recitation & verse lookup
            ├── react.js                 # Auto-reactions to messages
            ├── session.js               # Session ID generator & validator
            ├── sticker.js               # Image/video to WhatsApp sticker maker
            ├── tagall.js                # Group mention tool
            ├── tiktok.js                # TikTok video downloader (no watermark)
            ├── tomp3.js                 # Video/audio to MP3 converter
            ├── vv.js                    # View-Once message saver & viewer
            └── welcome.js               # Group join/leave greeting messages
```

---

## 🌐 1. Ground Site Files (Web Frontend & API)

These files handle user interactions, web dashboard management, and WhatsApp pairing over HTTP/WebSocket:

* **`public/index.html`**: The main user-facing portal where users input their phone number to generate an 8-digit WhatsApp pairing code or scan a QR code.
* **`public/admin.html`**: Admin panel for controlling and inspecting running bot instances and managing access keys.
* **`public/store.html`**: Bot dashboard displaying connected sessions, status indicators, and deployment options.
* **`public/router.html`**: Frontend router for navigation between views.
* **`public/style.css`**: Modern dark-themed styling with responsive components, glassmorphism effects, and animations.
* **`index.js`**: The primary Express server. It hosts the REST endpoints, coordinates `@whiskeysockets/baileys` socket pairing, creates sessions, and spawns/monitors bot child processes.
* **`firebaseSync.js`**: Cloud Firestore sync module that backs up and restores session credentials across server restarts and cloud hosting redeployments.

---

## 🤖 2. Bot Core Engine Files (`CypherX/CypherX-main/`)

These files control WhatsApp socket connectivity, message interception, command parsing, and execution:

* **`bot-engine.js`**: The process runner invoked by the Express API to maintain and monitor the lifecycle of each bot instance.
* **`cypher.js`**: The primary WhatsApp bot listener. Serializes incoming messages, manages event emitters, and runs the command execution loop.
* **`system.js`**: Runtime configurations, global variables, SQLite/JSON database helpers, and environment variables.
* **`cloud-start.js`**: Helper entrypoint to bootstrap the bot in cloud/container environments.
* **`lib/`**: Helper utilities for media conversion (`converter.js`), WhatsApp sticker metadata (`exif.js`), image enhancement (`remini.js`), and stream handling (`myfunc.js`).
* **`plugins/`**: Contains **25 command plugins** providing over 50 commands (AI chat, media downloaders, group moderation, status viewing, anti-delete, etc.).
