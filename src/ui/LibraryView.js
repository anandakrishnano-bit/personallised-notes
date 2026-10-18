/**
 * LibraryView — Human-friendly notebook dashboard with modern pastel styling.
 * Supports press-and-hold, full-card color tinting, realistic paper previews,
 * accessible dialog boxes, and responsive grid layouts.
 */
import { icons } from './icons.js';
import { db } from '../storage/Database.js';
import { Notebook, PASTEL_PALETTE, getPastelTheme } from '../models/Notebook.js';
import { Page, TEMPLATES, PAGE_SIZES, PAGE_BACKGROUNDS } from '../models/Page.js';
import { PdfHandler } from '../pdf/PdfHandler.js';
import { Dialog } from './Dialog.js';
import { Toast } from './Toast.js';
import { Select } from './Select.js';

const TEMPLATE_DISPLAY_NAMES = {
  'ruled-std': 'Standard Lined',
  'ruled-narrow': 'Narrow Lined',
  'ruled-wide': 'Wide Lined',
  'grid-5mm': 'Graph Grid',
  'dot-5mm': 'Dot Grid',
  'blank': 'Blank Canvas',
  'cornell': 'Cornell Notes',
  'engineering': 'Engineering Pad',
  'music': 'Music Stave',
  'isometric': 'Isometric 3D'
};

export class LibraryView {
  constructor(app) {
    this.app = app;
    this.container = null;
    this.notebooks = [];
    this.searchQuery = '';
    this.viewMode = 'grid'; // 'grid' | 'list'
    this.activeFilter = 'all'; // 'all' | 'pinned' | 'eng' | 'ruled' | 'grid'
  }

  async render(targetEl) {
    this.container = targetEl;
    await this.refresh();
  }

  async refresh() {
    try {
      this.notebooks = await db.getAllNotebooks();
      this._renderDOM();

      // Auto-generate preview thumbnail for any notebook missing one
      let needsReRender = false;
      for (const nb of this.notebooks) {
        if (!nb.thumbnailDataUrl && nb.pageIds && nb.pageIds.length > 0) {
          try {
            const pageData = await db.getPage(nb.pageIds[0]);
            if (pageData) {
              const page = Page.fromJSON(pageData);
              const thumb = this.app.generatePageThumbnail(page);
              if (thumb) {
                nb.thumbnailDataUrl = thumb;
                await db.saveNotebook(nb);
                needsReRender = true;
              }
            }
          } catch (e) {
            // Ignore individual thumbnail errors
          }
        }
      }
      if (needsReRender) {
        this._renderDOM();
      }
    } catch (err) {
      Toast.error('Could not load notebooks: ' + err.message);
    }
  }

  _renderDOM() {
    let filtered = this.notebooks.filter(nb => {
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        if (!nb.name.toLowerCase().includes(q)) return false;
      }

      if (this.activeFilter === 'pinned') return nb.isPinned;
      if (this.activeFilter === 'eng') return nb.template?.includes('eng');
      if (this.activeFilter === 'ruled') return nb.template?.includes('ruled');
      if (this.activeFilter === 'grid') return nb.template?.includes('grid') || nb.template?.includes('blank') || nb.template?.includes('dot');
      return true;
    });

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const totalCount = this.notebooks.length;
    const pinnedCount = this.notebooks.filter(n => n.isPinned).length;
    const engCount = this.notebooks.filter(n => n.template?.includes('eng')).length;
    const ruledCount = this.notebooks.filter(n => n.template?.includes('ruled')).length;
    const gridCount = this.notebooks.filter(n => n.template?.includes('grid') || n.template?.includes('blank') || n.template?.includes('dot')).length;

