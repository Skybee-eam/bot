import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || 'chapters-eam';
const LOCAL_VAULT_FILE = path.join(__dirname, 'sessions_vault.json');

// Single source of truth for "which physical node is this" — used both to label
// bots in the Admin Panel and to decide which node is allowed to auto-start a
// given bot in a multi-node cluster (see assignedServer logic below).
export function detectServerHost() {
  if (process.env.SERVER_NODE_NAME) {
    return { name: process.env.SERVER_NODE_NAME, icon: '🌐', badge: 'custom' };
  }
  if (process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_STATIC_URL) {
    return { name: 'Railway', icon: '🚂', badge: 'railway' };
  }
  if (process.env.BACK4APP || process.env.CONTAINER_NAME) {
    return { name: 'Back4App Containers', icon: '📦', badge: 'back4app' };
  }
  if (process.env.KOYEB_APP_NAME) {
    return { name: 'Koyeb', icon: '⚡', badge: 'koyeb' };
  }
  if (process.env.FLY_APP_NAME) {
    return { name: 'Fly.io', icon: '🎈', badge: 'fly' };
  }
  if (process.env.VERCEL || process.env.VERCEL_URL) {
    return { name: 'Vercel Serverless', icon: '▲', badge: 'vercel' };
  }
  if (process.env.NETLIFY || process.env.NETLIFY_LOCAL) {
    return { name: 'Netlify Cloud', icon: '🔷', badge: 'netlify' };
  }
  if (process.env.RENDER || process.env.RENDER_SERVICE_ID || process.env.RENDER_EXTERNAL_URL) {
    return { name: 'Render Cloud', icon: '🟣', badge: 'render' };
  }
  // No known cloud platform env var matched — this is a local machine (a dev
  // laptop, someone's PC, etc.), NOT a deployed cloud node. This must NEVER
  // default to a cloud platform name (e.g. "Render Cloud"): doing so makes a
  // local run of this app indistinguishable from the real production node in
  // the assignedServer cluster logic below, so both happily auto-start the
  // same bots at once — which is exactly what causes WhatsApp's "conflict"
  // stream errors (code 440) and the Signal session corruption ("Bad MAC")
  // that follows. Use a hostname-derived identity instead, unique per machine.
  return { name: `Local (${os.hostname()})`, icon: '💻', badge: 'local' };
}

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

          const localServerId = detectServerHost().name;
          const botDocRef = this.db.collection('bots').doc(cleanPhone);

          // Read the CURRENT cluster assignment from Firestore (not the local vault,
          // which never persisted this field) so a re-save never silently steals a
          // bot that's rightfully owned by another node in the cluster.
          let currentAssignedServer = null;
          try {
            const existingBotDoc = await botDocRef.get();
            if (existingBotDoc.exists) {
              currentAssignedServer = existingBotDoc.data().assignedServer || null;
            }
          } catch {}

          const botData = {
            phone: cleanPhone,
            name: userName,
            status: 'active',
            approvalStatus: finalApprovalStatus,
            assignedServer: currentAssignedServer || localServerId,
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

  // Fetch phone -> { assignedServer, approvalStatus } for every bot in the cluster.
  // Returns {} when Firestore isn't active, which naturally disables all cluster
  // filtering for single-node / local-vault-only deployments.
  async getBotServerAssignments() {
    const assignments = {};
    if (!this.initialized || !this.db) return assignments;
    try {
      const botsSnapshot = await this.db.collection('bots').get();
      for (const doc of botsSnapshot.docs) {
        const botData = doc.data();
        const phone = botData.phone || doc.id;
        assignments[phone] = {
          assignedServer: botData.assignedServer || null,
          approvalStatus: botData.approvalStatus || null
        };
      }
    } catch (err) {
      console.log(`[FIREBASE] Could not fetch cluster assignments:`, err.message);
    }
    return assignments;
  }

  // Best-effort: record which node owns a bot. Fire-and-forget by design —
  // callers should not block session restore/start on this write succeeding.
  claimServerAssignment(phone, serverId) {
    if (!this.initialized || !this.db) return;
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone) return;
    this.db.collection('bots').doc(cleanPhone).set({
      assignedServer: serverId,
      lastSync: FieldValue.serverTimestamp()
    }, { merge: true }).catch(() => {});
  }

  // Explicitly move a bot to a specific cluster node — an admin action, not
  // automatic housekeeping. Unlike claimServerAssignment (fire-and-forget,
  // used by the restore/backup paths), this awaits the write and throws on
  // failure so the caller can actually tell the admin it didn't work.
  async setServerAssignment(phone, serverId) {
    if (!this.initialized || !this.db) {
      throw new Error('Firebase Cloud is not connected on this node — cannot reassign clusters without it.');
    }
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone) throw new Error('Invalid phone number.');
    if (!serverId || !String(serverId).trim()) throw new Error('A target server name is required.');
    await this.db.collection('bots').doc(cleanPhone).set({
      assignedServer: String(serverId).trim(),
      lastSync: FieldValue.serverTimestamp()
    }, { merge: true });
    return true;
  }

  // Restore sessions from Local Vault and Firebase Cloud on server boot.
  // By default this only restores bots CLUSTER-ASSIGNED to this node (or
  // unassigned/legacy bots, which get claimed for this node) — this is what
  // stops every node in a multi-node cluster from booting up and running a
  // duplicate copy of every other node's bots. Pass `onlyPhone` for a single,
  // explicitly user/admin-requested bot (e.g. "start my bot" from the client
  // dashboard) — that always succeeds and re-assigns the bot to this node,
  // which is the desired failover behavior when the owning node is down.
  async restoreSessionsFromCloud(targetDir, { onlyPhone = null } = {}) {
    const restoredPhones = new Set();
    const localServerId = detectServerHost().name;

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    // 1. Restore from Local Vault Database (always local to this exact node/disk;
    //    no cross-node collision risk since this file only holds what this node
    //    itself has already saved).
    try {
      const vault = this.readLocalVault();
      if (vault.sessions) {
        for (const [phone, data] of Object.entries(vault.sessions)) {
          if (onlyPhone && phone !== onlyPhone) continue;
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

        // Fetch cluster assignments up front so we never write local files for a
        // bot that belongs to a different node in the cluster.
        const assignments = await this.getBotServerAssignments();

        const snapshot = await this.db.collection('sessions').get();
        for (const doc of snapshot.docs) {
          const data = doc.data();
          const phone = data.phone || doc.id;
          if (onlyPhone && phone !== onlyPhone) continue;

          const assignedTo = assignments[phone]?.assignedServer || null;
          if (assignedTo && assignedTo !== localServerId && !onlyPhone) {
            console.log(`[CLUSTER] Skipping +${phone} — assigned to node "${assignedTo}" (this node is "${localServerId}").`);
            continue;
          }

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

          // Claim (or, for an explicit single-bot request, reclaim) this bot for
          // the current node so future boots on other nodes skip it.
          if (assignedTo !== localServerId) {
            this.claimServerAssignment(phone, localServerId);
          }

          if (vault.sessions[phone] && assignments[phone]?.approvalStatus) {
            vault.sessions[phone].approvalStatus = assignments[phone].approvalStatus;
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

  // Get system pairing mode ('instant' | 'approval')
  async getSystemMode() {
    let mode = 'instant'; // default
    try {
      const vault = this.readLocalVault();
      if (vault.systemSettings?.pairingMode) {
        mode = vault.systemSettings.pairingMode;
      }
    } catch {}

    if (this.initialized && this.db) {
      try {
        const doc = await this.db.collection('system_settings').doc('config').get();
        if (doc.exists && doc.data().pairingMode) {
          mode = doc.data().pairingMode;
        }
      } catch {}
    }
    return mode;
  }

  // Set system pairing mode ('instant' | 'approval')
  async setSystemMode(mode) {
    const validMode = mode === 'approval' ? 'approval' : 'instant';
    
    // Save to local vault
    try {
      const vault = this.readLocalVault();
      if (!vault.systemSettings) vault.systemSettings = {};
      vault.systemSettings.pairingMode = validMode;
      this.writeLocalVault(vault);
    } catch {}

    // Save to Firestore
    if (this.initialized && this.db) {
      try {
        await this.db.collection('system_settings').doc('config').set({
          pairingMode: validMode,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[FIREBASE] Updated system pairing mode to: ${validMode}`);
      } catch (err) {
        console.error(`[FIREBASE] Error saving system mode:`, err.message);
      }
    }
    return validMode;
  }

  // Set bot approval status in Firestore and local vault
  async setApprovalStatus(phone, status) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone) return false;

    // Update local vault
    try {
      const vault = this.readLocalVault();
      if (vault.sessions && vault.sessions[cleanPhone]) {
        vault.sessions[cleanPhone].approvalStatus = status;
        this.writeLocalVault(vault);
      }
    } catch {}

    // Update Firestore
    if (this.initialized && this.db) {
      try {
        await this.db.collection('bots').doc(cleanPhone).set({
          approvalStatus: status,
          lastSync: FieldValue.serverTimestamp()
        }, { merge: true });

        await this.db.collection('sessions').doc(cleanPhone).set({
          approvalStatus: status,
          updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
        console.log(`[FIREBASE] Updated +${cleanPhone} approvalStatus to: ${status}`);
        return true;
      } catch (err) {
        console.error(`[FIREBASE] Error updating approvalStatus:`, err.message);
      }
    }
    return true;
  }

  // Delete session from Cloud Firestore and local vault
  async deleteSessionFromCloud(phone) {
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    if (!cleanPhone) return false;

    // 1. Remove from local vault
    try {
      const vault = this.readLocalVault();
      if (vault.sessions && vault.sessions[cleanPhone]) {
        delete vault.sessions[cleanPhone];
        this.writeLocalVault(vault);
        console.log(`[DATABASE VAULT] Deleted session +${cleanPhone} from local vault`);
      }
    } catch (e) {
      console.log('[VAULT Delete Note]:', e.message);
    }

    // 2. Delete from Firebase Firestore
    if (this.initialized && this.db) {
      try {
        await this.db.collection('sessions').doc(cleanPhone).delete();
        await this.db.collection('bots').doc(cleanPhone).delete();
        console.log(`[FIREBASE] Deleted session +${cleanPhone} from Cloud Firestore`);
      } catch (err) {
        console.error(`[FIREBASE] Error deleting session +${cleanPhone}:`, err.message);
      }
    }
    return true;
  }
}

const firebaseSync = new FirebaseSyncManager();
export default firebaseSync;

