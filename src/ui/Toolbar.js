/**
 * Toolbar — Top navigation bar and tool strip built with shadcn/ui components and design tokens.
 */
import { icons } from './icons.js';
import { TEMPLATES, PAGE_BACKGROUNDS, PAGE_SIZES } from '../models/Page.js';
import { PdfHandler } from '../pdf/PdfHandler.js';
import { ColorPicker } from './ColorPicker.js';
import { Dialog } from './Dialog.js';
import { Toast } from './Toast.js';
import { Select } from './Select.js';
import { Menubar } from './Menubar.js';

export class Toolbar {
  constructor(app) {
    this.app = app;
    this.navbarEl = null;
    this.toolbarEl = null;
    this.menubar = null;
    this.activeTool = 'pen';
    this.colorPicker = null;
    this.colorPopoverEl = null;
    this.activeToolPopover = null;
    this.recentColors = ['#fafafa', '#a1a1aa', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
  }

  mount(navbarEl, toolbarEl) {
    this.navbarEl = navbarEl;
    this.toolbarEl = toolbarEl;
    this._renderNavbar();
    this._renderToolbar();
    this._setupColorPickerPopover();
    this._bindEvents();
  }

  _renderNavbar() {
    const nb = this.app.currentNotebook;
    const pageIndex = (nb?.currentPageIndex ?? 0) + 1;
    const pageTotal = nb?.pageIds?.length || 1;
    const zoomPct = Math.round((this.app.canvasManager?.zoom || 1) * 100);

    this.navbarEl.className = 'editor-navbar';
    this.navbarEl.innerHTML = `
      <!-- Back to Library Button -->
      <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-back-btn" title="Back to Library (Esc)">
        ${icons.chevronLeft}
      </button>

      <!-- Notebook Title Input -->
      <input type="text" class="ui-input" id="nav-nb-title" style="width: auto; max-width: 170px; height: 30px; font-weight: 600; padding: 2px 8px;" value="${nb ? nb.name : 'Untitled'}" title="Rename notebook" />

      <div class="ui-separator-v"></div>

      <!-- Menubar Mount Point -->
      <div id="nav-menubar-mount" style="display: flex; align-items: center;"></div>

      <div class="ui-separator-v"></div>

      <!-- Page Navigation -->
      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-prev-page" title="Previous Page (PageUp)" ${pageIndex <= 1 ? 'disabled' : ''}>
          ${icons.chevronLeft}
        </button>
        <span class="ui-badge ui-badge-secondary" id="nav-page-info" style="font-weight: 500;">
          ${pageIndex} / ${pageTotal}
        </span>
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-next-page" title="Next Page (PageDown)">
          ${pageIndex >= pageTotal ? icons.plus : icons.chevronRight}
        </button>
      </div>

      <div class="ui-separator-v"></div>

      <!-- Undo / Redo -->
      <div style="display: flex; align-items: center; gap: 2px;">
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-undo" title="Undo (Ctrl+Z)" ${!this.app.history.canUndo ? 'disabled' : ''}>
          ${icons.undo}
        </button>
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-redo" title="Redo (Ctrl+Y)" ${!this.app.history.canRedo ? 'disabled' : ''}>
          ${icons.redo}
        </button>
      </div>

      <div class="ui-separator-v"></div>

      <!-- Zoom Controls -->
      <div class="ui-toggle-group">
        <button class="ui-toggle" id="nav-zoom-out" title="Zoom Out (Ctrl+-)">${icons.zoomOut}</button>
        <span style="font-size: 11px; font-weight: 500; min-width: 38px; text-align: center; cursor: pointer;" id="nav-zoom-val" title="Click to reset zoom">${zoomPct}%</span>
        <button class="ui-toggle" id="nav-zoom-in" title="Zoom In (Ctrl++)">${icons.zoomIn}</button>
        <button class="ui-toggle" id="nav-zoom-fit" title="Fit to width">${icons.maximize}</button>
      </div>

      <div class="ui-separator-v"></div>

      <!-- Save Status Badge -->
      <span class="ui-badge ui-badge-outline" id="nav-save-badge">
        <span style="width: 6px; height: 6px; border-radius: 50%; background-color: #10b981; display: inline-block;"></span>
        <span id="nav-save-text">Saved</span>
      </span>

      <div style="flex: 1;"></div>

      <!-- Actions -->
      <div style="display: flex; align-items: center; gap: 6px;">
        <button class="ui-btn ui-btn-outline ui-btn-sm" id="nav-template-btn" title="Change Page Template">
          ${icons.grid} <span class="nav-btn-label">Template</span>
        </button>

        <button class="ui-btn ui-btn-outline ui-btn-sm" id="nav-export-btn" title="Export Note">
          ${icons.export} <span class="nav-btn-label">Export</span>
        </button>

        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-theme-btn" title="Toggle Light/Dark Theme">
          ${document.documentElement.getAttribute('data-theme') === 'light' ? icons.moon : icons.sun}
        </button>

        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="nav-settings-btn" title="Settings">
          ${icons.settings}
        </button>
      </div>
    `;

    const mountEl = this.navbarEl.querySelector('#nav-menubar-mount');
    if (mountEl) {
      this.menubar = new Menubar({
        app: this.app,
        menus: [
          {
            trigger: 'File',
            items: [
              {
                label: 'New Page',
                shortcut: 'PgDn',
                icon: icons.plus,
                onClick: () => this.app.addNewPage()
              },
              {
                label: 'Insert Image...',
                icon: icons.image,
                onClick: () => {
                  this.toolbarEl.querySelector('#tb-img-file-input')?.click();
                }
              },
              { separator: true },
              {
                label: 'Page Template...',
                icon: icons.grid,
                onClick: () => this._showTemplateDialog()
              },
              {
                label: 'Export Page as PNG',
                shortcut: '⌘S',
                icon: icons.image,
                onClick: () => {
                  const page = this.app.currentPage;
                  const nb = this.app.currentNotebook;
                  const pIdx = (nb?.currentPageIndex || 0) + 1;
                  PdfHandler.exportPageAsPNG(page, `${nb?.name || 'note'}_page_${pIdx}.png`);
                }
              },
              {
                label: 'Print / Save as PDF...',
                shortcut: '⌘P',
                icon: icons.filePdf,
                onClick: () => {
                  const page = this.app.currentPage;
                  const nb = this.app.currentNotebook;
                  PdfHandler.printPageAsPdf(page, nb?.name || 'Personalized Note');
                }
              },
              {
                label: 'Export Notebook (.pnotes)',
                icon: icons.download,
                onClick: async () => {
                  const nb = this.app.currentNotebook;
                  if (nb) {
                    const pages = await this.app.getAllPagesForNotebook(nb);
                    PdfHandler.exportNotebookAsJSON(nb, pages);
                  }
                }
              },
              { separator: true },
              {
                label: 'Back to Library',
                shortcut: 'Esc',
                icon: icons.chevronLeft,
                onClick: () => this.app.closeNotebook()
              }
            ]
          },
          {
            trigger: 'Edit',
            items: [
              {
                label: 'Undo',
                shortcut: '⌘Z',
                icon: icons.undo,
                disabled: () => !this.app.history.canUndo,
                onClick: () => this.app.undo()
              },
              {
                label: 'Redo',
                shortcut: '⇧⌘Z',
                icon: icons.redo,
                disabled: () => !this.app.history.canRedo,
                onClick: () => this.app.redo()
              },
              { separator: true },
              {
                label: 'Clear Page Strokes',
                icon: icons.trash,
                destructive: true,
                onClick: async () => {
                  const confirmed = await Dialog.confirm({
                    title: 'Clear Page',
                    description: 'Are you sure you want to clear all ink strokes on this page? You can still undo this action.',
                    confirmText: 'Clear Page',
                    cancelText: 'Cancel',
                    isDestructive: true
                  });
                  if (confirmed) {
                    this.app.clearCurrentPage();
                    Toast.info('Page cleared');
                  }
                }
              },
              {
                label: 'Delete Page',
                destructive: true,
                onClick: async () => {
                  const nb = this.app.currentNotebook;
                  if (nb && nb.pageIds.length > 1) {
                    const confirmed = await Dialog.confirm({
                      title: 'Delete Page',
                      description: 'Are you sure you want to delete this page?',
                      confirmText: 'Delete',
                      cancelText: 'Cancel',
                      isDestructive: true
                    });
                    if (confirmed) {
                      this.app.deleteCurrentPage();
                    }
                  } else {
                    Toast.info('Cannot delete the only page');
                  }
                }
              }
            ]
          },
          {
            trigger: 'View',
            items: [
              {
                label: 'Zoom In',
                shortcut: '⌘+',
                icon: icons.zoomIn,
                onClick: () => this.app.canvasManager.zoomIn()
              },
              {
                label: 'Zoom Out',
                shortcut: '⌘-',
                icon: icons.zoomOut,
                onClick: () => this.app.canvasManager.zoomOut()
              },
              {
                label: 'Fit to Width',
                icon: icons.maximize,
                onClick: () => this.app.canvasManager.resetView()
              },
              { separator: true },
              {
                label: 'Toggle Theme',
                icon: icons.sun,
                onClick: () => this.app.toggleTheme()
              },
              {
                label: 'Settings',
                icon: icons.settings,
                onClick: () => this.app.openSettingsModal()
              }
            ]
          },
          {
            trigger: 'Tools',
            items: [
              { label: 'Pen', shortcut: 'P', icon: icons.pen, onClick: () => this.setTool('pen') },
              { label: 'Pencil', icon: icons.pencil, onClick: () => this.setTool('pencil') },
              { label: 'Highlighter', shortcut: 'H', icon: icons.highlighter, onClick: () => this.setTool('highlighter') },
              { label: 'Move Tool', shortcut: 'M', icon: icons.move, onClick: () => this.setTool('move') },
              { label: 'Fill Tool', shortcut: 'F', icon: icons.fill, onClick: () => this.setTool('fill') },
              { label: 'Eraser', shortcut: 'E', icon: icons.eraser, onClick: () => this.setTool('eraser') },
              { label: 'Geometric Shapes', shortcut: 'S', icon: icons.shapes, onClick: () => this.setTool('shape') },
              { label: 'Lasso Select', shortcut: 'L', icon: icons.lasso, onClick: () => this.setTool('select') },
              { label: 'Text Box', shortcut: 'T', icon: icons.type, onClick: () => this.setTool('text') },
              { label: 'Insert Table', icon: icons.table, onClick: () => this.setTool('table') }
            ]
          }
        ]
      });
      mountEl.appendChild(this.menubar.element);
    }
  }

  _renderToolbar() {
    const opts = this.app.getToolOptions(this.activeTool);
    const currentColor = opts.color || '#fafafa';
    const currentSize = opts.size || 3;

    this.toolbarEl.className = 'editor-toolbar';
    this.toolbarEl.innerHTML = `
      <!-- Tool Selection (shadcn Toggle Group) -->
      <div class="ui-toggle-group">
        <button class="ui-toggle ${this.activeTool === 'pen' ? 'active' : ''}" data-tool="pen" data-tooltip="Pen (P)">
          ${icons.pen}
          <span style="position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background-color: ${this.app.toolOptions.pen.color};"></span>
        </button>

        <button class="ui-toggle ${this.activeTool === 'pencil' ? 'active' : ''}" data-tool="pencil" data-tooltip="Pencil">
          ${icons.pencil}
          <span style="position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background-color: ${this.app.toolOptions.pencil.color};"></span>
        </button>

        <button class="ui-toggle ${this.activeTool === 'highlighter' ? 'active' : ''}" data-tool="highlighter" data-tooltip="Highlighter (H)">
          ${icons.highlighter}
          <span style="position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background-color: ${this.app.toolOptions.highlighter.color};"></span>
        </button>

        <button class="ui-toggle ${this.activeTool === 'move' ? 'active' : ''}" data-tool="move" data-tooltip="Move Tool (M) - Drag strokes, text, tables, images">
          ${icons.move}
        </button>

        <button class="ui-toggle ${this.activeTool === 'fill' ? 'active' : ''}" data-tool="fill" data-tooltip="Fill Tool (F) - Fill shape or paper background">
          ${icons.fill}
          <span style="position: absolute; bottom: 2px; right: 2px; width: 6px; height: 6px; border-radius: 50%; background-color: ${this.app.toolOptions.fill?.color || '#6366f1'};"></span>
        </button>

        <button class="ui-toggle ${this.activeTool === 'eraser' ? 'active' : ''}" data-tool="eraser" data-tooltip="Eraser (E)">
          ${icons.eraser}
        </button>

        <button class="ui-toggle ${this.activeTool === 'shape' ? 'active' : ''}" data-tool="shape" data-tooltip="Shapes (S)">
          ${icons.shapes}
        </button>

        <button class="ui-toggle ${this.activeTool === 'table' ? 'active' : ''}" data-tool="table" data-tooltip="Insert Table">
          ${icons.table}
        </button>

        <button class="ui-toggle ${this.activeTool === 'select' ? 'active' : ''}" data-tool="select" data-tooltip="Lasso / Select (L)">
          ${icons.lasso}
        </button>

        <button class="ui-toggle ${this.activeTool === 'text' ? 'active' : ''}" data-tool="text" data-tooltip="Text (T)">
          ${icons.type}
        </button>

        <button class="ui-toggle" id="tb-insert-img-btn" data-tooltip="Import Image">
          ${icons.image}
        </button>
        <input type="file" id="tb-img-file-input" accept="image/*" style="display:none;" />
      </div>

      <div class="ui-separator-v"></div>

      <!-- Color Wheel & Picker Trigger -->
      <button class="ui-btn ui-btn-outline ui-btn-sm" id="tb-color-picker-btn" style="padding: 0 8px; gap: 6px;" title="Open Color Wheel & Palette">
        <span id="tb-active-color-swatch" style="width: 14px; height: 14px; border-radius: 50%; background-color: ${currentColor}; border: 1px solid var(--border);"></span>
        <span style="font-size: 11px; font-weight: 500;">Color</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
      </button>

      <div class="ui-separator-v"></div>

      <!-- Stroke Size Slider -->
      <div style="display: flex; align-items: center; gap: 8px; width: 140px;">
        <input type="range" class="ui-slider" id="tb-size-slider" min="1" max="50" value="${currentSize}" title="Stroke Size" />
        <span style="font-size: 11px; font-weight: 500; min-width: 28px; color: var(--muted-foreground);" id="tb-size-label">${currentSize}px</span>
      </div>

      <!-- Secondary Controls Container -->
      <div id="tb-secondary-controls" style="margin-left: 4px; display: flex; align-items: center;">
        ${this._renderSecondaryControls()}
      </div>
    `;
  }

  _renderSecondaryControls() {
    if (this.activeTool === 'shape') {
      const currentShape = this.app.tools.shape?.shapeType || 'rectangle';
      const shapeList = [
        { id: 'rectangle', label: 'Rectangle', icon: icons.rect },
        { id: 'circle', label: 'Circle', icon: icons.circle },
        { id: 'line', label: 'Line', icon: icons.line },
        { id: 'arrow', label: 'Arrow', icon: icons.arrow },
        { id: 'triangle', label: 'Triangle', icon: icons.triangle },
        { id: 'diamond', label: 'Diamond', icon: icons.diamond },
        { id: 'star', label: 'Star', icon: icons.star },
      ];
      const shapeOpts = this.app.getToolOptions('shape');
      const isFilled = !!shapeOpts.fill;
      const isSnap = shapeOpts.snap !== false;
      return `
        <div class="ui-separator-v"></div>
        <div class="ui-toggle-group">
          ${shapeList.map(s => `
            <button class="ui-toggle ${currentShape === s.id ? 'active' : ''}" data-shape="${s.id}" data-tooltip="${s.label}">
              ${s.icon}
            </button>
          `).join('')}
        </div>
        <div class="ui-separator-v"></div>
        <div class="ui-toggle-group">
          <button class="ui-toggle ${isFilled ? 'active' : ''}" id="tb-shape-fill-btn" data-tooltip="Shape Fill: ${isFilled ? 'On' : 'Off'}">
            ${icons.fill}
          </button>
          <button class="ui-toggle ${isSnap ? 'active' : ''}" id="tb-shape-snap-btn" data-tooltip="Live Snapping: ${isSnap ? 'On' : 'Off'}">
            ${icons.grid}
          </button>
        </div>
      `;
    }

    if (this.activeTool === 'eraser') {
      return `
        <div class="ui-separator-v"></div>
        <button class="ui-btn ui-btn-destructive ui-btn-sm" id="tb-clear-page-btn" title="Clear all strokes on page">
          ${icons.trash} Clear Page
        </button>
      `;
    }

    if (this.activeTool === 'select') {
      const hasSelection = this.app.tools.select?.selectedStrokes?.length > 0;
      if (hasSelection) {
        return `
          <div class="ui-separator-v"></div>
          <div style="display: flex; gap: 4px;">
            <button class="ui-btn ui-btn-secondary ui-btn-sm" id="tb-dup-sel-btn" title="Duplicate selection">
              ${icons.copy} Duplicate
            </button>
            <button class="ui-btn ui-btn-destructive ui-btn-sm" id="tb-del-sel-btn" title="Delete selection">
              ${icons.trash} Delete
            </button>
          </div>
        `;
      }
    }

    return '';
  }

  _setupColorPickerPopover() {
    let popover = document.getElementById('app-color-popover');
    if (!popover) {
      popover = document.createElement('div');
      popover.id = 'app-color-popover';
      popover.className = 'ui-popover';
      popover.style.display = 'none';
      popover.style.top = '92px';
      popover.style.left = '280px';
      document.body.appendChild(popover);
    }
    this.colorPopoverEl = popover;

    const opts = this.app.getToolOptions(this.activeTool);
    this.colorPicker = new ColorPicker({
      initialColor: opts.color || '#fafafa',
      initialOpacity: opts.opacity ?? 1,
      recentColors: this.recentColors,
      onChange: (hex, opacity) => {
        this.app.setToolOption(this.activeTool, 'color', hex);
        this.app.setToolOption(this.activeTool, 'opacity', opacity);
        const swatch = this.toolbarEl.querySelector('#tb-active-color-swatch');
        if (swatch) swatch.style.backgroundColor = hex;
        if (!this.recentColors.includes(hex)) {
          this.recentColors.unshift(hex);
          if (this.recentColors.length > 8) this.recentColors.pop();
        }
      }
    });
    this.colorPicker.mount(this.colorPopoverEl);
  }

  _bindEvents() {
    // Back button
    this.navbarEl.querySelector('#nav-back-btn')?.addEventListener('click', () => {
      this.app.closeNotebook();
    });

    // Title rename
    const titleInput = this.navbarEl.querySelector('#nav-nb-title');
    if (titleInput) {
      titleInput.addEventListener('change', () => {
        if (this.app.currentNotebook) {
          this.app.currentNotebook.name = titleInput.value.trim() || 'Untitled Notebook';
          this.app.scheduleSave();
        }
      });
    }

    // Page navigation
    this.navbarEl.querySelector('#nav-prev-page')?.addEventListener('click', () => {
      this.app.prevPage();
    });
    this.navbarEl.querySelector('#nav-next-page')?.addEventListener('click', () => {
      this.app.nextPage();
    });

    // Undo / Redo
    this.navbarEl.querySelector('#nav-undo')?.addEventListener('click', () => {
      this.app.undo();
    });
    this.navbarEl.querySelector('#nav-redo')?.addEventListener('click', () => {
      this.app.redo();
    });

    // Zoom
    this.navbarEl.querySelector('#nav-zoom-in')?.addEventListener('click', () => {
      this.app.zoomBy(1.25);
    });
    this.navbarEl.querySelector('#nav-zoom-out')?.addEventListener('click', () => {
      this.app.zoomBy(0.8);
    });
    this.navbarEl.querySelector('#nav-zoom-val')?.addEventListener('click', () => {
      this.app.resetZoom();
    });
    this.navbarEl.querySelector('#nav-zoom-fit')?.addEventListener('click', () => {
      this.app.fitToWidth();
    });

    // Template selector
    this.navbarEl.querySelector('#nav-template-btn')?.addEventListener('click', () => {
      this._showTemplateDialog();
    });

    // Export button
    this.navbarEl.querySelector('#nav-export-btn')?.addEventListener('click', (e) => {
      this._showExportMenu(e.clientX, e.clientY);
    });

    // Theme toggle
    this.navbarEl.querySelector('#nav-theme-btn')?.addEventListener('click', () => {
      this.app.toggleTheme();
    });

    // Image import button
    const imgBtn = this.toolbarEl.querySelector('#tb-insert-img-btn');
    const fileInput = this.toolbarEl.querySelector('#tb-img-file-input');
    if (imgBtn && fileInput) {
      imgBtn.addEventListener('click', () => {
        fileInput.value = '';
        fileInput.click();
      });
      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (file) {
          await this.app.insertImageFromFile(file);
        }
      });
    }

