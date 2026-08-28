# 🌐 Site A: Bot Pairing & Web Portal (`bot-pairing-web`)

This is the **Frontend Web UI & WhatsApp Pairing API Server** (Site A). It generates WhatsApp pairing codes / QR codes and immediately saves authenticated session credentials into **Firebase Cloud Firestore**.

---

## 🎯 Purpose
* Provides user-friendly Web Interface (`public/index.html`, `store.html`, `admin.html`).
* Handles 8-digit pairing code generation and QR code streaming via `@whiskeysockets/baileys`.
* Syncs session keys (`creds.json`, app sync keys) to Firebase Firestore (`sessions` and `bots` collections) in real time.
* Does **not** run heavy 24/7 bot plugins or media tasks — keeps serverless/web hosting light and responsive!

---

## 🔑 Required Environment Variables

Configure these environment variables in your hosting provider (Vercel, Render, Railway, etc.):

| Variable | Required | Description | Example |
| :--- | :--- | :--- | :--- |
| `PORT` | Optional | Port for the Express server (Default: `3000`) | `3000` |
| `ACCESS_CODE` | Optional | Security protection code for API endpoints (Default: `SKYBEE2026`) | `SKYBEE2026` |
| `FIREBASE_PROJECT_ID` | **Required** | Your Firebase project identifier | `chapters-eam` |
| `FIREBASE_SERVICE_ACCOUNT` | **Required** | Complete JSON string of your Firebase Service Account key | `{"type":"service_account",...}` |

> 💡 **Tip:** Alternatively, place your `serviceAccountKey.json` directly into this folder.

---

## 🚀 How to Run Locally

```bash
# 1. Navigate to this directory
cd bot-pairing-web

# 2. Install dependencies
npm install

# 3. Start the pairing server
npm start
```

Open `http://localhost:3000` in your browser.

---

## ☁️ Deployment Instructions

### Deploy to Render (Web Service):
1. Create a new **Web Service** on Render connected to this repository/directory (`bot-pairing-web`).
2. Build Command: `npm install`
3. Start Command: `npm start`
4. Add the `FIREBASE_PROJECT_ID` and `FIREBASE_SERVICE_ACCOUNT` environment variables.

### Deploy to Vercel:
1. Import project into Vercel setting the root directory to `bot-pairing-web`.
2. Add environment variables and deploy.

---

## 🔗 How it Links to Site B (`bot-worker-engine`)
When a user finishes pairing here, [firebaseSync.js](file:///c:/Users/cheapters/Desktop/bot-site/bot-pairing-web/firebaseSync.js) uploads the credentials to Firestore. **Site B** will automatically detect this and start the WhatsApp bot within seconds.
