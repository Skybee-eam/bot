# 🚀 Distributed Multi-Site WhatsApp Bot Architecture Blueprint

> **Reference Template & Implementation Guide**  
> Use this blueprint to build, deploy, or replicate a 2-site distributed WhatsApp bot system where the **Web Pairing Site (Site A)** and the **24/7 Bot Engine Server (Site B)** are hosted on completely separate platforms and linked via **Firebase Firestore**.

---

## 📐 High-Level System Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                 SITE A: Web Pairing Portal                      │
│             (Vercel, Netlify, Render Web Service)               │
│                                                                 │
│  • User enters phone number on Web UI                           │
│  • Requests 8-digit Pairing Code or QR Code                     │
│  • Baileys temporary socket completes handshake                │
│  • Uploads authentication credentials to Firebase Firestore     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ (Real-time Cloud Sync)
┌─────────────────────────────────────────────────────────────────┐
│               DATABASE: Firebase Cloud Firestore                │
│                                                                 │
│  Collection: 'sessions'                                         │
│  └── Doc: [phone_number]                                        │
│      ├── phone: "234xxxxxxxxxx"                                 │
│      ├── name: "User Push Name"                                 │
│      ├── updatedAt: Timestamp                                   │
│      └── authFiles: { "creds_dot_json": "...", ... }            │
│                                                                 │
│  Collection: 'bots'                                             │
│  └── Doc: [phone_number]                                        │
│      ├── status: "active"                                       │
│      ├── approvalStatus: "approved"                             │
│      └── lastSync: Timestamp                                    │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼ (Firestore onSnapshot Trigger)
┌─────────────────────────────────────────────────────────────────┐
│                SITE B: 24/7 Bot Engine Worker                   │
│          (Railway, VPS, Render Worker, Fly.io, Koyeb)           │
│                                                                 │
│  • Listens to Firestore 'sessions' in real time                 │
│  • Automatically restores auth credentials to local folder      │
│  • Spawns & monitors independent bot child processes            │
│  • Auto-reconnects, processes WhatsApp commands & plugins       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📁 Project Structure (If Split Into 2 Separate Repositories)

### 🌐 Repo 1: Site A — Pairing & Management Web Portal (`bot-pairing-web`)

```text
bot-pairing-web/
├── package.json                         # Web server manifest (Express, Baileys, Firebase-Admin)
├── index.js                             # Express pairing API & QR/Code generation
├── firebaseSync.js                      # Firestore session sync module
├── serviceAccountKey.json               # Firebase credentials (or FIREBASE_SERVICE_ACCOUNT env)
├── vercel.json / render.yaml            # Deployment configuration
├── temp_sessions/                       # Short-lived pairing handshake workspaces
└── public/                              # Frontend Web Assets
    ├── index.html                       # Pairing UI (Phone input, Code/QR display)
    ├── store.html                       # Connected bots list & management
    ├── admin.html                       # Admin panel for keys and controls
    ├── style.css                        # UI styling & glassmorphism theme
    └── logo.png                         # Site branding logo
```

### 🤖 Repo 2: Site B — 24/7 Bot Core Runner (`bot-worker-engine`)

```text
bot-worker-engine/
├── package.json                         # Bot engine manifest (Baileys, ffmpeg, plugins)
├── cloud-worker.js                      # Firestore real-time listener & multi-bot spawner
├── bot-engine.js                        # Individual bot lifecycle manager & socket runner
├── cypher.js                            # Core message serialization & command loop
├── system.js                            # System configs, database & global definitions
├── cloud_sessions/                      # Auto-restored local session files from Firestore
├── lib/                                 # Converters, stream helpers & media modifiers
│   ├── converter.js                     # ffmpeg audio/video converters
│   ├── exif.js                          # Sticker metadata modifier
│   └── catbox.js                        # File uploader
└── plugins/                             # 25+ Extensible command plugins
    ├── ai.js                            # AI chatbot & GPT prompts
    ├── alive.js                         # Uptime check
    ├── anticall.js                      # Call auto-reject
    ├── antidelete.js                    # Deleted message recovery
    ├── autostatus.js                    # Status auto-view
    ├── downloader.js                    # Universal media downloader
    ├── menu.js                          # Dynamic interactive menu
    └── ...
```

---

## 🔧 Core Implementation Files

### 1. Site A: Cloud Sync Handler (`firebaseSync.js`)

