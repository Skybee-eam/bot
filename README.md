# 🐝 Skybee Distributed WhatsApp Bot Platform

A modern, production-grade distributed WhatsApp Bot architecture split into two independent services linked via **Google Firebase Cloud Firestore**.

---

## 📂 Repository Layout

```text
.
├── bot-pairing-web/                     # 🌐 SITE A: Web Pairing & Management Portal
│   ├── public/                          # Frontend Web UI (Default Store Homepage, Admin & Pairing Gates)
│   ├── index.js                         # Express Pairing API & Baileys Handshake Server
│   ├── firebaseSync.js                  # Cloud Firestore sync & session persistence
│   ├── package.json                     # Standalone Web API dependencies
│   ├── vercel.json                      # Vercel deployment configuration
│   ├── render.yaml                      # Render deployment configuration
│   └── README.md                        # Site A configuration & deployment guide
│
├── bot-worker-engine/                   # 🤖 SITE B: 24/7 Dedicated Multi-Bot Runner
│   ├── cloud-worker.js                  # Real-time Firestore session listener & process manager
│   ├── bot-engine.js                    # Multi-device Baileys engine with LID Signal fault tolerance
│   ├── cypher.js                        # Message serializer & command execution loop
│   ├── system.js                        # System utilities & database configurations
│   ├── plugins/                         # 26 Modular Command Plugins (AI, Media, Group Admin, etc.)
│   ├── lib/                             # Media conversion utilities (ffmpeg, catbox, exif)
│   ├── package.json                     # Bot engine dependencies & scripts
│   └── README.md                        # Site B configuration & deployment guide
│
├── MULTI_SITE_BOT_ARCHITECTURE_BLUEPRINT.md # 📐 Reusable Architecture Reference
├── PROJECT_STRUCTURE.md                     # 📁 Detailed project tree & component breakdown
└── README.md                                # 📖 Master overview (this file)
```

---

## ⚡ How The Two Services Communicate

```text
[User on Site A (Web Portal / Store)]
          │
          ▼ 
   Generates 8-digit Pairing Code / QR Code
          │
          ▼ (Authenticates with WhatsApp)
[Google Firebase Firestore] ── (Real-time 'sessions' collection)
          ▲
          │ (Snapshot Listener 'onSnapshot')
[Site B: Dedicated 24/7 Bot Worker Engine]
          │
          ▼ 
   Restores session credentials & spawns bot process 24/7!
```

---

## 🌟 Key Features & Capabilities

* **🌐 Clean Two-Tier Separation:** Site A handles user-facing web traffic & pairing codes; Site B handles 24/7 socket execution.
* **🛡️ Full Group Management Suite:** Moderation commands (`.group`, `.open`, `.close`, `.kick`, `.promote`, `.demote`, `.hidetag`, `.tagall`, `.link`, `.revoke`, `.setname`, `.welcome`, `.antilink`).
* **👁️ View-Once Bypass (`.vv` / `👁️` / `🔓`):** Direct in-chat recovery of View-Once images, videos, and audio notes using in-memory key caching.
* **🔄 Chat-Triggered Bot Reboot (`.restart` / `.reboot`):** Safe in-chat process restart with automatic supervisor recovery in 3–5 seconds.
* **🗑️ Automatic Dead Session Purging:** When a user logs out on WhatsApp (*Error 401*), the session is automatically purged from disk, database vault, and Cloud Firestore with zero manual effort.
* **⚡ Live Launch Mode Switcher:** Toggle between **Instant Auto-Start** and **Admin Approval Required** from the Admin Dashboard in real time.
* **📶 Signal LID Fault-Tolerance:** Auto-recovers from Baileys `No sessions` and LID sender errors in modern WhatsApp groups.

---

## 🚀 Quick Setup & Deployment

### 1. Shared Database Setup (Firebase)
1. Create a project at [Firebase Console](https://console.firebase.google.com/).
2. Enable **Cloud Firestore Database**.
3. Generate a Service Account Key under **Project Settings > Service Accounts**.
4. You will supply `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` to both services.

---

### 2. Deploying Site A: Web Pairing Portal (`bot-pairing-web`)
* **Host on:** Vercel, Netlify, or Render (Web Service).
* **Command:** `npm start`
* **Env Vars:** `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`, `ACCESS_CODE` (optional).
* **Guide:** See [`bot-pairing-web/README.md`](bot-pairing-web/README.md).

---

### 3. Deploying Site B: Dedicated Bot Runner (`bot-worker-engine`)
* **Host on:** Railway, Fly.io, Koyeb, VPS, or Render (Background Worker).
* **Command:** `npm run start:worker`
* **Env Vars:** `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT`.
* **Guide:** See [`bot-worker-engine/README.md`](bot-worker-engine/README.md).

---

## 📚 Documentation & Architecture Guides
* **[MULTI_SITE_BOT_ARCHITECTURE_BLUEPRINT.md](MULTI_SITE_BOT_ARCHITECTURE_BLUEPRINT.md)**: Step-by-step code and design blueprint for building and deploying distributed bot architectures.
* **[PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)**: Full file breakdown and inventory.
