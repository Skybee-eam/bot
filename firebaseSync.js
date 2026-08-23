import fs from 'fs';
import path from 'path';
import admin from 'firebase-admin';

const PROJECT_ID = 'chapters-eam';

class FirebaseSyncManager {
  constructor() {
    this.initialized = false;
    this.db = null;
    this.init();
  }

  init() {
    try {
      const apps = admin.apps || [];
      if (apps.length === 0) {
        // Look for service account json in project root
        let serviceAccount = null;
        const possibleFiles = ['serviceAccountKey.json', 'firebase-service-account.json', 'firebase-credentials.json'];
        for (const f of possibleFiles) {
          if (fs.existsSync(f)) {
            try {
              serviceAccount = JSON.parse(fs.readFileSync(f, 'utf8'));
              break;
            } catch {}
          }
        }

        if (serviceAccount) {
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            projectId: PROJECT_ID
          });
        } else {
          // Initialize with project ID / default application credentials
          admin.initializeApp({
            projectId: PROJECT_ID
          });
        }
      }

      this.db = admin.firestore();
      this.initialized = true;
      console.log(`[FIREBASE] Initialized Firebase Cloud Sync (Project: ${PROJECT_ID})`);
    } catch (err) {
      console.log(`[FIREBASE] Note on cloud init (${err.message}). Local-cloud bridge active.`);
    }
  }

  // Upload/Sync a user session folder to Firestore
  async saveSessionToCloud(phone, sessionDir) {
    if (!this.initialized || !this.db) return false;
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');

    try {
      if (!fs.existsSync(sessionDir)) return false;
      const files = fs.readdirSync(sessionDir);
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

      // 1. Save auth keys bundle to Firestore
      const sessionDocRef = this.db.collection('sessions').doc(cleanPhone);
      await sessionDocRef.set({
        phone: cleanPhone,
        name: userName,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        fileCount: files.length,
        authFiles: sessionData
      }, { merge: true });

      // 2. Update bot metadata document
      const botDocRef = this.db.collection('bots').doc(cleanPhone);
      await botDocRef.set({
        phone: cleanPhone,
        name: userName,
        status: 'active',
        lastSync: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      console.log(`[FIREBASE] Successfully backed up session for +${cleanPhone} to Cloud`);
      return true;
    } catch (err) {
      console.error(`[FIREBASE] Error uploading session for +${cleanPhone}:`, err.message);
      return false;
    }
  }

  // Restore sessions from Firestore down to local sessions directory on server boot
  async restoreSessionsFromCloud(targetDir) {
    if (!this.initialized || !this.db) return [];
    const restoredPhones = [];

    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

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
            restoredPhones.push(phone);
          }
        }
      }
    } catch (err) {
      console.log(`[FIREBASE] Cloud session restore note:`, err.message);
    }

    return restoredPhones;
  }

  // Delete session from Firestore
  async deleteSessionFromCloud(phone) {
    if (!this.initialized || !this.db) return false;
    const cleanPhone = String(phone).replace(/[^0-9]/g, '');
    try {
      await this.db.collection('sessions').doc(cleanPhone).delete();
      await this.db.collection('bots').doc(cleanPhone).delete();
      console.log(`[FIREBASE] Removed +${cleanPhone} from Cloud`);
      return true;
    } catch (err) {
      console.error(`[FIREBASE] Error deleting +${cleanPhone} from Cloud:`, err.message);
      return false;
    }
  }

  // Sync cluster metrics to Firestore
  async syncMetricsToCloud(metrics) {
    if (!this.initialized || !this.db) return false;
    try {
      await this.db.collection('system').doc('metrics').set({
        ...metrics,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return true;
    } catch {
      return false;
    }
  }
}

const firebaseSync = new FirebaseSyncManager();
export default firebaseSync;