```javascript
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

class FirebaseSyncManager {
  constructor() {
    const apps = getApps();
    let serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
      ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
      : JSON.parse(fs.readFileSync(path.resolve('serviceAccountKey.json'), 'utf8'));

    const app = apps.length === 0 ? initializeApp({ credential: cert(serviceAccount) }) : apps[0];
    this.db = getFirestore(app);
  }

  async saveSessionToCloud(phone, sessionDir) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    const files = fs.readdirSync(sessionDir);
    const sessionData = {};

    for (const file of files) {
      const content = fs.readFileSync(path.join(sessionDir, file), 'utf8');
      sessionData[file.replace(/\./g, '_dot_')] = content;
    }

    let userName = '';
    try {
      const creds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf8'));
      userName = creds.me?.name || creds.pushName || '';
    } catch {}

    // Save to Firestore
    await this.db.collection('sessions').doc(cleanPhone).set({
      phone: cleanPhone,
      name: userName,
      updatedAt: FieldValue.serverTimestamp(),
      authFiles: sessionData
    }, { merge: true });

    await this.db.collection('bots').doc(cleanPhone).set({
      phone: cleanPhone,
      name: userName,
      status: 'active',
      lastSync: FieldValue.serverTimestamp()
    }, { merge: true });

    return true;
  }
}

export default new FirebaseSyncManager();
```

---

### 2. Site B: Real-Time Multi-Bot Cloud Worker (`cloud-worker.js`)

```javascript
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SESSIONS_ROOT = path.join(__dirname, 'cloud_sessions');
if (!fs.existsSync(SESSIONS_ROOT)) fs.mkdirSync(SESSIONS_ROOT, { recursive: true });

const runningBots = new Map();

// Initialize Firebase
const apps = getApps();
const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT 
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) 
  : JSON.parse(fs.readFileSync(path.resolve('serviceAccountKey.json'), 'utf8'));

const app = apps.length === 0 ? initializeApp({ credential: cert(serviceAccount) }) : apps[0];
const db = getFirestore(app);

// Write session files to disk
function writeSessionFiles(phone, authFiles) {
  const userDir = path.join(SESSIONS_ROOT, phone);
  if (!fs.existsSync(userDir)) fs.mkdirSync(userDir, { recursive: true });
  for (const [key, content] of Object.entries(authFiles)) {
    fs.writeFileSync(path.join(userDir, key.replace(/_dot_/g, '.')), content, 'utf8');
  }
}

// Start individual bot process
function startBotProcess(phone) {
  if (runningBots.has(phone)) return;
  const userDir = path.join(SESSIONS_ROOT, phone);
  
  console.log(`[WORKER] Spawning bot instance for +${phone}...`);
  const botProcess = spawn('node', ['bot-engine.js', '--session', userDir], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, BOT_SESSION_DIR: userDir, BOT_PHONE: phone }
  });

  botProcess.on('exit', (code) => {
    runningBots.delete(phone);
    if (code !== 0) {
      setTimeout(() => startBotProcess(phone), 5000); // Auto-reconnect
    }
  });

  runningBots.set(phone, botProcess);
}

// Stop bot process
function stopBotProcess(phone) {
  if (runningBots.has(phone)) {
    runningBots.get(phone).kill('SIGTERM');
    runningBots.delete(phone);
  }
}

// Listen to Firestore changes in real-time
db.collection('sessions').onSnapshot((snapshot) => {
  snapshot.docChanges().forEach((change) => {
    const data = change.doc.data();
    const phone = data.phone || change.doc.id;

    if (change.type === 'added' || change.type === 'modified') {
      if (data.authFiles) {
        writeSessionFiles(phone, data.authFiles);
        startBotProcess(phone);
      }
    }

    if (change.type === 'removed') {
      stopBotProcess(phone);
    }
  });
});

// Lightweight health check endpoint for Cloud Host (Railway / Render / VPS)
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'online', activeBots: runningBots.size }));
}).listen(process.env.PORT || 8080);
```

---

## 🚀 Deployment Recipe

### 🌍 Site A: Pairing Site (Vercel / Render Web Service)

1. Create a Firebase Project on [Firebase Console](https://console.firebase.google.com/).
2. Enable **Cloud Firestore** in test or production mode.
3. Download your `serviceAccountKey.json` under **Project Settings > Service Accounts**.
4. Set Environment Variables on Site A:
   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
   PORT=3000
   ```
5. Deploy and start with:
   ```bash
   npm start
   ```

---

### 🤖 Site B: Bot Runner Server (Railway / Fly.io / VPS)

1. Set the exact same Firebase Environment Variables on Site B:
   ```bash
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_SERVICE_ACCOUNT={"type":"service_account",...}
   PORT=8080
   ```
2. Start the worker engine:
   ```bash
   npm run start:worker
   ```
   *(or `node cloud-worker.js`)*

---

## 🔄 User Workflow

1. A user visits **Site A** (`https://pairing.yourdomain.com`).
2. The user enters their phone number and receives an **8-digit WhatsApp pairing code**.
3. User enters the pairing code in WhatsApp $\rightarrow$ Site A authenticates and pushes session keys to **Firestore**.
4. **Site B** detects the new Firestore document within milliseconds, pulls the credentials, and starts the bot process.
5. The WhatsApp bot is now **online 24/7**!
