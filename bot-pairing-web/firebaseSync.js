import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chapters-eam';
const LOCAL_VAULT_FILE = path.join(__dirname, 'sessions_vault.json');

class FirebaseSyncManager {
  constructor() {
    this.initialized = false;
    this.db = null;
    this.ensureLocalVault();
    this.initFirebase();
  }

  initFirebase() {
    try {
      const apps = getApps();
      let app = null;
      let serviceAccount = null;

      if (process.env.FIREBASE_SERVICE_ACCOUNT) {
        try {
          serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        } catch {}
      }

      if (!serviceAccount) {
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
        this.db = getFirestore(app);
        this.initialized = true;
        console.log(`[FIREBASE] Initialized Firebase Cloud Sync (Project: ${PROJECT_ID})`);
      } else {
        console.log(`[DATABASE VAULT] Active with local persistent storage (sessions_vault.json).`);
      }
    } catch (err) {
      console.log(`[FIREBASE] Note on cloud init (${err.message}). Local Database Vault active.`);
      this.initialized = false;
      this.db = null;
    }
  }

  ensureLocalVault() {
    if (!fs.existsSync(LOCAL_VAULT_FILE)) {
      try {
        fs.writeFileSync(LOCAL_VAULT_FILE, JSON.stringify({ sessions: {}, lastUpdated: new Date().toISOString() }, null, 2));
      } catch {}
    }
  }

  readLocalVault() {
    try {
      if (fs.existsSync(LOCAL_VAULT_FILE)) {
        return JSON.parse(fs.readFileSync(LOCAL_VAULT_FILE, 'utf8'));
      }
    } catch {}
    return { sessions: {}, lastUpdated: new Date().toISOString() };
  }

  writeLocalVault(data) {
    try {
      data.lastUpdated = new Date().toISOString();
      fs.writeFileSync(LOCAL_VAULT_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      console.error('[VAULT] Error writing local vault:', e.message);
    }
  }

  // Upload/Sync a user session folder to Local DB Vault + Firebase Cloud
  async saveSessionToCloud(phone, sessionDir, approvalStatus = null, ownerId = null) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone) return false;

    try {
      if (!fs.existsSync(sessionDir)) return false;
      const files = fs.readdirSync(sessionDir);
      if (files.length === 0) return false;

      const sessionData = {};
      for (const file of files) {
        const filePath = path.join(sessionDir, file);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          sessionData[file.replace(/\./g, '_dot_')] = content;
        } catch {}
      }

      // Read user name from creds.json
      let userName = '';
      try {
        const creds = JSON.parse(fs.readFileSync(path.join(sessionDir, 'creds.json'), 'utf8'));
        userName = creds.me?.name || creds.pushName || '';
      } catch {}

      // 1. Save to Local Vault Database (Persistent JSON)
      const vault = this.readLocalVault();
      const existingSession = vault.sessions[cleanPhone];
      let finalApprovalStatus = approvalStatus;
      if (!finalApprovalStatus) {
        if (existingSession) {
          finalApprovalStatus = existingSession.approvalStatus || 'approved';
        } else {
          finalApprovalStatus = 'pending';
        }
      }

      vault.sessions[cleanPhone] = {
        phone: cleanPhone,
        name: userName,
        savedAt: new Date().toISOString(),
        fileCount: files.length,
        approvalStatus: finalApprovalStatus,
        serverUrl: existingSession?.serverUrl || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://bot-z47t.onrender.com',
        authFiles: sessionData
      };
      this.writeLocalVault(vault);
      console.log(`[DATABASE VAULT] Saved session credentials for +${cleanPhone}`);

      // 2. Upload to Firebase Cloud Firestore if active
      if (this.initialized && this.db) {
        try {
          const sessionDocRef = this.db.collection('sessions').doc(cleanPhone);
          await sessionDocRef.set({
            phone: cleanPhone,
            name: userName,
            updatedAt: FieldValue.serverTimestamp(),
            fileCount: files.length,
            authFiles: sessionData
          }, { merge: true });

          const botDocRef = this.db.collection('bots').doc(cleanPhone);
          const botData = {
            phone: cleanPhone,
            name: userName,
            status: 'active',
            approvalStatus: finalApprovalStatus,
            serverUrl: existingSession?.serverUrl || process.env.RENDER_EXTERNAL_URL || process.env.APP_URL || 'https://bot-z47t.onrender.com',
            lastSync: FieldValue.serverTimestamp()
          };
          if (ownerId) {
            botData.ownerId = ownerId;
          }
          await botDocRef.set(botData, { merge: true });

          console.log(`[FIREBASE] Successfully backed up session for +${cleanPhone} to Cloud`);
        } catch (fbErr) {
          console.log(`[FIREBASE Sync Note] +${cleanPhone}: ${fbErr.message}`);
        }
      }