    // Settings button
    this.navbarEl.querySelector('#nav-settings-btn')?.addEventListener('click', () => {
      this.app.openSettingsModal();
    });

    // Tool switching with long-press (press and hold) & active click context menu
    this.toolbarEl.querySelectorAll('[data-tool]').forEach(btn => {
      const toolName = btn.getAttribute('data-tool');
      let pressTimer = null;
      let startX = 0;
      let startY = 0;
      let didLongPress = false;

      const clearTimer = () => {
        if (pressTimer) {
          clearTimeout(pressTimer);
          pressTimer = null;
        }
      };

      btn.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        didLongPress = false;
        startX = e.clientX;
        startY = e.clientY;
        clearTimer();

        pressTimer = setTimeout(() => {
          didLongPress = true;
          if (this.activeTool !== toolName) {
            this.setTool(toolName);
          }
          this._showToolContextPopover(toolName, btn);
        }, 340);
      });

      btn.addEventListener('pointermove', (e) => {
        if (pressTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 8) {
          clearTimer();
        }
      });

      btn.addEventListener('pointerup', (e) => {
        if (pressTimer) {
          clearTimer();
          if (!didLongPress) {
            if (this.activeTool === toolName) {
              this._toggleToolContextPopover(toolName, btn);
            } else {
              this.setTool(toolName);
            }
          }
        }
      });