    this.container.innerHTML = `
      <div class="home-container">
        <!-- Modern Glassmorphism Header -->
        <header class="home-header">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="home-app-icon" title="Personalized Notes">
              ${icons.notebook}
            </div>
            <div>
              <div style="font-size: 15px; font-weight: 700; letter-spacing: -0.02em; color: hsl(var(--foreground));">Personalized Notes</div>
              <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Digital Studio</div>
            </div>
          </div>

          <!-- Search Input -->
          <div style="flex: 1; max-width: 380px; position: relative;">
            <div style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); pointer-events: none; opacity: 0.55; display: flex; color: hsl(var(--foreground));">
              ${icons.search}
            </div>
            <input type="text" class="ui-input" id="lib-search" placeholder="Search notebooks by title..." value="${this.searchQuery}" style="padding-left: 36px; padding-right: ${this.searchQuery ? '32px' : '14px'}; border-radius: 9999px;" />
            ${this.searchQuery ? `
              <button id="lib-search-clear" title="Clear search" style="position: absolute; right: 10px; top: 50%; transform: translateY(-50%); width: 18px; height: 18px; border-radius: 50%; background-color: hsl(var(--muted)); color: hsl(var(--muted-foreground)); display: flex; align-items: center; justify-content: center; font-size: 10px; cursor: pointer; transition: background-color 0.15s ease;">✕</button>
            ` : ''}
          </div>

          <!-- Actions -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <div class="ui-toggle-group">
              <button class="ui-toggle ${this.viewMode === 'grid' ? 'active' : ''}" id="lib-grid-btn" title="Grid View">
                ${icons.grid}
              </button>
              <button class="ui-toggle ${this.viewMode === 'list' ? 'active' : ''}" id="lib-list-btn" title="List View">
                ${icons.list}
              </button>
            </div>

            <button class="ui-btn ui-btn-ghost ui-btn-icon" id="lib-theme-btn" title="Toggle theme">
              ${isLight ? icons.moon : icons.sun}
            </button>

            <button class="ui-btn ui-btn-ghost ui-btn-icon" id="lib-settings-btn" title="Settings">
              ${icons.settings}
            </button>

            <button class="ui-btn ui-btn-default ui-btn-default-size" id="lib-new-nb-btn" style="box-shadow: 0 2px 10px rgba(168, 159, 202, 0.35);">
              ${icons.plus} New Notebook
            </button>
          </div>
        </header>

        <!-- Main Content -->
        <main class="home-content">
          <!-- Quick Action Bar -->
          <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="lib-quick-note-btn" style="border-radius: 9999px;">
              <span style="color: var(--pastel-slate);">${icons.pen}</span> Quick Note
            </button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="lib-quick-eng-btn" style="border-radius: 9999px;">
              <span style="color: var(--pastel-sage);">${icons.shapes}</span> Engineering Pad
            </button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="lib-import-btn" style="border-radius: 9999px;">
              <span style="color: var(--pastel-lavender);">${icons.upload}</span> Import Notes
            </button>
          </div>

          <!-- Filter Bar with Muted Pastel Chips -->
          <div class="home-filter-bar">
            <div class="pastel-chip ${this.activeFilter === 'all' ? 'active' : ''}" data-filter="all">
              All Notes <span style="opacity: 0.75; font-size: 11px;">(${totalCount})</span>
            </div>
            ${pinnedCount > 0 ? `
              <div class="pastel-chip ${this.activeFilter === 'pinned' ? 'active' : ''}" data-filter="pinned">
                Pinned (${pinnedCount})
              </div>
            ` : ''}
            <div class="pastel-chip ${this.activeFilter === 'eng' ? 'active' : ''}" data-filter="eng">
              Engineering (${engCount})
            </div>
            <div class="pastel-chip ${this.activeFilter === 'ruled' ? 'active' : ''}" data-filter="ruled">
              Lined (${ruledCount})
            </div>
            <div class="pastel-chip ${this.activeFilter === 'grid' ? 'active' : ''}" data-filter="grid">
              Grid & Plain (${gridCount})
            </div>
          </div>

          <!-- Section Header -->
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">
              Notebooks <span class="ui-badge ui-badge-secondary" style="margin-left: 6px;">${filtered.length}</span>
            </div>
          </div>

          <!-- Notebook Grid / List -->
          ${filtered.length === 0 ? `
            <div class="ui-card" style="text-align: center; padding: 56px 20px; border-style: dashed; border-radius: var(--radius-lg);">
              <div class="empty-notebook-icon" style="width: 44px; height: 44px; margin: 0 auto 14px; color: var(--pastel-lavender); display: flex; align-items: center; justify-content: center;">${icons.notebook}</div>
              <div style="font-size: 15px; font-weight: 600; margin-bottom: 4px; color: hsl(var(--foreground));">No notebooks found</div>
              <p style="font-size: 12px; color: hsl(var(--muted-foreground)); margin-bottom: 18px;">Create a new notebook to begin writing.</p>
              <button class="ui-btn ui-btn-default ui-btn-sm" id="lib-empty-new-btn">${icons.plus} Create Notebook</button>
            </div>
          ` : `
            <div class="home-notebooks-grid ${this.viewMode}">
              ${filtered.map((nb, i) => this._renderNotebookCard(nb, i)).join('')}
            </div>
          `}
        </main>
      </div>
    `;