      return true;
    } catch (err) {
      console.error(`[SESSION SAVE ERROR] +${cleanPhone}:`, err.message);
      return false;
    }
  }

  // Restore sessions from Local Vault and Firebase Cloud on server boot
  async restoreSessionsFromCloud(targetDir) {
    const restoredPhones = new Set();

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Restore from Local Vault Database
    try {
      const vault = this.readLocalVault();
      if (vault.sessions) {
        for (const [phone, data] of Object.entries(vault.sessions)) {
          const userDir = path.join(targetDir, phone);
          if (!fs.existsSync(userDir) || !fs.existsSync(path.join(userDir, 'creds.json'))) {
            fs.mkdirSync(userDir, { recursive: true });
            if (data.authFiles) {
              for (const [key, content] of Object.entries(data.authFiles)) {
                const originalFilename = key.replace(/_dot_/g, '.');
                fs.writeFileSync(path.join(userDir, originalFilename), content, 'utf8');
              }
              console.log(`[DATABASE VAULT] Restored session from vault: +${phone}`);
              restoredPhones.add(phone);
            }
          }
        }
      }
    } catch (vErr) {
      console.log(`[VAULT Restore Note]:`, vErr.message);
    }

    // 2. Restore from Firebase Firestore Cloud if initialized
    if (this.initialized && this.db) {
      try {
        const vault = this.readLocalVault();
        if (!vault.sessions) vault.sessions = {};

        const snapshot = await this.db.collection('sessions').get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const phone = data.phone || doc.id;
          const userDir = path.join(targetDir, phone);

          if (!fs.existsSync(userDir) || !fs.existsSync(path.join(userDir, 'creds.json'))) {
            fs.mkdirSync(userDir, { recursive: true });
            if (data.authFiles) {
              for (const [key, content] of Object.entries(data.authFiles)) {
                const originalFilename = key.replace(/_dot_/g, '.');
                fs.writeFileSync(path.join(userDir, originalFilename), content, 'utf8');
              }
              console.log(`[FIREBASE] Restored cloud session to local: +${phone}`);
              restoredPhones.add(phone);

              // Rebuild the basic vault entry
              if (!vault.sessions[phone]) {
                vault.sessions[phone] = {
                  phone: phone,
                  name: data.name || '',
                  savedAt: new Date().toISOString(),
                  fileCount: data.fileCount || 0,
                  approvalStatus: 'pending', // default, will overwrite below
                  authFiles: data.authFiles
                };
              }
            }
          }
        }

        // Fetch approval status from 'bots' collection to ensure approved bots auto-start
        const botsSnapshot = await this.db.collection('bots').get();
        for (const doc of botsSnapshot.docs) {
          const botData = doc.data();
          const phone = botData.phone || doc.id;
          if (vault.sessions[phone] && botData.approvalStatus) {
            vault.sessions[phone].approvalStatus = botData.approvalStatus;
          }
        }

        this.writeLocalVault(vault);

      } catch (err) {
        console.log(`[FIREBASE] Cloud restore note:`, err.message);
      }
    }

    return Array.from(restoredPhones);
  }

  // Delete session from Local Vault & Firebase
  async deleteSessionFromCloud(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');

    // Remove from Local Vault
    try {
      const vault = this.readLocalVault();
      if (vault.sessions && vault.sessions[cleanPhone]) {
        delete vault.sessions[cleanPhone];
        this.writeLocalVault(vault);
        console.log(`[DATABASE VAULT] Deleted session +${cleanPhone}`);
      }
    } catch {}

    // Remove from Firebase
    if (this.initialized && this.db) {
      try {
        await this.db.collection('sessions').doc(cleanPhone).delete();
        await this.db.collection('bots').doc(cleanPhone).delete();
        console.log(`[FIREBASE] Removed +${cleanPhone} from Cloud & Database`);
        return true;
      } catch (err) {
        console.error(`[FIREBASE] Error deleting +${cleanPhone}:`, err.message);
        return false;
      }
    }
    return true;
  }

  // Save Discord user info
  async saveDiscordUser(discordProfile) {
    if (this.initialized && this.db) {
      try {
        const userRef = this.db.collection('users').doc(discordProfile.id);
        await userRef.set({
          id: discordProfile.id,
          username: discordProfile.username,
          avatar: discordProfile.avatar,
          lastLogin: FieldValue.serverTimestamp()
        }, { merge: true });
        return true;
      } catch (err) {
        console.error(`[FIREBASE] Error saving Discord user:`, err.message);
        return false;
      }
    }
    return true;
  }

  // Get all bots linked to a specific Discord user
  async getUserBots(discordId) {
    if (this.initialized && this.db) {
      try {
        const botsSnapshot = await this.db.collection('bots').where('ownerId', '==', discordId).get();
        const bots = [];
        botsSnapshot.forEach(doc => {
          bots.push(doc.data());
        });
        return bots;
      } catch (err) {
        console.error(`[FIREBASE] Error fetching user bots:`, err.message);
        return [];
      }
    }
    return [];
  }
}

const firebaseSync = new FirebaseSyncManager();
export default firebaseSync;
