/**
 * App — Central orchestrator for Personalized Notes.
 * Coordinates views, canvases, input, history, database, and tools.
 */
import { CanvasManager } from './engine/CanvasManager.js';
import { InputHandler } from './engine/InputHandler.js';
import { StrokeRenderer } from './engine/StrokeRenderer.js';
import { HistoryManager } from './history/HistoryManager.js';
import { Database, db } from './storage/Database.js';
import { Notebook } from './models/Notebook.js';
import { Page } from './models/Page.js';
import { Stroke } from './models/Stroke.js';
import { TemplateRenderer } from './templates/TemplateRenderer.js';
import { TextTool } from './tools/TextTool.js';
import { PdfHandler } from './pdf/PdfHandler.js';

// Tools
import { PenTool } from './tools/PenTool.js';
import { PencilTool } from './tools/PencilTool.js';
import { HighlighterTool } from './tools/HighlighterTool.js';
import { MoveTool } from './tools/MoveTool.js';
import { FillTool } from './tools/FillTool.js';
import { EraserTool } from './tools/EraserTool.js';
import { ShapeTool } from './tools/ShapeTool.js';
import { TableTool } from './tools/TableTool.js';
import { SelectTool } from './tools/SelectTool.js';

// UI
import { Toolbar } from './ui/Toolbar.js';
import { LibraryView } from './ui/LibraryView.js';
import { SettingsModal } from './ui/SettingsModal.js';
import { Toast } from './ui/Toast.js';
import { Dialog } from './ui/Dialog.js';

export class App {
  constructor() {
    this.rootEl = document.getElementById('app');
    this.currentView = 'library'; // 'library' | 'editor'
    
    // Core engine
    this.canvasManager = null;
    this.inputHandler = null;
    this.history = new HistoryManager(this);
    
    // State
    this.currentNotebook = null;
    this.currentPage = null;
    this.activeTool = null;
    
    // Tool settings defaults
    this.toolOptions = {
      pen: { color: '#e8e8f0', size: 3, opacity: 1 },
      pencil: { color: '#e8e8f0', size: 2.5, opacity: 0.8 },
      highlighter: { color: '#fbbf24', size: 24, opacity: 0.35 },
      move: {},
      fill: { color: '#6366f1', opacity: 1 },
      eraser: { size: 28 },
      shape: { color: '#6c63ff', fillColor: 'transparent', size: 3, opacity: 1, snap: true, fill: false },
      table: {},
      select: {},
      text: { color: '#e8e8f0', fontSize: 18 }
    };

    // UI instances
    this.libraryView = new LibraryView(this);
    this.toolbar = new Toolbar(this);
    this._imageCache = new Map();
    this.gestures = {
      twoFingerTap: 'quick-panel',
      threeFingerSlide: 'eraser',
      threeFingerTap: 'undo'
    };
    this.shapeRecognition = {
      enabled: true,
      delay: 'medium', // 'short' (350ms), 'medium' (500ms), 'long' (750ms)
      mode: 'preview' // 'preview' (preview before confirmation) | 'auto' (replace immediately)
    };

    // Save debouncer
    this._saveTimeout = null;
    this._isSaving = false;
  }

  async init() {
    // 0. Setup Global Human-Friendly Error Handlers
    window.addEventListener('error', (e) => {
      console.error('Application error:', e.error || e.message);
      if (e.message && !e.message.includes('ResizeObserver')) {
        Toast.error('Something unexpected occurred, but your work is safely saved.');
      }
    });

    window.addEventListener('unhandledrejection', (e) => {
      console.error('Unhandled rejection:', e.reason);
      Toast.error('Unable to complete the action. Your notes remain saved.');
    });

    // 1. Initialize DB
    await db.init();

    // 2. Load theme & settings
    const theme = await db.getSetting('theme', 'dark');
    this.setTheme(theme);

    const savedToolOptions = await db.getSetting('toolOptions');
    if (savedToolOptions) {
      this.toolOptions = { ...this.toolOptions, ...savedToolOptions };
    }

    const savedGestures = await db.getSetting('gestures');
    if (savedGestures) {
      this.gestures = { ...this.gestures, ...savedGestures };
    }

    const savedShapeRec = await db.getSetting('shapeRecognition');
    if (savedShapeRec) {
      this.shapeRecognition = { ...this.shapeRecognition, ...savedShapeRec };
    }

    // 3. Seed welcome notebook if clean install
    const notebooks = await db.getAllNotebooks();
    if (notebooks.length === 0) {
      await this._seedWelcomeNotebook();
    }

    // 4. Setup keyboard shortcuts
    this._bindKeyboardShortcuts();

    // 5. Open library view
    await this.showLibrary();
  }

