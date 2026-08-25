/* Optional cross-device sync.
   Runs only if firebase-config.js is filled in; otherwise the app stays local-only.
   One document per user: users/{uid} = { history: [...], weights: [...], updatedAt }.
   Firestore's own offline cache queues writes made with no signal. */

const V = '10.12.2';
const CDN = `https://www.gstatic.com/firebasejs/${V}/`;
const cfg = window.FIREBASE_CONFIG || {};
const KB = window.KB;

if (!KB) {
  console.warn('[sync] app bridge missing — skipping');
} else if (!cfg.apiKey || !cfg.projectId) {
  KB.status('off');
} else {
  KB.status('connecting');
  boot().catch(err => { console.warn('[sync]', err); KB.status('error'); });
}

async function boot() {
  const [{ initializeApp }, authMod, fsMod] = await Promise.all([
    import(CDN + 'firebase-app.js'),
    import(CDN + 'firebase-auth.js'),
    import(CDN + 'firebase-firestore.js')
  ]);
  const { getAuth, signInAnonymously, onAuthStateChanged } = authMod;
  const { getFirestore, doc, onSnapshot, setDoc, enableIndexedDbPersistence } = fsMod;

  const app = initializeApp(cfg);
  const db = getFirestore(app);
  try { await enableIndexedDbPersistence(db); } catch (e) { /* multi-tab or unsupported — fine */ }

  const auth = getAuth(app);
  const user = await new Promise((resolve, reject) => {
    onAuthStateChanged(auth, u => { if (u) resolve(u); }, reject);
    signInAnonymously(auth).catch(reject);
  });

  const ref = doc(db, 'users', user.uid);

  // Remote → local. Also fires from cache first, so this works offline.
  onSnapshot(ref,
    snap => {
      if (snap.exists()) KB.applyRemote(snap.data());
      else KB.status('ok');
      if (snap.metadata && snap.metadata.fromCache && !navigator.onLine) KB.status('offline');
    },
    err => { console.warn('[sync] snapshot', err); KB.status('error'); }
  );

  // Local → remote.
  KB.onPush(data => { setDoc(ref, data, { merge: true }).catch(() => KB.status('offline')); });

  // Seed the document with whatever this device already has.
  const local = KB.snapshot();
  if ((local.history && local.history.length) || local.weights) {
    setDoc(ref, local, { merge: true }).catch(() => {});
  }

  window.addEventListener('online', () => KB.status('ok'));
  window.addEventListener('offline', () => KB.status('offline'));
}
