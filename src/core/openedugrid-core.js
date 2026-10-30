import { OpenedugridStorage } from '../storage/OpenedugridStorage.js';
import { OpenedugridP2P } from '../p2p/OpenedugridP2P.js';

export class OpenEduGrid {
  constructor(config = {}) {
    this.config = config;
    this.nodeId = config.nodeId || `student_${Math.random().toString(36).substr(2, 6)}`;
    this.storage = null;
    this.p2p = null;
  }

  async init() {
    console.log(`[OpenEduGrid Core] Initializing node: ${this.nodeId} under THE S.O. GROUP...`);

    // 1. Initialize IndexedDB Storage & Queue
    this.storage = new OpenedugridStorage({
      dbName: this.config.dbName || 'OpenEduGrid_CampusDB',
      syncEndpoint: this.config.syncEndpoint || '/api/sync/queue'
    });
    await this.storage.init();

    // 2. Initialize WebRTC P2P Mesh Engine
    this.p2p = new OpenedugridP2P(this.nodeId, this.storage);

    // 3. Register Service Worker if supported
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        console.log('[OpenEduGrid Core] Service Worker registered successfully:', reg.scope);
      } catch (err) {
        console.warn('[OpenEduGrid Core] Service Worker registration failed:', err);
      }
    }

    console.log('[OpenEduGrid Core] System fully online and operational.');
    return this;
  }

  async submitAssignment(courseCode, studentId, answers) {
    const payload = { courseCode, studentId, answers };
    return await this.storage.queueAction('SUBMIT_ASSIGNMENT', payload);
  }

  broadcastAsset(assetKey, assetData) {
    this.p2p.broadcastMesh('LECTURE_ASSET', { key: assetKey, data: assetData });
  }
}
