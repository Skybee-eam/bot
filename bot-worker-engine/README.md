# 🤖 Site B: Standalone Bot Worker Engine (`bot-worker-engine`)

This is the **24/7 Dedicated Multi-Bot Runner Engine** (Site B). It connects to **Firebase Cloud Firestore**, listens for new or modified sessions from **Site A (bot-pairing-web)**, and automatically runs, monitors, and auto-restarts WhatsApp bot instances.

---

## 🎯 Purpose
* Connects to Firebase Firestore via real-time WebSocket snapshot listeners (`onSnapshot`).
* Automatically writes session credentials into local `cloud_sessions/<phone>` workspaces.
* Spawns separate, isolated bot processes for each active WhatsApp session.
* Executes all 25+ plugins (AI, Media Downloaders, Group Moderation, Anti-Delete, Auto-Status, etc.).
* Exposes an HTTP `/health` and `/ping` endpoint so cloud hosts (Railway, Render, Koyeb) remain active.

---

## 🔑 Required Environment Variables

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | Health check server port (Default: `8080`) | `8080` |
| `FIREBASE_PROJECT_ID` | **Required** | Must match the project ID used in Site A | `chapters-eam` |
| `FIREBASE_SERVICE_ACCOUNT` | **Required** | Complete JSON string of the same Firebase Service Account | `{"type":"service_account",...}` |

> 💡 **Tip:** Alternatively, place the same `serviceAccountKey.json` file inside this folder.

---

## 🚀 How to Run

### Multi-Bot Cloud Worker (Recommended):
Runs all active sessions synced from Site A simultaneously:
```bash
# 1. Navigate to this directory
cd bot-worker-engine

# 2. Install dependencies
npm install

# 3. Start the multi-bot cloud worker
npm run start:worker
```

### Single-Bot Mode (Specific Session ID):
If you want to run only one specific bot on a machine:
```bash
SESSION_ID=234xxxxxxxxxx npm run start:cloud
```

---

## ☁️ Deployment Instructions

### Deploy to Railway / Koyeb / Fly.io / VPS:
1. Create a new **Worker Service** or **Web Service** connected to `bot-worker-engine`.
2. Build Command: `npm install`
3. Start Command: `npm run start:worker`
4. Set the `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` environment variables.

---

## 🔄 Lifecycle Workflow
1. User pairs on **Site A** $\rightarrow$ Session credentials stored in Firestore `sessions` collection.
2. **Site B (`cloud-worker.js`)** receives the document event within milliseconds.
3. Automatically writes credentials to `cloud_sessions/<phone>/` and boots `bot-engine.js`.
4. If a bot disconnects or crashes $\rightarrow$ Worker automatically restarts it with backoff.
5. If a session is deleted from Site A $\rightarrow$ Worker terminates the bot process cleanly.