    this._bindEvents();
  }

  _renderNotebookCard(nb, index = 0) {
    const pageCount = nb.pageIds?.length || 1;
    const dateStr = new Date(nb.modifiedAt || nb.createdAt).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric', year: 'numeric'
    });
    const pastel = getPastelTheme(nb.color);
    const templateLabel = TEMPLATE_DISPLAY_NAMES[nb.template] || 'Personal Notes';

    return `
      <div class="ui-card notebook-card-item" data-id="${nb.id}" 
           style="--stagger-i: ${index}; --card-pastel: ${pastel.hex}; --card-pastel-tint: ${pastel.hex}14; --card-pastel-tint-hover: ${pastel.hex}25; --card-border: ${pastel.hex}30; --card-border-hover: ${pastel.hex}65;">
        
        <div class="ui-card-header" style="position: relative; padding: 14px 16px 10px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
            <div class="ui-card-title" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 14px; font-weight: 600;" title="${nb.name}">
              ${nb.name}
            </div>
            <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-action="menu" data-id="${nb.id}" title="Notebook options" style="flex-shrink: 0;">
              ${icons.moreVertical}
            </button>
          </div>
          <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 4px;">
            <div class="ui-card-description" style="font-size: 11.5px; opacity: 0.85;">
              ${dateStr}
            </div>
            <span style="font-size: 11px; color: ${pastel.hex}; font-weight: 500;">
              ${templateLabel}
            </span>
          </div>
        </div>

        ${nb.thumbnailDataUrl ? `
          <div class="notebook-card-preview">
            <img src="${nb.thumbnailDataUrl}" alt="Page preview" />
          </div>
        ` : `
          <div class="notebook-card-preview">
            <div class="notebook-card-paper-preview" style="--paper-accent: ${pastel.hex};">
              <div class="paper-sheet">
                <div class="paper-line red-margin"></div>
                <div class="paper-line"></div>
                <div class="paper-line"></div>
                <div class="paper-line"></div>
                <div class="paper-line"></div>
              </div>
            </div>
          </div>
        `}

        <div class="ui-card-footer" style="padding: 10px 16px;">
          <span class="ui-badge ui-badge-secondary" style="display: inline-flex; align-items: center; gap: 5px; font-size: 11px;">
            ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}
          </span>
          ${nb.isPinned ? `
            <span class="ui-badge" style="color: ${pastel.hex}; border: 1px solid ${pastel.hex}45; background-color: ${pastel.hex}18; font-size: 11px; display: inline-flex; align-items: center; gap: 4px;">
              ${icons.pin} Pinned
            </span>
          ` : ''}
        </div>
      </div>
    `;
  }

  _bindEvents() {
    // Search input
    const searchInput = this.container.querySelector('#lib-search');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value;
        this._renderDOM();
        const input = this.container.querySelector('#lib-search');
        if (input) {
          input.focus();
          input.setSelectionRange(input.value.length, input.value.length);
        }
      });
    }

    this.container.querySelector('#lib-search-clear')?.addEventListener('click', () => {
      this.searchQuery = '';
      this._renderDOM();
    });

    // Filter bar chips
    this.container.querySelectorAll('.pastel-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const filter = chip.getAttribute('data-filter');
        if (this.activeFilter !== filter) {
          this.activeFilter = filter;
          this._renderDOM();
        }
      });
    });

    // Grid / List toggles
    this.container.querySelector('#lib-grid-btn')?.addEventListener('click', () => {
      this.viewMode = 'grid';
      this._renderDOM();
    });
    this.container.querySelector('#lib-list-btn')?.addEventListener('click', () => {
      this.viewMode = 'list';
      this._renderDOM();
    });

    // Theme toggle
    this.container.querySelector('#lib-theme-btn')?.addEventListener('click', () => {
      this.app.toggleTheme();
      this._renderDOM();
    });

    // Settings
    this.container.querySelector('#lib-settings-btn')?.addEventListener('click', () => {
      this.app.openSettingsModal();
    });

    // New Notebook
    this.container.querySelector('#lib-new-nb-btn')?.addEventListener('click', () => {
      this._showCreateNotebookModal();
    });
    this.container.querySelector('#lib-empty-new-btn')?.addEventListener('click', () => {
      this._showCreateNotebookModal();
    });

    // Quick note
    this.container.querySelector('#lib-quick-note-btn')?.addEventListener('click', async () => {
      try {
        await this.app.createAndOpenNotebook({
          name: `Quick Note ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          template: 'ruled-std',
          color: '#A89FCA'
        });
      } catch (err) {
        Toast.error('Could not create quick note: ' + err.message);
      }
    });

    // Quick Engineering Pad
    this.container.querySelector('#lib-quick-eng-btn')?.addEventListener('click', async () => {
      try {
        await this.app.createAndOpenNotebook({
          name: `Engineering Notes ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
          template: 'engineering',
          color: '#8FA89B'
        });
      } catch (err) {
        Toast.error('Could not create engineering pad: ' + err.message);
      }
    });

    // Import notes
    this.container.querySelector('#lib-import-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pnotes,.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            if (data.notebook && data.pages) {
              const nb = Notebook.fromJSON(data.notebook);
              nb.id = `nb_${Date.now()}`;
              const pageIds = [];
              for (const pData of data.pages) {
                const pg = Page.fromJSON(pData);
                pg.id = `p_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
                pageIds.push(pg.id);
                await db.savePage(pg.toJSON());
              }
              nb.pageIds = pageIds;
              await db.saveNotebook(nb.toJSON());
              await this.refresh();
              Toast.success('Notebook imported successfully');
            } else {
              Toast.error('Unrecognized notebook backup format');
            }
          } catch (err) {
            Toast.error('Failed to parse notebook backup: ' + err.message);
          }
        }
      };
      input.click();
    });

    // Card clicks & press-and-hold
    this.container.querySelectorAll('.notebook-card-item').forEach(card => {
      const id = card.getAttribute('data-id');
      this._bindPressAndHold(card, id);
    });
  }

  /**
   * Support tactile press-and-hold (long press) for opening context menu on touch / mouse
   */
  _bindPressAndHold(cardEl, nbId) {
    let holdTimer = null;
    let didHold = false;
    let startX = 0, startY = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('[data-action="menu"]')) return;
      didHold = false;
      startX = e.clientX;
      startY = e.clientY;

      cardEl.classList.add('holding');
      holdTimer = setTimeout(() => {
        didHold = true;
        cardEl.classList.remove('holding');
        if (navigator.vibrate) navigator.vibrate(35);
        this._showNotebookContextMenu(nbId, startX, startY);
      }, 700);
    };

    const cancelHold = () => {
      cardEl.classList.remove('holding');
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };

    const onPointerMove = (e) => {
      if (Math.hypot(e.clientX - startX, e.clientY - startY) > 10) {
        cancelHold();
      }
    };

    cardEl.addEventListener('pointerdown', onPointerDown);
    cardEl.addEventListener('pointermove', onPointerMove);
    cardEl.addEventListener('pointerup', cancelHold);
    cardEl.addEventListener('pointercancel', cancelHold);

    cardEl.addEventListener('click', (e) => {
      if (didHold) {
        didHold = false;
        return;
      }
      const menuBtn = e.target.closest('[data-action="menu"]');
      if (menuBtn) {
        e.stopPropagation();
        this._showNotebookContextMenu(nbId, e.clientX, e.clientY);
      } else {
        this.app.openNotebook(nbId);
      }
    });
  }

  _showCreateNotebookModal() {
    let selectedColor = PASTEL_PALETTE[0].hex;
    let selectedTemplate = 'ruled-std';
    let selectedSize = 'a4-portrait';
    let selectedBgColor = PAGE_BACKGROUNDS[0].color;

    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-content" style="max-width: 460px; width: 92vw;">
        <div class="ui-dialog-header">
          <div class="ui-dialog-title" style="display: flex; align-items: center; gap: 8px;">
            <span style="color: var(--pastel-lavender);">${icons.notebook}</span>
            Create Notebook
          </div>
          <div class="ui-dialog-description">Configure your new digital notebook with refined pastel covers and paper format.</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 14px;">
          <!-- Live Preview Card (whole card tint, no harsh spine, no technical badge) -->
          <div id="modal-live-preview" style="border-radius: var(--radius-md); border: 1px solid ${selectedColor}40; overflow: hidden; background: linear-gradient(155deg, ${selectedColor}18 0%, hsl(var(--card)) 48%); box-shadow: 0 4px 12px rgba(0,0,0,0.06); display: flex; flex-direction: column; transition: all 0.22s ease;">
            <div style="padding: 12px 14px 6px; display: flex; align-items: center; justify-content: space-between;">
              <div id="modal-preview-title" style="font-size: 13.5px; font-weight: 600; color: hsl(var(--foreground));">My Notebook</div>
              <span id="modal-preview-label" style="font-size: 11px; color: ${selectedColor}; font-weight: 500;">
                Standard Lined
              </span>
            </div>
            <div id="modal-preview-cover" style="height: 65px; display: flex; align-items: center; justify-content: center; background: radial-gradient(circle at 50% 50%, ${selectedColor}22 0%, transparent 80%); transition: background 0.25s ease;">
              <span id="modal-preview-icon" style="color: ${selectedColor}; transform: scale(1.15); transition: color 0.22s ease;">${icons.notebook}</span>
            </div>
          </div>

          <!-- Name -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">Title</label>
            <input type="text" class="ui-input" id="modal-nb-name" value="My Notebook" />
          </div>

          <!-- Cover Pastel Color Swatches -->
          <div>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">
              <span>Cover Pastel Color</span>
              <span id="modal-color-name" style="font-size: 11px; color: hsl(var(--muted-foreground)); font-weight: 400;">${PASTEL_PALETTE[0].name}</span>
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${PASTEL_PALETTE.map((p, i) => `
                <div class="modal-color-swatch ${i === 0 ? 'active' : ''}" 
                     data-color="${p.hex}" 
                     data-name="${p.name}"
                     title="${p.name}"
                     style="--swatch-color: ${p.hex}; background-color: ${p.hex};"></div>
              `).join('')}
            </div>
          </div>

          <!-- Page Background Color -->
          <div>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">
              <span>Page Background Color</span>
              <span id="modal-bg-name" style="font-size: 11px; color: hsl(var(--muted-foreground)); font-weight: 400;">Studio White</span>
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${PAGE_BACKGROUNDS.map((b, i) => `
                <div class="modal-bg-swatch ${i === 0 ? 'active' : ''}" 
                     data-color="${b.color}" 
                     data-name="${b.name}"
                     title="${b.name}"
                     style="--swatch-color: ${b.color}; background-color: ${b.color}; border: 1px solid rgba(0,0,0,0.18); width: 24px; height: 24px; border-radius: 50%; cursor: pointer;"></div>
              `).join('')}
            </div>
          </div>

          <!-- Template -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">Paper Style</label>
            <select class="ui-input" id="modal-nb-template" style="cursor: pointer; background-color: hsl(var(--background));">
              <option value="ruled-std" selected>Standard Lined (Everyday Notes)</option>
              <option value="ruled-narrow">Narrow Lined (Compact Handwriting)</option>
              <option value="ruled-wide">Wide Lined (Spacious Lines)</option>
              <option value="grid-5mm">Graph Grid 5mm (Math & Technical)</option>
              <option value="dot-5mm">Dot Grid 5mm (Bullet Journal)</option>
              <option value="blank">Plain Blank Page (Freeform Sketches)</option>
              <option value="cornell">Cornell Study Format (Lectures & Review)</option>
              <option value="engineering">Engineering Computation (Grid with Margin)</option>
              <option value="music">Music Manuscript (Stave Notation)</option>
              <option value="isometric">Isometric 3D Grid (Perspective)</option>
            </select>
          </div>

          <!-- Size -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">Page Format</label>
            <select class="ui-input" id="modal-nb-size" style="cursor: pointer; background-color: hsl(var(--background));">
              <option value="a4-portrait" selected>A4 Portrait (210 × 297 mm)</option>
              <option value="a4-landscape">A4 Landscape (297 × 210 mm)</option>
              <option value="letter-portrait">Letter Portrait (8.5 × 11 in)</option>
              <option value="letter-landscape">Letter Landscape (11 × 8.5 in)</option>
              <option value="infinite">Infinite Canvas (Expands freely as you write)</option>
            </select>
          </div>
        </div>

        <div class="ui-dialog-footer">
          <button class="ui-btn ui-btn-outline" id="modal-cancel-btn">Cancel</button>
          <button class="ui-btn ui-btn-default" id="modal-create-btn" style="box-shadow: 0 2px 10px rgba(168, 159, 202, 0.35);">Create Notebook</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Enhance selection menus with shadcn/ui Select
    Select.enhanceAll(overlay);

    const closeModal = () => {
      Select.closeAll();
      overlay.remove();
    };
    const nameInput = overlay.querySelector('#modal-nb-name');
    const colorNameEl = overlay.querySelector('#modal-color-name');
    const bgNameEl = overlay.querySelector('#modal-bg-name');
    const livePreview = overlay.querySelector('#modal-live-preview');
    const previewTitle = overlay.querySelector('#modal-preview-title');
    const previewLabel = overlay.querySelector('#modal-preview-label');
    const previewCover = overlay.querySelector('#modal-preview-cover');
    const previewIcon = overlay.querySelector('#modal-preview-icon');
    const templateSelect = overlay.querySelector('#modal-nb-template');

    setTimeout(() => {
      nameInput.focus();
      nameInput.select();
    }, 50);

    nameInput.addEventListener('input', () => {
      previewTitle.textContent = nameInput.value.trim() || 'My Notebook';
    });

    templateSelect.addEventListener('change', () => {
      const selectedOption = templateSelect.options[templateSelect.selectedIndex];
      const text = selectedOption.text.split('(')[0].trim();
      previewLabel.textContent = text;
    });

    overlay.querySelectorAll('.modal-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        overlay.querySelectorAll('.modal-color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        selectedColor = sw.getAttribute('data-color');
        const cName = sw.getAttribute('data-name');
        if (colorNameEl) colorNameEl.textContent = cName;

        // Update live preview tint
        if (livePreview) {
          livePreview.style.border = `1px solid ${selectedColor}40`;
          livePreview.style.background = `linear-gradient(155deg, ${selectedColor}18 0%, hsl(var(--card)) 48%)`;
        }
        if (previewCover) {
          previewCover.style.background = `radial-gradient(circle at 50% 50%, ${selectedColor}22 0%, transparent 80%)`;
        }
        if (previewIcon) {
          previewIcon.style.color = selectedColor;
        }
        if (previewLabel) {
          const selectedOption = templateSelect.options[templateSelect.selectedIndex];
          const text = selectedOption.text.split('(')[0].trim();
          previewLabel.style.color = selectedColor;
          previewLabel.textContent = text;
        }
      });
    });

    overlay.querySelectorAll('.modal-bg-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        overlay.querySelectorAll('.modal-bg-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        selectedBgColor = sw.getAttribute('data-color');
        const bName = sw.getAttribute('data-name');
        if (bgNameEl) bgNameEl.textContent = bName;
      });
    });

    overlay.querySelector('#modal-cancel-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });

    overlay.querySelector('#modal-create-btn').addEventListener('click', async () => {
      try {
        const name = nameInput.value.trim() || 'Untitled Notebook';
        selectedTemplate = templateSelect.value;
        selectedSize = overlay.querySelector('#modal-nb-size').value;

        closeModal();
        await this.app.createAndOpenNotebook({
          name,
          color: selectedColor,
          template: selectedTemplate,
          pageSize: selectedSize,
          bgColor: selectedBgColor
        });
      } catch (err) {
        Toast.error('Could not create notebook: ' + err.message);
      }
    });
  }

  _showNotebookContextMenu(nbId, x, y) {
    document.querySelectorAll('.ui-popover-menu').forEach(m => m.remove());

    const nb = this.notebooks.find(n => n.id === nbId);
    if (!nb) return;

    const menu = document.createElement('div');
    menu.className = 'ui-popover ui-popover-menu';
    menu.style.left = `${Math.min(window.innerWidth - 180, Math.max(10, x))}px`;
    menu.style.top = `${Math.min(window.innerHeight - 240, Math.max(10, y))}px`;
    menu.style.minWidth = '170px';
    menu.style.padding = '4px';

    menu.innerHTML = `
      <div class="ui-dropdown-item" data-action="open">${icons.notebook} Open</div>
      <div class="ui-dropdown-item" data-action="rename">${icons.edit} Rename</div>
      <div class="ui-dropdown-item" data-action="pin">${icons.pin} ${nb.isPinned ? 'Unpin' : 'Pin to top'}</div>
      <div class="ui-dropdown-item" data-action="export">${icons.download} Export Backup</div>
      <div class="ui-separator-h" style="margin: 4px 0;"></div>
      <div class="ui-dropdown-item ui-dropdown-item-danger" data-action="delete">${icons.trash} Delete Notebook</div>
    `;

    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', checkClick);
    };

    const checkClick = (e) => {
      if (!menu.contains(e.target)) close();
    };

    menu.querySelector('[data-action="open"]').addEventListener('click', () => {
      close();
      this.app.openNotebook(nbId);
    });

    menu.querySelector('[data-action="rename"]').addEventListener('click', async () => {
      close();
      const newName = await Dialog.prompt({
        title: 'Rename Notebook',
        description: 'Choose a new title for this notebook.',
        label: 'Notebook Title',
        defaultValue: nb.name,
        confirmText: 'Rename'
      });
      if (newName && newName !== nb.name) {
        try {
          nb.name = newName;
          nb.modifiedAt = Date.now();
          await db.saveNotebook(nb);
          await this.refresh();
          Toast.success('Notebook renamed');
        } catch (err) {
          Toast.error('Could not rename notebook: ' + err.message);
        }
      }
    });

    menu.querySelector('[data-action="pin"]').addEventListener('click', async () => {
      close();
      try {
        nb.isPinned = !nb.isPinned;
        await db.saveNotebook(nb);
        await this.refresh();
        Toast.info(nb.isPinned ? 'Notebook pinned' : 'Notebook unpinned');
      } catch (err) {
        Toast.error('Could not update notebook: ' + err.message);
      }
    });

    menu.querySelector('[data-action="export"]').addEventListener('click', async () => {
      close();
      try {
        const pages = [];
        for (const pid of (nb.pageIds || [])) {
          const p = await db.getPage(pid);
          if (p) pages.push(p);
        }
        PdfHandler.exportNotebookAsJSON(nb, pages);
        Toast.success('Notebook exported');
      } catch (err) {
        Toast.error('Could not export notebook: ' + err.message);
      }
    });

    menu.querySelector('[data-action="delete"]').addEventListener('click', async () => {
      close();
      const confirmed = await Dialog.confirm({
        title: 'Delete Notebook',
        description: `Are you sure you want to delete "${nb.name}"? All pages and handwritten notes will be permanently removed.`,
        confirmText: 'Delete',
        cancelText: 'Keep',
        isDestructive: true
      });
      if (confirmed) {
        try {
          await db.deleteNotebook(nbId);
          await this.refresh();
          Toast.info('Notebook deleted');
        } catch (err) {
          Toast.error('Could not delete notebook: ' + err.message);
        }
      }
    });

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('pointerdown', checkClick), 10);
  }
}
