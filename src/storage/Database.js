/**
 * Database — IndexedDB storage wrapper for offline notebook and page persistence.
 * Uses `idb` library for fast, async, promise-based transactions.
 */
import { openDB } from 'idb';

const DB_NAME = 'personalized_notes_db';
const DB_VERSION = 1;

export class Database {
  constructor() {
    this._dbPromise = null;
  }

  async init() {
    if (!this._dbPromise) {
      this._dbPromise = openDB(DB_NAME, DB_VERSION, {
        upgrade(db) {
          // Notebooks store
          if (!db.objectStoreNames.contains('notebooks')) {
            const nbStore = db.createObjectStore('notebooks', { keyPath: 'id' });
            nbStore.createIndex('modifiedAt', 'modifiedAt');
            nbStore.createIndex('isPinned', 'isPinned');
          }

          // Pages store
          if (!db.objectStoreNames.contains('pages')) {
            const pageStore = db.createObjectStore('pages', { keyPath: 'id' });
            pageStore.createIndex('modifiedAt', 'modifiedAt');
          }

          // Settings store
          if (!db.objectStoreNames.contains('settings')) {
            db.createObjectStore('settings', { keyPath: 'key' });
          }

          // Assets store (PDFs, images)
          if (!db.objectStoreNames.contains('assets')) {
            db.createObjectStore('assets', { keyPath: 'id' });
          }
        }
      });
    }
    return this._dbPromise;
  }

  // --- Notebook Operations ---

  async getAllNotebooks() {
    const db = await this.init();
    const list = await db.getAll('notebooks');
    // Sort pinned first, then by modifiedAt desc
    return list.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return (b.modifiedAt || 0) - (a.modifiedAt || 0);
    });
  }

  async getNotebook(id) {
    const db = await this.init();
    return db.get('notebooks', id);
  }

  async saveNotebook(notebookData) {
    const db = await this.init();
    notebookData.modifiedAt = Date.now();
    await db.put('notebooks', notebookData);
    return notebookData;
  }

  async deleteNotebook(id) {
    const db = await this.init();
    const nb = await db.get('notebooks', id);
    if (nb && nb.pageIds) {
      const tx = db.transaction(['notebooks', 'pages'], 'readwrite');
      for (const pageId of nb.pageIds) {
        tx.objectStore('pages').delete(pageId);
      }
      tx.objectStore('notebooks').delete(id);
      await tx.done;
    } else {
      await db.delete('notebooks', id);
    }
  }

  // --- Page Operations ---

  async getPage(id) {
    const db = await this.init();
    return db.get('pages', id);
  }

  async savePage(pageData) {
    const db = await this.init();
    pageData.modifiedAt = Date.now();
    await db.put('pages', pageData);
    return pageData;
  }

  async deletePage(id) {
    const db = await this.init();
    await db.delete('pages', id);
  }

  // --- Settings & Preferences ---

  async getSetting(key, defaultValue = null) {
    const db = await this.init();
    const entry = await db.get('settings', key);
    return entry ? entry.value : defaultValue;
  }

  async setSetting(key, value) {
    const db = await this.init();
    await db.put('settings', { key, value, updatedAt: Date.now() });
  }

  // --- Assets (PDFs / Images) ---

  async saveAsset(id, data, mimeType = '') {
    const db = await this.init();
    await db.put('assets', { id, data, mimeType, createdAt: Date.now() });
  }

  async getAsset(id) {
    const db = await this.init();
    return db.get('assets', id);
  }

  async deleteAsset(id) {
    const db = await this.init();
    await db.delete('assets', id);
  }

  // --- Full Backup & Restore ---

  async exportAllData() {
    const db = await this.init();
    const notebooks = await db.getAll('notebooks');
    const pages = await db.getAll('pages');
    const settings = await db.getAll('settings');
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      notebooks,
      pages,
      settings
    };
  }

  async importAllData(backup) {
    if (!backup || !backup.notebooks || !backup.pages) {
      throw new Error('Invalid backup format');
    }
    const db = await this.init();
    const tx = db.transaction(['notebooks', 'pages', 'settings'], 'readwrite');
    for (const nb of backup.notebooks) {
      tx.objectStore('notebooks').put(nb);
    }
    for (const pg of backup.pages) {
      tx.objectStore('pages').put(pg);
    }
    if (backup.settings) {
      for (const st of backup.settings) {
        tx.objectStore('settings').put(st);
      }
    }
    await tx.done;
  }
}

export const db = new Database();
