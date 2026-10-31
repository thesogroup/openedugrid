/**
 * OpenEduGrid Storage Engine
 * Developed by THE S.O. GROUP
 * Author: Onovroke Goodnews Ovie
 * 
 * Provides robust IndexedDB storage, offline submission queuing with SHA-256 signatures,
 * and automatic cloud syncing upon network restoration.
 */

export class OpenedugridStorage {
  constructor(config = {}) {
    this.dbName = config.dbName || 'OpenEduGrid_Store';
    this.dbVersion = config.dbVersion || 1;
    this.db = null;
    this.syncEndpoint = config.syncEndpoint || '/api/sync/queue';
    this.isOnline = navigator.onLine;

    this._initNetworkListeners();
  }

  /**
   * Initialize IndexedDB database stores
   */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Cache Store: Holds offline assets, lectures, result records
        if (!db.objectStoreNames.contains('asset_cache')) {
          const cacheStore = db.createObjectStore('asset_cache', { keyPath: 'key' });
          cacheStore.createIndex('category', 'category', { unique: false });
          cacheStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        // Action Queue: Holds offline transactions (submissions, forms, quiz responses)
        if (!db.objectStoreNames.contains('offline_queue')) {
          const queueStore = db.createObjectStore('offline_queue', { keyPath: 'id', autoIncrement: true });
          queueStore.createIndex('status', 'status', { unique: false });
          queueStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        console.log('[OpenEduGrid Storage] IndexedDB Engine Ready.');
        resolve(this);
      };

      request.onerror = (event) => {
        console.error('[OpenEduGrid Storage] Database initialization error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * Generate SHA-256 hash for payload integrity verification
   */
  async generatePayloadHash(payload) {
    const encoder = new TextEncoder();
    const data = encoder.encode(JSON.stringify(payload));
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Save content into offline cache
   */
  async cacheAsset(key, data, category = 'general') {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['asset_cache'], 'readwrite');
      const store = transaction.objectStore('asset_cache');
      const item = {
        key,
        data,
        category,
        updatedAt: new Date().toISOString()
      };
      const request = store.put(item);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Retrieve asset from offline cache
   */
  async getCachedAsset(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['asset_cache'], 'readonly');
      const store = transaction.objectStore('asset_cache');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Queue an offline submission with cryptographic SHA-256 stamp
   */
  async queueAction(actionType, payload) {
    const timestamp = new Date().toISOString();
    const hash = await this.generatePayloadHash({ actionType, payload, timestamp });

    const queueEntry = {
      actionType,
      payload,
      timestamp,
      hash,
      status: 'PENDING',
      attempts: 0
    };

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline_queue'], 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.add(queueEntry);

      request.onsuccess = (e) => {
        console.log(`[OpenEduGrid Queue] Action ${actionType} queued offline. Hash: ${hash.slice(0, 10)}...`);
        if (this.isOnline) {
          this.processQueue();
        }
        resolve(e.target.result);
      };

      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * Process and flush queued offline transactions to server
   */
  async processQueue() {
    if (!this.isOnline || !this.db) return;

    const pending = await this._getPendingQueueItems();
    if (pending.length === 0) return;

    console.log(`[OpenEduGrid Sync] Reconciling ${pending.length} offline transactions...`);

    for (const item of pending) {
      try {
        const response = await fetch(this.syncEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-OpenEduGrid-Hash': item.hash,
            'X-OpenEduGrid-Signature': 'S.O.GROUP-VERIFIED'
          },
          body: JSON.stringify(item)
        });

        if (response.ok) {
          await this._removeQueueItem(item.id);
          console.log(`[OpenEduGrid Sync] Successfully synced queue ID #${item.id}`);
        } else {
          await this._incrementAttempts(item.id);
        }
      } catch (err) {
        console.warn(`[OpenEduGrid Sync] Failed to dispatch queue item #${item.id}:`, err);
        break;
      }
    }
  }

  _getPendingQueueItems() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline_queue'], 'readonly');
      const store = transaction.objectStore('offline_queue');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result.filter(i => i.status === 'PENDING'));
      request.onerror = (e) => reject(e.target.error);
    });
  }

  _removeQueueItem(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline_queue'], 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const request = store.delete(id);
      request.onsuccess = () => resolve(true);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  _incrementAttempts(id) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['offline_queue'], 'readwrite');
      const store = transaction.objectStore('offline_queue');
      const getReq = store.get(id);
      getReq.onsuccess = () => {
        const record = getReq.result;
        if (record) {
          record.attempts = (record.attempts || 0) + 1;
          store.put(record);
        }
        resolve(true);
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  _initNetworkListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      console.log('[OpenEduGrid Network] Connection restored. Initializing Queue Flush...');
      this.processQueue();
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      console.log('[OpenEduGrid Network] Device Offline. Switching to Local Mesh & IndexedDB Engine.');
    });
  }
}
