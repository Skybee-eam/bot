/**
 * CypherX Multi-Session Cloud Bot Runner (Worker Engine)
 * 
 * Runs 24/7 on a dedicated server (Railway, Render Background Worker, VPS, Fly.io, etc.)
 * Listens in REAL-TIME to Firebase Firestore.
 * Supports both:
 *   - Instant Auto-Start Mode: Automatically boots bots as soon as users link.
 *   - Admin Approval Mode: Waits for admin approval on the admin portal before booting bots.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chapters-eam';
const PORT = process.env.PORT || 8080;
const SESSIONS_ROOT = path.join(__dirname, 'cloud_sessions');

// This node's identity in the cluster. Deliberately NOT a fixed/guessable
// default (e.g. "Render Cloud") — a collision here means two nodes both
// think they own the same bot and both connect it to WhatsApp at once,
// which corrupts the Signal session (repeated "conflict" disconnects and
// "Bad MAC" decrypt failures). Set SERVER_NODE_NAME explicitly per node.
const SERVER_NODE_NAME = process.env.SERVER_NODE_NAME || `Worker (${os.hostname()})`;

if (!fs.existsSync(SESSIONS_ROOT)) {
  fs.mkdirSync(SESSIONS_ROOT, { recursive: true });
}

// Active bot child processes map: phone -> { process, startedAt, restartCount }
const runningBots = new Map();

// Track approval status and system mode in memory
let currentSystemMode = 'instant'; // 'instant' | 'approval'
const botApprovalStatus = new Map(); // phone -> 'approved' | 'pending' | 'rejected'
const botAssignedServer = new Map(); // phone -> assignedServer name (or undefined if unassigned)

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

// Best-effort: record which node owns a bot. Fire-and-forget by design —
// callers should not block startup on this write succeeding.
function claimServerAssignment(phone, serverId) {
  if (!db) return;
  db.collection('bots').doc(phone).set({
    assignedServer: serverId,
    lastSync: FieldValue.serverTimestamp()
  }, { merge: true }).catch(() => {});
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

  // Respect cluster assignment: only start bots assigned to THIS node (or
  // unassigned ones, which get claimed below). This is what stops multiple
  // worker nodes from all connecting the same WhatsApp account at once.
  const assignedTo = botAssignedServer.get(cleanPhone);
  if (assignedTo && assignedTo !== SERVER_NODE_NAME) {
    console.log(`[CLOUD-WORKER] ⏭️  Skipping +${cleanPhone} — assigned to "${assignedTo}", this node is "${SERVER_NODE_NAME}".`);
    return;
  }

  // Check approval if mode is 'approval'
  const approval = botApprovalStatus.get(cleanPhone);
  if (currentSystemMode === 'approval' && approval === 'pending') {
    console.log(`[CLOUD-WORKER] ⏳ Bot +${cleanPhone} is PENDING ADMIN APPROVAL. Cannot start.`);
    return;
  }

  if (runningBots.has(cleanPhone)) {
    const existing = runningBots.get(cleanPhone);
    if (existing.process && !existing.process.killed) {
      return;
    }
  }

  const userDir = path.join(SESSIONS_ROOT, cleanPhone);
  if (!fs.existsSync(path.join(userDir, 'creds.json'))) {
    console.warn(`[CLOUD-WORKER] Cannot start +${cleanPhone}: creds.json missing in ${userDir}`);
    return;
  }

  // Unassigned (legacy/first-seen) bot — claim it for this node so other
  // nodes skip it from now on.
  if (!assignedTo) {
    botAssignedServer.set(cleanPhone, SERVER_NODE_NAME);
    claimServerAssignment(cleanPhone, SERVER_NODE_NAME);
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

  botProcess.on('exit', async (code) => {
    console.log(`[CLOUD-WORKER] Bot +${cleanPhone} exited (code=${code})`);
    runningBots.delete(cleanPhone);

    if (code === 88) {
      console.log(`[CLOUD-WORKER] 🗑️ +${cleanPhone} was logged out on WhatsApp. Auto-deleting dead session from disk & Cloud Firestore...`);
      try {
        if (fs.existsSync(userDir)) {
          fs.rmSync(userDir, { recursive: true, force: true });
        }
        if (db) {
          await db.collection('sessions').doc(cleanPhone).delete();
          await db.collection('bots').doc(cleanPhone).delete();
        }
        botApprovalStatus.delete(cleanPhone);
      } catch (err) {
        console.warn('[CLOUD-WORKER Purge Note]:', err.message);
      }
      return;
    }

    // Auto-restart if not killed intentionally and approved
    const currentApproval = botApprovalStatus.get(cleanPhone);
    const isAllowedToRun = currentSystemMode === 'instant' || currentApproval === 'approved';

    if (code !== 0 && code !== null && isAllowedToRun) {
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
// 4. REAL-TIME FIRESTORE LISTENERS
// ─────────────────────────────────────────────────────────────────
function listenToFirestoreChanges() {
  if (!db) return;

  console.log(`[CLOUD-WORKER] 📡 Listening to Firestore for real-time mode & session changes...`);

  // 1. Listen for global System Mode changes ('instant' vs 'approval')
  db.collection('system_settings').doc('config').onSnapshot((doc) => {
    if (doc.exists) {
      const data = doc.data();
      if (data.pairingMode) {
        currentSystemMode = data.pairingMode;
        console.log(`\n========================================================`);
        console.log(`⚙️ [SYSTEM MODE CHANGE] System Mode: ${currentSystemMode.toUpperCase()}`);
        console.log(`========================================================\n`);

        if (currentSystemMode === 'instant') {
          // If switched to instant, boot up any pending bots that have sessions
          for (const [phone, status] of botApprovalStatus.entries()) {
            if (!runningBots.has(phone)) {
              startBotProcess(phone);
            }
          }
        }
      }
    }
  }, (err) => {
    console.warn(`[CLOUD-WORKER] system_settings listener note:`, err.message);
  });

  // 2. Listen to bots collection for approvalStatus + cluster assignment changes
  db.collection('bots').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = change.doc.data();
      const phone = data.phone || change.doc.id;
      const status = data.approvalStatus || 'approved';
      botApprovalStatus.set(phone, status);

      const newAssigned = data.assignedServer || null;
      if (newAssigned) botAssignedServer.set(phone, newAssigned);

      if (change.type === 'added' || change.type === 'modified') {
        // Reassigned to a different node while running here — release it.
        // The receiving node's own listener picks it up from here.
        if (newAssigned && newAssigned !== SERVER_NODE_NAME && runningBots.has(phone)) {
          console.log(`[CLOUD-WORKER] 🔀 Bot +${phone} reassigned to "${newAssigned}". Stopping on this node.`);
          stopBotProcess(phone);
          return;
        }

        if (status === 'approved') {
          if (!runningBots.has(phone)) {
            console.log(`[CLOUD-WORKER] ✅ Bot +${phone} is APPROVED. Starting bot...`);
            startBotProcess(phone);
          }
        } else if (status === 'pending' || status === 'rejected') {
          if (currentSystemMode === 'approval' && runningBots.has(phone)) {
            console.log(`[CLOUD-WORKER] ⏹️ Bot +${phone} status is '${status}'. Halting process.`);
            stopBotProcess(phone);
          }
        }
      }
    });
  }, (err) => {
    console.warn(`[CLOUD-WORKER] bots collection listener note:`, err.message);
  });

  // 3. Listen to sessions collection for session credentials
  db.collection('sessions').onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      const data = change.doc.data();
      const phone = data.phone || change.doc.id;

      if (change.type === 'added' || change.type === 'modified') {
        const assignedTo = botAssignedServer.get(phone);
        if (assignedTo && assignedTo !== SERVER_NODE_NAME) {
          // Assigned to a different node — don't even restore the session
          // files locally, so nothing on this node can accidentally start it.
          return;
        }

        console.log(`[CLOUD-WORKER] 📥 Session sync detected for +${phone}`);
        if (data.authFiles && Object.keys(data.authFiles).length > 0) {
          const written = writeSessionFiles(phone, data.authFiles);
          console.log(`[CLOUD-WORKER] Restored ${written} auth files for +${phone}`);
          
          if (data.approvalStatus) {
            botApprovalStatus.set(phone, data.approvalStatus);
          }
          
          const approval = botApprovalStatus.get(phone) || data.approvalStatus || (currentSystemMode === 'approval' ? 'pending' : 'approved');
          
          if (currentSystemMode === 'instant' || approval === 'approved') {
            startBotProcess(phone);
          } else {
            console.log(`[CLOUD-WORKER] ⏳ Bot +${phone} saved. Waiting for Admin Approval (Mode: APPROVAL).`);
          }
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
    console.error(`[CLOUD-WORKER] Firestore sessions listener error:`, err.message);
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
      serverNodeName: SERVER_NODE_NAME,
      mode: currentSystemMode,
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
  console.log(`🌐 Node identity: ${SERVER_NODE_NAME}`);
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
