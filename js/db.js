const DB_NAME = 'project-atlas-db';
const DB_VERSION = 1;
const STORES = ['tasks', 'notes', 'accomplishments', 'files', 'settings'];
let dbPromise;

function upgrade(db) {
  if (!db.objectStoreNames.contains('tasks')) {
    const store = db.createObjectStore('tasks', { keyPath: 'id' });
    store.createIndex('status', 'status', { unique: false });
    store.createIndex('dueDate', 'dueDate', { unique: false });
    store.createIndex('updatedAt', 'updatedAt', { unique: false });
    store.createIndex('workstreamId', 'workstreamId', { unique: false });
  }
  if (!db.objectStoreNames.contains('notes')) {
    const store = db.createObjectStore('notes', { keyPath: 'id' });
    store.createIndex('type', 'type', { unique: false });
    store.createIndex('updatedAt', 'updatedAt', { unique: false });
    store.createIndex('workstreamId', 'workstreamId', { unique: false });
  }
  if (!db.objectStoreNames.contains('accomplishments')) {
    const store = db.createObjectStore('accomplishments', { keyPath: 'id' });
    store.createIndex('completedAt', 'completedAt', { unique: false });
    store.createIndex('workstreamId', 'workstreamId', { unique: false });
    store.createIndex('goal', 'goal', { unique: false });
  }
  if (!db.objectStoreNames.contains('files')) {
    const store = db.createObjectStore('files', { keyPath: 'id' });
    store.createIndex('createdAt', 'createdAt', { unique: false });
    store.createIndex('noteId', 'noteId', { unique: false });
  }
  if (!db.objectStoreNames.contains('settings')) {
    db.createObjectStore('settings', { keyPath: 'key' });
  }
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => upgrade(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Unable to open Atlas database.'));
    request.onblocked = () => reject(new Error('Atlas database is blocked by another tab. Close other Atlas tabs and reload.'));
  });
  return dbPromise;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database request failed.'));
  });
}

async function withStore(storeName, mode, callback) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    let result;
    try {
      result = callback(store, tx);
    } catch (error) {
      reject(error);
      return;
    }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error || new Error('Database transaction failed.'));
    tx.onabort = () => reject(tx.error || new Error('Database transaction was cancelled.'));
  });
}

export async function getAll(storeName) {
  if (!STORES.includes(storeName)) throw new Error(`Unknown store: ${storeName}`);
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAll());
}

export async function getOne(storeName, id) {
  const db = await openDB();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).get(id));
}

export async function put(storeName, value) {
  await withStore(storeName, 'readwrite', store => store.put(value));
  return value;
}

export async function putMany(storeName, values) {
  await withStore(storeName, 'readwrite', store => {
    values.forEach(value => store.put(value));
  });
  return values;
}

export async function remove(storeName, id) {
  await withStore(storeName, 'readwrite', store => store.delete(id));
}

export async function clearStore(storeName) {
  await withStore(storeName, 'readwrite', store => store.clear());
}

export async function clearAll() {
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    STORES.forEach(name => tx.objectStore(name).clear());
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Unable to clear Atlas data.'));
  });
}

export async function exportDatabase() {
  const output = { version: 1, exportedAt: new Date().toISOString() };
  for (const store of STORES) output[store] = await getAll(store);
  return output;
}

export async function importDatabase(payload, { replace = true } = {}) {
  if (!payload || typeof payload !== 'object') throw new Error('Invalid Atlas backup file.');
  const db = await openDB();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const storeName of STORES) {
      const store = tx.objectStore(storeName);
      if (replace) store.clear();
      const records = Array.isArray(payload[storeName]) ? payload[storeName] : [];
      records.forEach(record => store.put(record));
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('Unable to import Atlas backup.'));
    tx.onabort = () => reject(tx.error || new Error('Atlas import was cancelled.'));
  });
}