  // --- Views ---

  async showLibrary() {
    this.currentView = 'library';
    if (this.canvasManager) {
      this.canvasManager.destroy();
      this.canvasManager = null;
      this.inputHandler = null;
    }
    this.currentNotebook = null;
    this.currentPage = null;

    this.rootEl.innerHTML = '';
    await this.libraryView.render(this.rootEl);
    const container = this.rootEl.querySelector('.library-container');
    if (container) {
      container.classList.add('library-enter-anim');
    }
  }

  async closeNotebook() {
    if (this._pasteHandler) {
      window.removeEventListener('paste', this._pasteHandler);
      this._pasteHandler = null;
    }
    if (this.currentNotebook && this.currentPage) {
      if (this.currentNotebook.currentPageIndex === 0) {
        const thumb = this.generatePageThumbnail(this.currentPage);
        if (thumb) {
          this.currentNotebook.thumbnailDataUrl = thumb;
        }
      }
    }
    await this.saveImmediately();
    await this.showLibrary();
  }

  async openNotebook(notebookId) {
    const nbData = await db.getNotebook(notebookId);
    if (!nbData) return;

    this.currentNotebook = Notebook.fromJSON(nbData);
    this.currentView = 'editor';

    // Ensure valid pageIds
    if (!this.currentNotebook.pageIds || this.currentNotebook.pageIds.length === 0) {
      const firstPage = new Page({
        pageSize: this.currentNotebook.pageSize,
        template: this.currentNotebook.template,
        bgColor: this.currentNotebook.bgColor || '#ffffff'
      });
      await db.savePage(firstPage.toJSON());
      this.currentNotebook.pageIds = [firstPage.id];
      this.currentNotebook.currentPageIndex = 0;
      await db.saveNotebook(this.currentNotebook.toJSON());
    }

    const curIdx = Math.min(
      this.currentNotebook.currentPageIndex || 0,
      this.currentNotebook.pageIds.length - 1
    );
    this.currentNotebook.currentPageIndex = curIdx;

    await this._loadCurrentPage();
    this._mountEditorDOM();
  }

  async createAndOpenNotebook(opts) {
    const nb = new Notebook(opts);
    const page = new Page({
      pageSize: nb.pageSize,
      template: nb.template,
      bgColor: opts.bgColor || '#ffffff'
    });
    await db.savePage(page.toJSON());
    nb.pageIds = [page.id];
    nb.currentPageIndex = 0;
    await db.saveNotebook(nb.toJSON());
    await this.openNotebook(nb.id);
  }

  // --- Editor Setup ---

