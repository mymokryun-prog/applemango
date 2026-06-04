/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface OutboxEntry {
  id: string;
  endpoint: string;
  method: string;
  payload: any;
  timestamp: number;
}

const DB_NAME = 'amang-signal-outbox-db';
const STORE_NAME = 'outbox';
const DB_VERSION = 1;

const openOutboxDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const runTransaction = <T>(mode: IDBTransactionMode, callback: (store: IDBObjectStore) => IDBRequest): Promise<T> => {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openOutboxDB();
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      const request = callback(store);
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    } catch (error) {
      reject(error);
    }
  });
};

export const queueOfflineAction = async (endpoint: string, payload: any, method = 'POST'): Promise<void> => {
  const entry: OutboxEntry = {
    id: `outbox-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    endpoint,
    method,
    payload,
    timestamp: Date.now(),
  };
  await runTransaction('readwrite', (store) => store.add(entry));
};

export const getOutboxCount = async (): Promise<number> => {
  return await runTransaction<number>('readonly', (store) => store.count());
};

export const getAllOutboxEntries = async (): Promise<OutboxEntry[]> => {
  return await new Promise(async (resolve, reject) => {
    try {
      const db = await openOutboxDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result as OutboxEntry[]);
      request.onerror = () => reject(request.error);
    } catch (err) {
      reject(err);
    }
  });
};

export const deleteOutboxEntry = async (id: string): Promise<void> => {
  await runTransaction('readwrite', (store) => store.delete(id));
};

export const syncOutbox = async (): Promise<void> => {
  const entries = await getAllOutboxEntries();
  for (const entry of entries) {
    try {
      const response = await fetch(entry.endpoint, {
        method: entry.method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry.payload),
      });
      if (response.ok) {
        await deleteOutboxEntry(entry.id);
      }
    } catch (err) {
      console.warn('Outbox sync failed, will retry later:', err);
      // keep entry for future sync
    }
  }
};

export const registerBackgroundSync = async (): Promise<void> => {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const registration = await navigator.serviceWorker.ready;
    const registrationAny = registration as unknown as { sync?: { register: (tag: string) => Promise<void> } };
    if (registrationAny.sync && typeof registrationAny.sync.register === 'function') {
      try {
        await registrationAny.sync.register('outbox-sync');
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    }
  }
};

export const requestNotificationPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) {
    return 'denied';
  }
  return await Notification.requestPermission();
};

export const showLocalNotification = async (title: string, options: NotificationOptions = {}): Promise<void> => {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  try {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  } catch (err) {
    new Notification(title, options);
  }
};