      btn.addEventListener('pointercancel', clearTimer);
      btn.addEventListener('pointerleave', clearTimer);

      btn.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        if (this.activeTool !== toolName) {
          this.setTool(toolName);
        }
        this._showToolContextPopover(toolName, btn);
      });
    });

    // Color picker trigger
    const colorBtn = this.toolbarEl.querySelector('#tb-color-picker-btn');
    if (colorBtn) {
      colorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = this.colorPopoverEl.style.display !== 'none';
        if (isOpen) {
          this.colorPopoverEl.style.display = 'none';
        } else {
          const rect = colorBtn.getBoundingClientRect();
          this.colorPopoverEl.style.left = `${Math.min(window.innerWidth - 280, rect.left)}px`;
          this.colorPopoverEl.style.top = `${rect.bottom + 6}px`;
          this.colorPopoverEl.style.display = 'block';
          const opts = this.app.getToolOptions(this.activeTool);
          this.colorPicker.setColor(opts.color || '#fafafa', opts.opacity ?? 1);
        }
      });
    }

    // Close color picker on outside click
    document.addEventListener('pointerdown', (e) => {
      if (
        this.colorPopoverEl &&
        this.colorPopoverEl.style.display !== 'none' &&
        !this.colorPopoverEl.contains(e.target) &&
        !e.target.closest('#tb-color-picker-btn')
      ) {
        this.colorPopoverEl.style.display = 'none';
      }
    });

    // Stroke size slider
    const sizeSlider = this.toolbarEl.querySelector('#tb-size-slider');
    if (sizeSlider) {
      sizeSlider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        this.toolbarEl.querySelector('#tb-size-label').textContent = `${val}px`;
        this.app.setToolOption(this.activeTool, 'size', val);
      });
    }

    // Shape selectors
    this.toolbarEl.querySelectorAll('[data-shape]').forEach(btn => {
      btn.addEventListener('click', () => {
        const shape = btn.getAttribute('data-shape');
        this.app.tools.shape?.setShapeType(shape);
        this.toolbarEl.querySelectorAll('[data-shape]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Shape fill & snap toggles
    this.toolbarEl.querySelector('#tb-shape-fill-btn')?.addEventListener('click', () => {
      const cur = !!this.app.getToolOptions('shape').fill;
      this.app.setToolOption('shape', 'fill', !cur);
      this.updateSecondaryControls();
    });
    this.toolbarEl.querySelector('#tb-shape-snap-btn')?.addEventListener('click', () => {
      const cur = this.app.getToolOptions('shape').snap !== false;
      this.app.setToolOption('shape', 'snap', !cur);
      this.updateSecondaryControls();
    });

    this.toolbarEl.querySelector('#tb-clear-page-btn')?.addEventListener('click', async () => {
      const confirmed = await Dialog.confirm({
        title: 'Clear Page',
        description: 'Are you sure you want to clear all ink strokes on this page? You can still undo this action.',
        confirmText: 'Clear Page',
        cancelText: 'Cancel',
        isDestructive: true
      });
      if (confirmed) {
        this.app.clearCurrentPage();
        Toast.info('Page cleared');
      }
    });

    // Selection buttons
    this.toolbarEl.querySelector('#tb-dup-sel-btn')?.addEventListener('click', () => {
      this.app.tools.select?.duplicateSelected();
      this.updateSecondaryControls();
    });
    this.toolbarEl.querySelector('#tb-del-sel-btn')?.addEventListener('click', () => {
      this.app.tools.select?.deleteSelected();
      this.updateSecondaryControls();
    });
  }

  setTool(name) {
    this._closeToolContextPopover();
    this.activeTool = name;
    this.app.setActiveTool(name);
    this._renderToolbar();
    this._bindEvents();
  }

  updateThemeButton() {
    const btn = this.navbarEl?.querySelector('#nav-theme-btn');
    if (btn) {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      btn.innerHTML = isLight ? icons.moon : icons.sun;
    }
  }

  updateColorSwatch(hex) {
    const swatch = this.toolbarEl?.querySelector('#tb-active-color-swatch');
    if (swatch) swatch.style.backgroundColor = hex;
  }

  updateUndoRedo(canUndo, canRedo) {
    const undoBtn = this.navbarEl.querySelector('#nav-undo');
    const redoBtn = this.navbarEl.querySelector('#nav-redo');
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
  }

  updateZoom(zoom) {
    const label = this.navbarEl.querySelector('#nav-zoom-val');
    if (label) label.textContent = `${Math.round(zoom * 100)}%`;
  }

  updatePageInfo(current, total) {
    const info = this.navbarEl.querySelector('#nav-page-info');
    if (info) info.textContent = `${current} / ${total}`;

    const prevBtn = this.navbarEl.querySelector('#nav-prev-page');
    if (prevBtn) prevBtn.disabled = current <= 1;

    const nextBtn = this.navbarEl.querySelector('#nav-next-page');
    if (nextBtn) {
      nextBtn.innerHTML = current >= total ? icons.plus : icons.chevronRight;
      nextBtn.title = current >= total ? 'Add New Page' : 'Next Page (PageDown)';
    }
  }

  updateSaveStatus(status) {
    const badge = this.navbarEl.querySelector('#nav-save-badge');
    const text = this.navbarEl.querySelector('#nav-save-text');
    if (!badge || !text) return;
    const dot = badge.querySelector('span');

    if (status === 'saving') {
      text.textContent = 'Saving...';
      if (dot) dot.style.backgroundColor = '#f59e0b';
    } else if (status === 'error') {
      text.textContent = 'Save Error';
      if (dot) dot.style.backgroundColor = '#ef4444';
    } else {
      text.textContent = 'Saved';
      if (dot) dot.style.backgroundColor = '#10b981';
    }
  }

  updateSecondaryControls() {
    const sec = this.toolbarEl.querySelector('#tb-secondary-controls');
    if (sec) {
      sec.innerHTML = this._renderSecondaryControls();
      this._bindEvents();
    }
  }

  _showTemplateDialog() {
    const page = this.app.currentPage;
    if (!page) return;

    document.querySelectorAll('.ui-popover-menu').forEach(m => m.remove());

    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-content" style="max-width: 540px;">
        <div class="ui-dialog-header">
          <div class="ui-dialog-title">Page Settings & Template</div>
          <div class="ui-dialog-description">Customize page background color, canvas format, and paper grid layout.</div>
        </div>

        <div style="max-height: 65vh; overflow-y: auto; display: flex; flex-direction: column; gap: 16px; padding-right: 4px;">
          <!-- Page Format / Size (Standard vs Infinite Canvas) -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: hsl(var(--foreground));">Canvas Format</label>
            <select class="ui-input" id="tpl-size-select" style="cursor: pointer; background-color: hsl(var(--background));">
              ${Object.entries(PAGE_SIZES).map(([key, s]) => `
                <option value="${key}" ${page.pageSize === key ? 'selected' : ''}>${s.label} (${s.width}×${s.height}${key === 'infinite' ? ' • Freeform infinite canvas' : ''})</option>
              `).join('')}
            </select>
          </div>

          <!-- Page Background Color -->
          <div>
            <label style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: hsl(var(--foreground));">
              <span>Paper Background Color</span>
              <span id="tpl-color-name" style="font-size: 11px; color: hsl(var(--muted-foreground)); font-weight: 400;">
                ${PAGE_BACKGROUNDS.find(b => b.color.toLowerCase() === (page.bgColor || '#ffffff').toLowerCase())?.name || 'Custom'}
              </span>
            </label>
            <div style="display: flex; gap: 8px; flex-wrap: wrap;">
              ${PAGE_BACKGROUNDS.map(b => `
                <div class="modal-color-swatch ${(page.bgColor || '#ffffff').toLowerCase() === b.color.toLowerCase() ? 'active' : ''}" 
                     data-color="${b.color}" 
                     data-name="${b.name}"
                     title="${b.name}"
                     style="--swatch-color: ${b.color}; background-color: ${b.color}; border: 1px solid rgba(0,0,0,0.18); width: 28px; height: 28px; border-radius: 50%; cursor: pointer;"></div>
              `).join('')}
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- Paper Template Grid -->
          <div>
            <label style="display: block; font-size: 12px; font-weight: 600; margin-bottom: 6px; color: hsl(var(--foreground));">Paper Template Grid</label>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
              ${Object.entries(TEMPLATES).map(([key, t]) => `
                <div class="ui-card template-opt ${page.template === key ? 'ui-card-selected' : ''}" data-key="${key}" style="padding: 10px 12px; cursor: pointer; border-color: ${page.template === key ? 'hsl(var(--primary))' : 'hsl(var(--border))'}; background-color: ${page.template === key ? 'hsl(var(--accent))' : 'hsl(var(--card))'};">
                  <div style="font-weight: 600; font-size: 12.5px; color: hsl(var(--foreground));">${t.label}</div>
                  <div style="font-size: 11px; color: hsl(var(--muted-foreground));">${t.category}</div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>

        <div class="ui-dialog-footer">
          <button class="ui-btn ui-btn-outline" id="tpl-close-btn">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    Select.enhanceAll(overlay);
    overlay.querySelector('#tpl-close-btn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const sizeSelect = overlay.querySelector('#tpl-size-select');
    sizeSelect?.addEventListener('change', () => {
      page.pageSize = sizeSelect.value;
      this.app.canvasManager.setPageSize(page.width, page.height);
      this.app.requestRedraw();
      this.app.scheduleSave();
    });

    const colorNameEl = overlay.querySelector('#tpl-color-name');
    overlay.querySelectorAll('.modal-color-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        overlay.querySelectorAll('.modal-color-swatch').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
        const color = sw.getAttribute('data-color');
        const name = sw.getAttribute('data-name');
        if (colorNameEl) colorNameEl.textContent = name;
        page.bgColor = color;
        this.app.requestRedraw();
        this.app.scheduleSave();
      });
    });

    overlay.querySelectorAll('.template-opt').forEach(opt => {
      opt.addEventListener('click', () => {
        overlay.querySelectorAll('.template-opt').forEach(o => {
          o.classList.remove('ui-card-selected');
          o.style.borderColor = 'hsl(var(--border))';
          o.style.backgroundColor = 'hsl(var(--card))';
        });
        opt.classList.add('ui-card-selected');
        opt.style.borderColor = 'hsl(var(--primary))';
        opt.style.backgroundColor = 'hsl(var(--accent))';
        const key = opt.getAttribute('data-key');
        page.template = key;
        this.app.requestRedraw();
        this.app.scheduleSave();
      });
    });
  }

  _showExportMenu(x, y) {
    document.querySelectorAll('.ui-popover-menu').forEach(m => m.remove());

    const btn = this.navbarEl.querySelector('#nav-export-btn');
    const rect = btn?.getBoundingClientRect();

    const menu = document.createElement('div');
    menu.className = 'ui-popover ui-popover-menu';
    
    // Bounds-checked fixed anchor directly beneath button
    if (rect) {
      menu.style.position = 'fixed';
      menu.style.top = `${rect.bottom + 6}px`;
      const right = window.innerWidth - rect.right;
      menu.style.right = `${Math.max(12, right)}px`;
      menu.style.left = 'auto';
    } else {
      menu.style.position = 'fixed';
      menu.style.top = '52px';
      menu.style.right = '16px';
    }

    menu.innerHTML = `
      <div class="ui-dropdown-item" data-action="png">${icons.image} <span>Export Page as PNG</span></div>
      <div class="ui-dropdown-item" data-action="print">${icons.filePdf} <span>Print / Save as PDF</span></div>
      <div class="ui-separator-h" style="margin: 4px 0;"></div>
      <div class="ui-dropdown-item" data-action="json">${icons.download} <span>Export Notebook (.pnotes)</span></div>
    `;

    const close = () => {
      menu.remove();
      document.removeEventListener('pointerdown', checkClick);
    };

    const checkClick = (e) => {
      if (!menu.contains(e.target)) close();
    };

    menu.querySelector('[data-action="png"]').addEventListener('click', () => {
      close();
      const page = this.app.currentPage;
      const nb = this.app.currentNotebook;
      const pIdx = (nb?.currentPageIndex || 0) + 1;
      PdfHandler.exportPageAsPNG(page, `${nb?.name || 'note'}_page_${pIdx}.png`);
    });

    menu.querySelector('[data-action="print"]').addEventListener('click', () => {
      close();
      const page = this.app.currentPage;
      const nb = this.app.currentNotebook;
      PdfHandler.printPageAsPdf(page, nb?.name || 'Personalized Note');
    });

    menu.querySelector('[data-action="json"]').addEventListener('click', async () => {
      close();
      const nb = this.app.currentNotebook;
      if (nb) {
        const pages = await this.app.getAllPagesForNotebook(nb);
        PdfHandler.exportNotebookAsJSON(nb, pages);
      }
    });

    document.body.appendChild(menu);
    setTimeout(() => document.addEventListener('pointerdown', checkClick), 10);
  }

  _closeToolContextPopover() {
    if (this.activeToolPopover) {
      this.activeToolPopover.remove();
      this.activeToolPopover = null;
    }
  }

  _toggleToolContextPopover(toolName, anchorBtn) {
    if (this.activeToolPopover && this.activeToolPopover.getAttribute('data-popover-tool') === toolName) {
      this._closeToolContextPopover();
    } else {
      this._showToolContextPopover(toolName, anchorBtn);
    }
  }

  _showToolContextPopover(toolName, anchorBtn) {
    this._closeToolContextPopover();
    if (this.colorPopoverEl) this.colorPopoverEl.style.display = 'none';

    const opts = this.app.getToolOptions(toolName) || {};
    const currentColor = opts.color || '#fafafa';
    const currentSize = opts.size || 3;

    const popover = document.createElement('div');
    popover.className = 'tool-context-popover';
    popover.setAttribute('data-popover-tool', toolName);

    let contentHtml = '';

    if (toolName === 'pen') {
      const penColors = ['#18181b', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#d97706', '#e11d48', '#fafafa'];
      const penSizes = [1, 2, 3, 5, 8, 12];
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.pen} <span>Pen Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Ink Color</span><span style="font-size:10px; color:var(--muted-foreground);">${currentColor}</span></div>
          <div class="tool-swatches-grid">
            ${penColors.map(c => `
              <button class="tool-swatch-btn ${currentColor === c ? 'active' : ''}" data-popover-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Stroke Width</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="1" max="40" value="${currentSize}" style="width: 100%;" />
          <div class="tool-preset-pills">
            ${penSizes.map(s => `
              <div class="tool-preset-pill ${currentSize === s ? 'active' : ''}" data-popover-size="${s}">${s}px</div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (toolName === 'pencil') {
      const pencilColors = ['#1e293b', '#334155', '#475569', '#64748b', '#94a3b8', '#78350f', '#1e3a8a', '#fafafa'];
      const pencilSizes = [1, 2, 3, 5, 8];
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.pencil} <span>Pencil Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Graphite Lead</span><span style="font-size:10px; color:var(--muted-foreground);">${currentColor}</span></div>
          <div class="tool-swatches-grid">
            ${pencilColors.map(c => `
              <button class="tool-swatch-btn ${currentColor === c ? 'active' : ''}" data-popover-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Lead Thickness</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="1" max="25" value="${currentSize}" style="width: 100%;" />
          <div class="tool-preset-pills">
            ${pencilSizes.map(s => `
              <div class="tool-preset-pill ${currentSize === s ? 'active' : ''}" data-popover-size="${s}">${s}px</div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (toolName === 'highlighter') {
      const hlColors = ['#fef08a', '#bbf7d0', '#bae6fd', '#fed7aa', '#fbcfe8', '#e9d5ff'];
      const hlSizes = [12, 18, 24, 32, 42];
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.highlighter} <span>Highlighter Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Translucent Tint</span></div>
          <div class="tool-swatches-grid">
            ${hlColors.map(c => `
              <button class="tool-swatch-btn ${currentColor === c ? 'active' : ''}" data-popover-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Highlight Width</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="8" max="60" value="${currentSize}" style="width: 100%;" />
          <div class="tool-preset-pills">
            ${hlSizes.map(s => `
              <div class="tool-preset-pill ${currentSize === s ? 'active' : ''}" data-popover-size="${s}">${s}px</div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (toolName === 'eraser') {
      const eraserSizes = [8, 16, 24, 40];
      const isPrecision = this.app.tools.eraser?.mode === 'precision';
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.eraser} <span>Eraser Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Eraser Mode</span></div>
          <div class="tool-preset-pills">
            <div class="tool-preset-pill ${!isPrecision ? 'active' : ''}" id="popover-eraser-stroke">Whole Stroke</div>
            <div class="tool-preset-pill ${isPrecision ? 'active' : ''}" id="popover-eraser-prec">Precision</div>
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Eraser Radius</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="4" max="80" value="${currentSize}" style="width: 100%;" />
          <div class="tool-preset-pills">
            ${eraserSizes.map(s => `
              <div class="tool-preset-pill ${currentSize === s ? 'active' : ''}" data-popover-size="${s}">${s}px</div>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section" style="padding-top: 6px; border-top: 1px solid hsl(var(--border) / 0.5);">
          <button class="ui-btn ui-btn-destructive ui-btn-sm" id="popover-clear-page-btn" style="width: 100%; justify-content: center;">
            ${icons.trash} Clear Page
          </button>
        </div>
      `;
    } else if (toolName === 'shape') {
      const currentShape = this.app.tools.shape?.shapeType || 'rectangle';
      const shapeList = [
        { id: 'rectangle', label: 'Rectangle', icon: icons.rect },
        { id: 'circle', label: 'Circle', icon: icons.circle },
        { id: 'line', label: 'Line', icon: icons.line },
        { id: 'arrow', label: 'Arrow', icon: icons.arrow },
        { id: 'triangle', label: 'Triangle', icon: icons.triangle },
        { id: 'diamond', label: 'Diamond', icon: icons.diamond },
        { id: 'star', label: 'Star', icon: icons.star }
      ];
      const isFilled = !!opts.fill;
      const isSnap = opts.snap !== false;
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.shapes} <span>Shape & Geometry</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Geometric Form</span></div>
          <div class="tool-shapes-grid">
            ${shapeList.map(s => `
              <div class="tool-shape-opt ${currentShape === s.id ? 'active' : ''}" data-popover-shape="${s.id}">
                ${s.icon}
                <span>${s.label}</span>
              </div>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Stroke Thickness</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="1" max="30" value="${currentSize}" style="width: 100%;" />
        </div>
        <div class="tool-popover-section" style="display: flex; gap: 8px;">
          <button class="ui-btn ui-btn-outline ui-btn-sm ${isFilled ? 'active' : ''}" id="popover-shape-fill-btn" style="flex: 1; justify-content: center;">
            ${icons.fill} <span>${isFilled ? 'Fill: On' : 'Fill: Off'}</span>
          </button>
          <button class="ui-btn ui-btn-outline ui-btn-sm ${isSnap ? 'active' : ''}" id="popover-shape-snap-btn" style="flex: 1; justify-content: center;">
            ${icons.grid} <span>${isSnap ? 'Snap: On' : 'Snap: Off'}</span>
          </button>
        </div>
      `;
    } else if (toolName === 'fill') {
      const fillColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#fafafa'];
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.fill} <span>Flood Fill Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Fill Color</span><span style="font-size:10px; color:var(--muted-foreground);">${currentColor}</span></div>
          <div class="tool-swatches-grid">
            ${fillColors.map(c => `
              <button class="tool-swatch-btn ${currentColor === c ? 'active' : ''}" data-popover-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Instructions</span></div>
          <p style="font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0; line-height: 1.4;">
            Tap inside any closed shape or blank canvas area to fill with the selected tone.
          </p>
        </div>
      `;
    } else if (toolName === 'text') {
      const textColors = ['#18181b', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#fafafa'];
      const textSizes = [12, 14, 18, 24, 32];
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.type} <span>Text Box Options</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Text Color</span><span style="font-size:10px; color:var(--muted-foreground);">${currentColor}</span></div>
          <div class="tool-swatches-grid">
            ${textColors.map(c => `
              <button class="tool-swatch-btn ${currentColor === c ? 'active' : ''}" data-popover-color="${c}" style="background-color: ${c};" title="${c}"></button>
            `).join('')}
          </div>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Font Size</span><span id="popover-size-val">${currentSize}px</span></div>
          <input type="range" class="ui-slider" id="popover-size-slider" min="10" max="64" value="${currentSize}" style="width: 100%;" />
          <div class="tool-preset-pills">
            ${textSizes.map(s => `
              <div class="tool-preset-pill ${currentSize === s ? 'active' : ''}" data-popover-size="${s}">${s}px</div>
            `).join('')}
          </div>
        </div>
      `;
    } else if (toolName === 'table') {
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.table} <span>Table Dimensions</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <div class="tool-popover-label"><span>Quick Insert Grid</span></div>
          <div class="tool-preset-pills" style="flex-wrap: wrap;">
            <div class="tool-preset-pill" data-popover-table="2x2">2 × 2</div>
            <div class="tool-preset-pill" data-popover-table="3x3">3 × 3</div>
            <div class="tool-preset-pill" data-popover-table="4x3">4 × 3</div>
            <div class="tool-preset-pill" data-popover-table="5x4">5 × 4</div>
          </div>
        </div>
      `;
    } else if (toolName === 'select') {
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.lasso} <span>Lasso Selection</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <p style="font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0 0 8px; line-height: 1.4;">
            Circle strokes or text elements to select, move, scale, or delete them.
          </p>
          <div style="display: flex; gap: 6px;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="popover-sel-dup" style="flex:1;">${icons.copy} Duplicate</button>
            <button class="ui-btn ui-btn-destructive ui-btn-sm" id="popover-sel-del" style="flex:1;">${icons.trash} Delete</button>
          </div>
        </div>
      `;
    } else if (toolName === 'move') {
      contentHtml = `
        <div class="tool-popover-header">
          <div class="tool-popover-title">${icons.move} <span>Canvas Navigation</span></div>
          <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" data-close-popover style="width:20px; height:20px;">${icons.x}</button>
        </div>
        <div class="tool-popover-section">
          <p style="font-size: 11px; color: hsl(var(--muted-foreground)); margin: 0 0 8px; line-height: 1.4;">
            Drag with one finger or mouse to pan across the canvas. Pinch to zoom in or out.
          </p>
          <div style="display: flex; gap: 6px;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="popover-fit-btn" style="flex:1;">Fit to Screen</button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="popover-100-btn" style="flex:1;">100% Zoom</button>
          </div>
        </div>
      `;
    }

    popover.innerHTML = contentHtml;
    document.body.appendChild(popover);
    this.activeToolPopover = popover;

    const rect = anchorBtn.getBoundingClientRect();
    const popoverW = 280;
    let left = Math.max(10, Math.min(window.innerWidth - popoverW - 12, rect.left - 20));
    let top = rect.bottom + 8;
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;

    popover.querySelector('[data-close-popover]')?.addEventListener('click', () => {
      this._closeToolContextPopover();
    });

    popover.querySelectorAll('[data-popover-color]').forEach(btn => {
      btn.addEventListener('click', () => {
        const hex = btn.getAttribute('data-popover-color');
        this.app.setToolOption(toolName, 'color', hex);
        popover.querySelectorAll('[data-popover-color]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const dot = anchorBtn.querySelector('span[style*="border-radius: 50%"]');
        if (dot) dot.style.backgroundColor = hex;
        const mainSwatch = this.toolbarEl.querySelector('#tb-active-color-swatch');
        if (mainSwatch) mainSwatch.style.backgroundColor = hex;
      });
    });

    const slider = popover.querySelector('#popover-size-slider');
    const sizeVal = popover.querySelector('#popover-size-val');
    if (slider) {
      slider.addEventListener('input', (e) => {
        const val = parseInt(e.target.value, 10);
        if (sizeVal) sizeVal.textContent = `${val}px`;
        this.app.setToolOption(toolName, 'size', val);
        const mainSlider = this.toolbarEl.querySelector('#tb-size-slider');
        const mainLabel = this.toolbarEl.querySelector('#tb-size-label');
        if (mainSlider) mainSlider.value = val;
        if (mainLabel) mainLabel.textContent = `${val}px`;
      });
    }

    popover.querySelectorAll('[data-popover-size]').forEach(pill => {
      pill.addEventListener('click', () => {
        const val = parseInt(pill.getAttribute('data-popover-size'), 10);
        if (sizeVal) sizeVal.textContent = `${val}px`;
        if (slider) slider.value = val;
        this.app.setToolOption(toolName, 'size', val);
        popover.querySelectorAll('[data-popover-size]').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        const mainSlider = this.toolbarEl.querySelector('#tb-size-slider');
        const mainLabel = this.toolbarEl.querySelector('#tb-size-label');
        if (mainSlider) mainSlider.value = val;
        if (mainLabel) mainLabel.textContent = `${val}px`;
      });
    });

    popover.querySelectorAll('[data-popover-shape]').forEach(opt => {
      opt.addEventListener('click', () => {
        const sid = opt.getAttribute('data-popover-shape');
        this.app.tools.shape?.setShapeType(sid);
        popover.querySelectorAll('[data-popover-shape]').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        this.updateSecondaryControls();
      });
    });

    popover.querySelector('#popover-shape-fill-btn')?.addEventListener('click', () => {
      const cur = !!this.app.getToolOptions('shape').fill;
      this.app.setToolOption('shape', 'fill', !cur);
      this._showToolContextPopover('shape', anchorBtn);
      this.updateSecondaryControls();
    });
    popover.querySelector('#popover-shape-snap-btn')?.addEventListener('click', () => {
      const cur = this.app.getToolOptions('shape').snap !== false;
      this.app.setToolOption('shape', 'snap', !cur);
      this._showToolContextPopover('shape', anchorBtn);
      this.updateSecondaryControls();
    });

    popover.querySelector('#popover-eraser-stroke')?.addEventListener('click', () => {
      if (this.app.tools.eraser) this.app.tools.eraser.mode = 'stroke';
      this._showToolContextPopover('eraser', anchorBtn);
    });
    popover.querySelector('#popover-eraser-prec')?.addEventListener('click', () => {
      if (this.app.tools.eraser) this.app.tools.eraser.mode = 'precision';
      this._showToolContextPopover('eraser', anchorBtn);
    });
    popover.querySelector('#popover-clear-page-btn')?.addEventListener('click', async () => {
      this._closeToolContextPopover();
      const confirmed = await Dialog.confirm({
        title: 'Clear Page',
        description: 'Are you sure you want to clear all ink strokes on this page? You can still undo this action.',
        confirmText: 'Clear Page',
        cancelText: 'Cancel',
        isDestructive: true
      });
      if (confirmed) {
        this.app.clearCurrentPage();
        Toast.info('Page cleared');
      }
    });

    popover.querySelector('#popover-sel-dup')?.addEventListener('click', () => {
      this.app.tools.select?.duplicateSelected();
      this.updateSecondaryControls();
      this._closeToolContextPopover();
    });
    popover.querySelector('#popover-sel-del')?.addEventListener('click', () => {
      this.app.tools.select?.deleteSelected();
      this.updateSecondaryControls();
      this._closeToolContextPopover();
    });

    popover.querySelector('#popover-fit-btn')?.addEventListener('click', () => {
      this.app.fitToWidth();
      this._closeToolContextPopover();
    });
    popover.querySelector('#popover-100-btn')?.addEventListener('click', () => {
      this.app.resetZoom();
      this._closeToolContextPopover();
    });

    popover.querySelectorAll('[data-popover-table]').forEach(pill => {
      pill.addEventListener('click', () => {
        const [r, c] = pill.getAttribute('data-popover-table').split('x').map(Number);
        this.app.tools.table?.insertTable?.(r, c);
        this._closeToolContextPopover();
      });
    });

    const onDocClick = (e) => {
      if (this.activeToolPopover && !this.activeToolPopover.contains(e.target) && !anchorBtn.contains(e.target)) {
        this._closeToolContextPopover();
        document.removeEventListener('pointerdown', onDocClick);
      }
    };
    setTimeout(() => document.addEventListener('pointerdown', onDocClick), 20);
  }
}