  _mountEditorDOM() {
    this.rootEl.innerHTML = `
      <div class="editor editor-enter-anim">
        <header class="editor-navbar" id="app-navbar"></header>
        <div class="editor-toolbar" id="app-toolbar"></div>
        <div class="canvas-container" id="app-canvas-container"></div>
      </div>
    `;

    const container = document.getElementById('app-canvas-container');
    const navbarEl = document.getElementById('app-navbar');
    const toolbarEl = document.getElementById('app-toolbar');

    // 1. Initialize multi-canvas manager
    this.canvasManager = new CanvasManager(container);
    this.canvasManager.setPageSize(this.currentPage.width, this.currentPage.height);
    this.canvasManager.centerPage();

    // 2. Initialize tools
    this.tools = {
      pen: new PenTool(this),
      pencil: new PencilTool(this),
      highlighter: new HighlighterTool(this),
      move: new MoveTool(this),
      fill: new FillTool(this),
      eraser: new EraserTool(this),
      shape: new ShapeTool(this),
      table: new TableTool(this),
      select: new SelectTool(this),
      text: new TextTool(this)
    };
    this.activeTool = this.tools.pen;
    if (this.canvasManager) {
      this.canvasManager.eventCanvas.style.cursor = this.activeTool.cursor || 'crosshair';
    }

    // 3. Initialize input handler
    this.inputHandler = new InputHandler(this.canvasManager, this);

    // 4. Mount toolbar
    this.toolbar.mount(navbarEl, toolbarEl);

    // 5. Wire history events
    this.history.clear();
    this.history.onChange((canUndo, canRedo) => {
      this.toolbar.updateUndoRedo(canUndo, canRedo);
    });

    // 6. Handle canvas resize
    this.canvasManager.onResize = () => {
      this.requestRedraw();
    };

    // 7. Drag & drop image import
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (files && files.length > 0) {
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            await this.insertImageFromFile(file, e.clientX, e.clientY);
          }
        }
      }
    });

    // 8. Clipboard paste image
    if (this._pasteHandler) {
      window.removeEventListener('paste', this._pasteHandler);
    }
    this._pasteHandler = async (e) => {
      if (this.currentView !== 'editor') return;
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) {
            await this.insertImageFromFile(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', this._pasteHandler);

    // 9. Initial render
    this.requestRedraw();
  }

  // --- Page Management ---

  async _loadCurrentPage() {
    const pid = this.currentNotebook.pageIds[this.currentNotebook.currentPageIndex];
    const pData = await db.getPage(pid);
    if (pData) {
      this.currentPage = Page.fromJSON(pData);
    } else {
      this.currentPage = new Page({
        pageSize: this.currentNotebook.pageSize,
        template: this.currentNotebook.template,
        bgColor: this.currentNotebook.bgColor || '#ffffff'
      });
      await db.savePage(this.currentPage.toJSON());
    }
  }

  async nextPage() {
    if (!this.currentNotebook) return;
    await this.saveImmediately();

    const maxIdx = this.currentNotebook.pageIds.length - 1;
    if (this.currentNotebook.currentPageIndex < maxIdx) {
      this.currentNotebook.currentPageIndex++;
    } else {
      // Add a new page
      const newPage = new Page({
        pageSize: this.currentPage?.pageSize || this.currentNotebook.pageSize,
        template: this.currentPage?.template || this.currentNotebook.template,
        bgColor: this.currentPage?.bgColor || this.currentNotebook.bgColor || '#ffffff'
      });
      await db.savePage(newPage.toJSON());
      this.currentNotebook.pageIds.push(newPage.id);
      this.currentNotebook.currentPageIndex = this.currentNotebook.pageIds.length - 1;
    }

    await db.saveNotebook(this.currentNotebook.toJSON());
    await this._loadCurrentPage();
    this.canvasManager.setPageSize(this.currentPage.width, this.currentPage.height);
    this.history.clear();
    this.toolbar.updatePageInfo(
      this.currentNotebook.currentPageIndex + 1,
      this.currentNotebook.pageIds.length
    );
    this.requestRedraw();
  }

  async prevPage() {
    if (!this.currentNotebook || this.currentNotebook.currentPageIndex <= 0) return;
    await this.saveImmediately();

    this.currentNotebook.currentPageIndex--;
    await db.saveNotebook(this.currentNotebook.toJSON());
    await this._loadCurrentPage();
    this.canvasManager.setPageSize(this.currentPage.width, this.currentPage.height);
    this.history.clear();
    this.toolbar.updatePageInfo(
      this.currentNotebook.currentPageIndex + 1,
      this.currentNotebook.pageIds.length
    );
    this.requestRedraw();
  }

  clearCurrentPage() {
    if (!this.currentPage) return;
    const oldStrokes = [...this.currentPage.strokes];
    this.currentPage.strokes = [];
    this.history.push({
      type: 'removeStrokes',
      strokes: oldStrokes,
      pageId: this.currentPage.id
    });
    this.redrawContent();
    this.scheduleSave();
  }

  async getAllPagesForNotebook(nb) {
    const pages = [];
    for (const pid of (nb.pageIds || [])) {
      const p = await db.getPage(pid);
      if (p) pages.push(p);
    }
    return pages;
  }

  // --- Rendering ---

  requestRedraw() {
    if (!this.canvasManager || !this.currentPage) return;
    this.redrawBackground();
    this.redrawContent();
    this.canvasManager.clear('ui');
    if (this.toolbar) {
      this.toolbar.updateZoom(this.canvasManager.zoom);
    }
  }

  redrawBackground() {
    if (!this.canvasManager || !this.currentPage) return;
    const ctx = this.canvasManager.getCtx('background');
    this.canvasManager.clear('background');
    this.canvasManager.applyTransform(ctx);
    TemplateRenderer.render(
      ctx,
      this.currentPage,
      this.currentPage.width,
      this.currentPage.height
    );
  }

  redrawContent() {
    if (!this.canvasManager || !this.currentPage) return;
    const ctx = this.canvasManager.getCtx('content');
    this.canvasManager.clear('content');
    this.canvasManager.applyTransform(ctx);

    const hasClip = !this.currentPage.isInfinite;
    if (hasClip) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, this.currentPage.width, this.currentPage.height);
      ctx.clip();
    }

    // 1. Draw images
    if (this.currentPage.images && this.currentPage.images.length > 0) {
      for (const imgData of this.currentPage.images) {
        let img = this._imageCache.get(imgData.id);
        if (!img) {
          img = new Image();
          img.src = imgData.dataUrl;
          img.onload = () => {
            this.requestRedraw();
          };
          this._imageCache.set(imgData.id, img);
        }
        if (img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, imgData.x, imgData.y, imgData.width, imgData.height);
        }
      }
    }

    // 2. Draw strokes
    for (const stroke of this.currentPage.strokes) {
      StrokeRenderer.renderStroke(ctx, stroke);
    }

    // 3. Draw text boxes
    if (this.currentPage.textBoxes) {
      TextTool.renderTextBoxes(ctx, this.currentPage.textBoxes);
    }

    // 4. Draw tables
    if (this.currentPage.tables) {
      TableTool.renderTables(ctx, this.currentPage.tables);
    }

    if (hasClip) {
      ctx.restore();
    }
  }

  async insertImageFromFile(file, screenX = null, screenY = null) {
    if (!this.currentPage || !file) return;
    try {
      const data = await PdfHandler.importImageFromFile(file);
      let docX = 50;
      let docY = 60;

      if (screenX !== null && screenY !== null && this.canvasManager) {
        const docPt = this.canvasManager.screenToDoc(screenX, screenY);
        docX = docPt.x;
        docY = docPt.y;
      } else if (this.canvasManager) {
        const center = this.canvasManager.screenToDoc(this.canvasManager.width / 2, this.canvasManager.height / 2);
        docX = Math.max(20, center.x - 150);
        docY = Math.max(20, center.y - 120);
      }

      // Constrain dimensions to fit page cleanly
      const maxW = Math.min((this.currentPage.width || 794) - 60, 480);
      let w = data.width || 300;
      let h = data.height || 200;
      if (w > maxW) {
        const ratio = maxW / w;
        w = maxW;
        h = h * ratio;
      }

      const imgEntry = {
        id: `img_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        x: Math.round(docX),
        y: Math.round(docY),
        width: Math.round(w),
        height: Math.round(h),
        dataUrl: data.dataUrl
      };

      this.currentPage.images = this.currentPage.images || [];
      this.currentPage.images.push(imgEntry);
      this.currentPage.modifiedAt = Date.now();

      this.redrawContent();
      this.scheduleSave();
    } catch (err) {
      console.error('Image import failed:', err);
      Toast.error('Could not import image. Please make sure the file is a valid picture.');
    }
  }

  generatePageThumbnail(page) {
    if (!page) return null;
    // Show top portion of the page for high-res header & notes preview
    const thumbW = 240;
    const thumbH = 160;
    const pageW = page.width || 794;
    const pageH = page.height || 1123;

    const canvas = document.createElement('canvas');
    canvas.width = thumbW;
    canvas.height = thumbH;
    const ctx = canvas.getContext('2d');

    const scale = thumbW / pageW;
    ctx.scale(scale, scale);

    // 1. Template
    TemplateRenderer.render(ctx, page, pageW, pageH);

    // 2. Images
    if (page.images) {
      for (const imgData of page.images) {
        let img = this._imageCache.get(imgData.id);
        if (!img && imgData.dataUrl) {
          img = new Image();
          img.src = imgData.dataUrl;
          this._imageCache.set(imgData.id, img);
        }
        if (img && img.complete) {
          ctx.drawImage(img, imgData.x, imgData.y, imgData.width, imgData.height);
        }
      }
    }

    // 3. Strokes
    if (page.strokes) {
      for (const stroke of page.strokes) {
        StrokeRenderer.renderStroke(ctx, stroke);
      }
    }

    // 4. Text
    if (page.textBoxes) {
      TextTool.renderTextBoxes(ctx, page.textBoxes);
    }

    // 5. Tables
    if (page.tables) {
      TableTool.renderTables(ctx, page.tables);
    }

    try {
      return canvas.toDataURL('image/jpeg', 0.88);
    } catch (e) {
      return null;
    }
  }

  updateEraserCursor(clientX, clientY) {
    if (!this.canvasManager) return;
    const rect = this.canvasManager.eventCanvas.getBoundingClientRect();
    const docPos = this.canvasManager.screenToDoc(clientX - rect.left, clientY - rect.top);
    const ctx = this.canvasManager.getCtx('ui');
    this.canvasManager.clear('ui');
    this.canvasManager.applyTransform(ctx);
    const size = this.getToolOptions('eraser').size || 28;
    StrokeRenderer.renderEraserCursor(ctx, docPos.x, docPos.y, size);
  }

  // --- Tools & Options ---

  setActiveTool(name) {
    if (this.tools[name]) {
      this.activeTool = this.tools[name];
      if (this.canvasManager) {
        this.canvasManager.eventCanvas.style.cursor = this.activeTool.cursor;
      }
    }
  }

  getToolOptions(name) {
    return this.toolOptions[name] || {};
  }

  setToolOption(toolName, key, value) {
    if (!this.toolOptions[toolName]) this.toolOptions[toolName] = {};
    this.toolOptions[toolName][key] = value;
    db.setSetting('toolOptions', this.toolOptions);
  }

  // --- Zoom Controls ---

  zoomBy(factor) {
    if (!this.canvasManager) return;
    const oldZoom = this.canvasManager.zoom;
    const newZoom = Math.max(0.2, Math.min(6, oldZoom * factor));
    const cx = this.canvasManager.width / 2;
    const cy = this.canvasManager.height / 2;
    this.canvasManager.panX = cx - (cx - this.canvasManager.panX) * (newZoom / oldZoom);
    this.canvasManager.panY = cy - (cy - this.canvasManager.panY) * (newZoom / oldZoom);
    this.canvasManager.zoom = newZoom;
    this.requestRedraw();
  }

  resetZoom() {
    if (!this.canvasManager) return;
    this.canvasManager.centerPage();
    this.requestRedraw();
  }

  fitToWidth() {
    if (!this.canvasManager) return;
    this.canvasManager.fitToWidth();
    this.requestRedraw();
  }

  // --- History (Undo/Redo) ---

  undo() {
    if (this.history.canUndo && this.currentPage) {
      this.history.undo(this.currentPage);
      this.redrawBackground();
      this.redrawContent();
      this.scheduleSave();
    }
  }

  redo() {
    if (this.history.canRedo && this.currentPage) {
      this.history.redo(this.currentPage);
      this.redrawBackground();
      this.redrawContent();
      this.scheduleSave();
    }
  }

  // --- Persistence & Auto-Save ---

  scheduleSave() {
    if (this.toolbar) {
      this.toolbar.updateSaveStatus('saving');
    }
    clearTimeout(this._saveTimeout);
    this._saveTimeout = setTimeout(() => {
      this.saveImmediately();
    }, 500);
  }

  async saveImmediately() {
    if (this._isSaving) return;
    this._isSaving = true;

    try {
      if (this.currentPage) {
        await db.savePage(this.currentPage.toJSON());
        if (this.currentNotebook && this.currentNotebook.currentPageIndex === 0) {
          const thumb = this.generatePageThumbnail(this.currentPage);
          if (thumb) {
            this.currentNotebook.thumbnailDataUrl = thumb;
          }
        }
      }
      if (this.currentNotebook) {
        await db.saveNotebook(this.currentNotebook.toJSON());
      }
      if (this.toolbar) {
        this.toolbar.updateSaveStatus('saved');
      }
    } catch (err) {
      console.error('Save error:', err);
      if (this.toolbar) {
        this.toolbar.updateSaveStatus('error');
      }
    } finally {
      this._isSaving = false;
    }
  }

  // --- Theme ---

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.body.classList.toggle('dark', theme === 'dark');
    db.setSetting('theme', theme);

    if (theme === 'light') {
      if (this.toolOptions.pen.color === '#fafafa' || this.toolOptions.pen.color === '#e8e8f0') {
        this.toolOptions.pen.color = '#18181b';
      }
      if (this.toolOptions.pencil.color === '#fafafa' || this.toolOptions.pencil.color === '#e8e8f0') {
        this.toolOptions.pencil.color = '#27272a';
      }
    } else {
      if (this.toolOptions.pen.color === '#18181b') {
        this.toolOptions.pen.color = '#fafafa';
      }
      if (this.toolOptions.pencil.color === '#27272a') {
        this.toolOptions.pencil.color = '#fafafa';
      }
    }

    if (this.canvasManager) {
      this.requestRedraw();
    }

    if (this.toolbar) {
      this.toolbar.updateThemeButton?.();
    }
  }

  toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark') ||
                   document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    this.setTheme(next);
  }

  openSettingsModal() {
    SettingsModal.show(this);
  }

  // --- Keyboard Shortcuts ---

  _bindKeyboardShortcuts() {
    window.addEventListener('keydown', (e) => {
      // Ignore if typing inside text input or textarea
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const isCtrl = e.ctrlKey || e.metaKey;

      if (isCtrl && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) this.redo();
        else this.undo();
        return;
      }

      if (isCtrl && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }

      if (isCtrl && e.key === '=') {
        e.preventDefault();
        this.zoomBy(1.25);
        return;
      }

      if (isCtrl && e.key === '-') {
        e.preventDefault();
        this.zoomBy(0.8);
        return;
      }

      if (isCtrl && e.key.toLowerCase() === 's') {
        e.preventDefault();
        this.saveImmediately();
        return;
      }

      // Single-key tool shortcuts
      switch (e.key.toLowerCase()) {
        case 'p':
          this.toolbar?.setTool('pen');
          break;
        case 'h':
          this.toolbar?.setTool('highlighter');
          break;
        case 'b':
          this.toolbar?.setTool('brush');
          break;
        case 'e':
          this.toolbar?.setTool('eraser');
          break;
        case 's':
          this.toolbar?.setTool('shape');
          break;
        case 'l':
          this.toolbar?.setTool('select');
          break;
        case 't':
          this.toolbar?.setTool('text');
          break;
        case 'pagedown':
          e.preventDefault();
          this.nextPage();
          break;
        case 'pageup':
          e.preventDefault();
          this.prevPage();
          break;
        case 'escape':
          if (this.currentView === 'editor') {
            this.closeNotebook();
          }
          break;
      }
    });
  }

  // --- Welcome Seed Data ---

  async _seedWelcomeNotebook() {
    const nb = new Notebook({
      name: 'Welcome to Personalized Notes',
      color: '#6c63ff',
      template: 'ruled-std',
      pageSize: 'a4-portrait'
    });

    const page1 = new Page({
      pageSize: 'a4-portrait',
      template: 'ruled-std'
    });

    // Add a welcome text box
    page1.textBoxes.push({
      id: 'tb_welcome',
      x: 100,
      y: 90,
      text: 'Welcome to Personalized Notes\n\nA distraction-free space for your thoughts, sketches, and plans.\n\n• Draw naturally with pen, pencil, and highlighter\n• Hold still after drawing any shape to neaten it into clean geometry\n• Long-press any notebook on the home screen to organize or export\n• Select your favorite pastel color theme and page style anytime',
      fontSize: 18,
      color: '#1a1a2e',
      width: 580,
      height: 180,
      createdAt: Date.now()
    });

    // Add a sample hand-drawn star
    const starStroke = new Stroke({
      tool: 'pen',
      color: '#6c63ff',
      size: 3.5,
      opacity: 1
    });
    const cx = 397, cy = 460, rOut = 60, rIn = 25;
    for (let i = 0; i <= 10; i++) {
      const r = i % 2 === 0 ? rOut : rIn;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      starStroke.addPoint(cx + r * Math.cos(a), cy + r * Math.sin(a), 0.6);
    }
    page1.addStroke(starStroke);

    await db.savePage(page1.toJSON());
    nb.pageIds = [page1.id];
    await db.saveNotebook(nb.toJSON());
  }
}
