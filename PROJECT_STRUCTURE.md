# Project Structure — Dragon Pair Web / CypherX

This document provides a comprehensive overview of the **Dragon Pair Web / CypherX WhatsApp Bot** architecture, directory layout, and key component descriptions.

---

## 📁 Directory Tree

```text
bot-site/
├── .firebaserc                  # Firebase project mapping
├── .gitignore                   # Git ignore patterns
├── firebaseSync.js              # Cloud Firestore session sync & persistence logic
├── index.js                     # Primary Express backend API & WhatsApp pairing manager
├── package.json                 # Main Node.js project manifest & dependencies
├── package-lock.json            # Pinned dependency lockfile
├── PROJECT_STRUCTURE.md         # This architecture documentation file
├── render.yaml                  # Render.com deployment configuration
├── sessions_vault.json          # Local session metadata vault
├── vercel.json                  # Vercel deployment configuration
│
├── public/                      # Static Frontend Web UI
│   ├── index.html               # Main pairing interface (QR Code & Pairing Code generator)
│   ├── store.html               # Bot management / session dashboard
│   ├── style.css                # Frontend styling & responsive design
│   ├── logo.png                 # Brand logo (PNG)
│   └── logo.jpg                 # Brand logo (JPG)
│
├── sessions/                    # Persistent WhatsApp authentication session files
├── temp_sessions/               # Temporary session workspaces during pairing
│
└── CypherX/
    └── CypherX-main/            # Core WhatsApp Bot Engine
        ├── package.json         # Bot engine dependencies & scripts
        ├── package-lock.json    # Bot engine lockfile
        ├── bot-engine.js        # Bot instance runner / process lifecycle manager
        ├── cypher.js            # Core bot messaging, handler, and event logic
        ├── index.js             # Bot standalone entrypoint
        ├── system.js            # System utilities, configurations, and core setup
        ├── tmp/                 # Temporary media processing directory
        ├── lib/                 # Helper utilities and stream handlers
        ├── src/                 # Source assets & definitions
        ├── session/             # CypherX local fallback session data
        └── plugins/             # Extensible command modules & feature plugins
            ├── ai.js            # AI queries & chat interactions
            ├── alive.js         # Bot status / ping check
            ├── anticall.js      # WhatsApp call rejection & auto-handling
            ├── antidelete.js    # Deleted message recovery & logging
            ├── autostatus.js    # WhatsApp status auto-view & reactions
            ├── bible.js         # Scripture & Bible reference lookup
            ├── clearsessions.js # Session cleanup utility
            ├── downloader.js    # Universal media / video / audio downloader
            ├── group.js         # Group administration & management commands
            ├── ig.js            # Instagram media downloader
            ├── link.js          # WhatsApp invite link handlers
            ├── menu.js          # Bot interactive command menu
            ├── motivation.js    # Motivational quotes & messages
            ├── movie.js         # Movie & media info search
            ├── ping.js          # Response latency & uptime check
            ├── play.js          # Audio / music streaming fetcher
            ├── quran.js         # Quran recitation & verse lookup
            ├── react.js         # Auto-reactions to messages
            ├── session.js       # Session ID generator & checker
            ├── sticker.js       # Media to WhatsApp sticker converter
            ├── tagall.js        # Group mention / tag-all tool
            ├── tiktok.js        # TikTok video downloader without watermark
            ├── tomp3.js         # Video/audio to MP3 converter
            ├── vv.js            # View-Once message saver & viewer
            └── welcome.js       # Group welcome / goodbye greetings
```

---

## 🧩 Key Architecture Components

### 1. API & Pairing Server (`index.js`)
* Built with **Express** and `@whiskeysockets/baileys`.
* Provides REST endpoints to request pairing codes or QR codes for WhatsApp Web authentication.
* Spawns, monitors, and restarts bot child processes (`CypherX/CypherX-main/bot-engine.js`).
* Includes access code protection (`requireAccessCode`) and session isolation.

### 2. Cloud Session Persistence (`firebaseSync.js`)
* Integrates with **Firebase Admin SDK** (Cloud Firestore).
* Automatically syncs active WhatsApp session credentials and configurations to the cloud, allowing persistence across container redeployments and cloud restarts (e.g., Render, Railway, Vercel).

### 3. Frontend Web Interface (`public/`)
* **`index.html`**: User-facing portal where users input their phone number to receive a WhatsApp pairing code or scan a QR code.
* **`store.html`**: Management console for monitoring connected bot sessions.
* **`style.css`**: Dark modern aesthetic with responsive layouts and feedback states.

### 4. Bot Core Engine (`CypherX/CypherX-main/`)
* **`bot-engine.js`**: Child process execution wrapper for individual bot instances.
* **`cypher.js` & `index.js`**: Core Baileys socket connection management, message serialization, event handlers, and plugin dispatch loop.
* **`system.js`**: Runtime configuration, database drivers, and helper methods.

### 5. Plugin System (`CypherX/CypherX-main/plugins/`)
* Modular plugin architecture where each command file exports handler functions triggered by incoming messages and commands (AI tools, media downloaders, auto-status, anti-delete, etc.).
* Features **25 active core plugins** contributing to **54 verified menu commands** and **138 total triggerable aliases**.
