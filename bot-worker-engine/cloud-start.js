const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { initializeApp, cert, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const SESSION_ID = process.env.SESSION_ID;
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chapters-eam';

async function startCloudEngine() {
  console.log(`[CLOUD-START] Booting CypherX Cloud Engine...`);

  if (!SESSION_ID) {
    console.error(`[CLOUD-START] ERROR: SESSION_ID environment variable is missing!`);
    console.log(`[CLOUD-START] Please set SESSION_ID to your bot's phone number or ID.`);
    process.exit(1);
  }

  console.log(`[CLOUD-START] Target Session: ${SESSION_ID}`);

  // Initialize Firebase
  let app;
  const apps = getApps();
  let serviceAccount = null;

  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      console.error(`[CLOUD-START] Failed to parse FIREBASE_SERVICE_ACCOUNT env var.`);
    }
  } else {
    // Try to find local credentials.json if env var is missing
    const possibleFiles = [
      'serviceAccountKey.json',
      'firebase-service-account.json',
      'firebase-credentials.json',
      'credentials.json'
    ];
    for (const f of possibleFiles) {
      const fullP = path.join(__dirname, f);
      if (fs.existsSync(fullP)) {
        try {
          serviceAccount = JSON.parse(fs.readFileSync(fullP, 'utf8'));
          console.log(`[CLOUD-START] Found service account credentials at ${f}`);
          break;
        } catch (e) {}
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
    console.log(`[CLOUD-START] Firebase initialized for project: ${serviceAccount.project_id || PROJECT_ID}`);
  } else {
    console.error(`[CLOUD-START] ERROR: Firebase credentials missing. Cannot fetch session from cloud.`);
    process.exit(1);
  }

  const db = getFirestore(app);

  // Fetch session from Firestore
  console.log(`[CLOUD-START] Fetching session credentials for +${SESSION_ID} from Firestore...`);
  
  try {
    const sessionDoc = await db.collection('sessions').doc(SESSION_ID).get();
    
    if (!sessionDoc.exists) {
      console.error(`[CLOUD-START] ERROR: Session +${SESSION_ID} not found in database!`);
      console.log(`[CLOUD-START] Ensure the session was successfully paired and synced.`);
      process.exit(1);
    }

    const data = sessionDoc.data();
    if (!data.authFiles || Object.keys(data.authFiles).length === 0) {
      console.error(`[CLOUD-START] ERROR: Session +${SESSION_ID} found but contains no auth files!`);
      process.exit(1);
    }

    const sessionDir = path.join(__dirname, 'session');
    
    // Create session dir if not exists
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    // Write all auth files
    let fileCount = 0;
    for (const [key, content] of Object.entries(data.authFiles)) {
      const originalFilename = key.replace(/_dot_/g, '.');
      fs.writeFileSync(path.join(sessionDir, originalFilename), content, 'utf8');
      fileCount++;
    }

    console.log(`[CLOUD-START] Successfully restored ${fileCount} session files to ./session/`);

  } catch (error) {
    console.error(`[CLOUD-START] ERROR fetching session:`, error.message);
    process.exit(1);
  }

  // Start the actual bot engine
  console.log(`[CLOUD-START] Starting CypherX Bot Engine...`);
  const botProcess = spawn('node', ['index.js'], {
    stdio: 'inherit', // Pipe stdout and stderr to the parent process
    cwd: __dirname
  });

  botProcess.on('error', (err) => {
    console.error('[CLOUD-START] Failed to start bot engine:', err);
  });

  botProcess.on('exit', (code) => {
    console.log(`[CLOUD-START] Bot engine exited with code ${code}`);
    process.exit(code);
  });
}

startCloudEngine();
