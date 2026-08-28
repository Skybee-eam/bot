/**
 * CypherX Multi-Session Cloud Bot Runner (Worker Engine)
 * 
 * Runs 24/7 on a dedicated server (Railway, Render Background Worker, VPS, Fly.io, etc.)
 * Listens in REAL-TIME to Firebase Firestore.
 * Automatically starts, monitors, and stops bot instances whenever users pair on Site A (the web pairing site).
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chapters-eam';
const PORT = process.env.PORT || 8080;
const SESSIONS_ROOT = path.join(__dirname, 'cloud_sessions');

if (!fs.existsSync(SESSIONS_ROOT)) {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

// Active bot child processes map: phone -> { process, startedAt, restartCount }
const runningBots = new Map();

// ─────────────────────────────────────────────────────────────────
// 1. FIREBASE INITIALIZATION
// ─────────────────────────────────────────────────────────────────
let app = null;
let db = null;

function initFirebase() {
  try {
    const apps = getApps();
    let serviceAccount = null;

    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        console.error('[CLOUD-WORKER] Failed to parse FIREBASE_SERVICE_ACCOUNT env variable.');
      }
    }

    if (!serviceAccount) {
      const possibleFiles = [
        'serviceAccountKey.json',
        'firebase-service-account.json',
        'firebase-credentials.json',
        'credentials.json',
        '../serviceAccountKey.json'
      ];
      for (const f of possibleFiles) {
        const fullP = path.resolve(__dirname, f);
        if (fs.existsSync(fullP)) {
          try {
            serviceAccount = JSON.parse(fs.readFileSync(fullP, 'utf8'));
            console.log(`[CLOUD-WORKER] Loaded Firebase credentials from: ${fullP}`);
            break;
          } catch {}
        }
      }
    }

    if (serviceAccount) {
      if (apps.length === 0) {
        app = initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id || PROJECT_ID
        });
      } else {
        app = apps[0];
      }
      db = getFirestore(app);
      console.log(`[CLOUD-WORKER] ✅ Firebase initialized for project: ${serviceAccount.project_id || PROJECT_ID}`);
      return true;
    } else {
      console.error(`[CLOUD-WORKER] ❌ Firebase credentials missing! Please set FIREBASE_SERVICE_ACCOUNT.`);
      return false;
    }
  } catch (err) {
    console.error(`[CLOUD-WORKER] Firebase init error:`, err.message);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────
// 2. SESSION FILE WRITER
// ─────────────────────────────────────────────────────────────────
function writeSessionFiles(phone, authFiles) {
  const userDir = path.join(SESSIONS_ROOT, phone);
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  let count = 0;
  for (const [key, content] of Object.entries(authFiles)) {
    const originalFilename = key.replace(/_dot_/g, '.');
    const filePath = path.join(userDir, originalFilename);
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
  }
  return count;
}

// ─────────────────────────────────────────────────────────────────
// 3. BOT LIFECYCLE MANAGEMENT
// ─────────────────────────────────────────────────────────────────
function startBotProcess(phone) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (!cleanPhone) return;

  if (runningBots.has(cleanPhone)) {
    const existing = runningBots.get(cleanPhone);
    if (existing.process && !existing.process.killed) {
      console.log(`[CLOUD-WORKER] Bot +${cleanPhone} is already running.`);
      return;
    }
  }

  const userDir = path.join(SESSIONS_ROOT, cleanPhone);
  if (!fs.existsSync(path.join(userDir, 'creds.json'))) {
    console.warn(`[CLOUD-WORKER] Cannot start +${cleanPhone}: creds.json missing in ${userDir}`);
    return;
  }

  console.log(`\n[CLOUD-WORKER] 🚀 Starting Bot Instance for +${cleanPhone}...`);
  
  const botProcess = spawn('node', ['bot-engine.js', '--session', userDir], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      BOT_SESSION_DIR: userDir,
      BOT_PHONE: cleanPhone
    }
  });

  botProcess.stdout.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg) console.log(`[BOT +${cleanPhone}] ${msg}`);
  });

  botProcess.stderr.on('data', (data) => {
    const msg = data.toString().trim();
    if (msg && !msg.includes('Bad MAC') && !msg.includes('Failed to decrypt')) {
      console.error(`[BOT +${cleanPhone} ERROR] ${msg}`);
    }
  });

  botProcess.on('exit', (code) => {
    console.log(`[CLOUD-WORKER] Bot +${cleanPhone} exited (code=${code})`);
    runningBots.delete(cleanPhone);

    // Auto-restart if not killed intentionally and code != 0
    if (code !== 0 && code !== null) {
      console.log(`[CLOUD-WORKER] Scheduling restart for +${cleanPhone} in 5s...`);
      setTimeout(() => {
        if (fs.existsSync(path.join(userDir, 'creds.json'))) {
          startBotProcess(cleanPhone);
        }
      }, 5000);
    }
  });

  runningBots.set(cleanPhone, {
    process: botProcess,
    startedAt: new Date().toISOString(),
    restartCount: (runningBots.get(cleanPhone)?.restartCount || 0) + 1
  });
}

function stopBotProcess(phone) {
  const cleanPhone = String(phone).replace(/[^0-9]/g, '');
  if (runningBots.has(cleanPhone)) {
    const entry = runningBots.get(cleanPhone);
    console.log(`[CLOUD-WORKER] Stopping bot process for +${cleanPhone}...`);
    try {
      entry.process.kill('SIGTERM');
    } catch {}
    runningBots.delete(cleanPhone);
  }
}

// ─────────────────────────────────────────────────────────────────
// 4. REAL-TIME FIRESTORE LISTENER
// ─────────────────────────────────────────────────────────────────
function listenToFirestoreChanges() {
  if (!db) return;

  console.log(`[CLOUD-WORKER] 📡 Listening to Firestore 'sessions' collection for real-time changes...`);

  // Listen to sessions collection
  db.collection('sessions').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = change.doc.data();
      const phone = data.phone || change.doc.id;

      if (change.type === 'added' || change.type === 'modified') {
        console.log(`[CLOUD-WORKER] 📥 Detected session sync for +${phone}`);
        if (data.authFiles && Object.keys(data.authFiles).length > 0) {
          const written = writeSessionFiles(phone, data.authFiles);
          console.log(`[CLOUD-WORKER] Written ${written} auth files for +${phone}`);
          startBotProcess(phone);
        }
      }

      if (change.type === 'removed') {
        console.log(`[CLOUD-WORKER] 🗑️ Session removed for +${phone}. Terminating bot instance.`);
        stopBotProcess(phone);
        const userDir = path.join(SESSIONS_ROOT, phone);
        if (fs.existsSync(userDir)) {
          try {
            fs.rmSync(userDir, { recursive: true, force: true });
          } catch {}
        }
      }
    });
  }, (err) => {
    console.error(`[CLOUD-WORKER] Firestore listener error:`, err.message);
  });
}

// ─────────────────────────────────────────────────────────────────
// 5. LIGHTWEIGHT HTTP HEALTH CHECK SERVER
// ─────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/ping' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      service: 'CypherX Cloud Bot Worker',
      activeBots: runningBots.size,
      botList: Array.from(runningBots.keys()),
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    }));
  }
  res.writeHead(404);
  res.end('Not Found');
});

// ─────────────────────────────────────────────────────────────────
// 6. BOOTSTRAP
// ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n========================================================`);
  console.log(`🤖 CYPHER-X MULTI-BOT CLOUD WORKER`);
  console.log(`📦 Storage: ${SESSIONS_ROOT}`);
  console.log(`========================================================\n`);

  server.listen(PORT, () => {
    console.log(`[CLOUD-WORKER] HTTP Health Server running on port ${PORT}`);
  });

  const initialized = initFirebase();
  if (initialized) {
    listenToFirestoreChanges();
  } else {
    console.warn(`[CLOUD-WORKER] Running without Firebase connection. Waiting for env configuration.`);
  }
}

process.on('SIGTERM', () => {
  console.log('[CLOUD-WORKER] Shutting down. Stopping all bot instances...');
  for (const phone of runningBots.keys()) {
    stopBotProcess(phone);
  }
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[CLOUD-WORKER] Caught SIGINT. Exiting...');
  for (const phone of runningBots.keys()) {
    stopBotProcess(phone);
  }
  process.exit(0);
});

main();
