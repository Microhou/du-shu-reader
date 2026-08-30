// IndexedDB 键值存储（浏览器端持久化）

const DB_NAME = 'dushu-reader';
const STORE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function withStore(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const idbStorage = {
  get: (key) => withStore('readonly', (store) => store.get(key)),
  set: (key, value) => withStore('readwrite', (store) => store.put(value, key)),
  del: (key) => withStore('readwrite', (store) => store.delete(key)),
};
