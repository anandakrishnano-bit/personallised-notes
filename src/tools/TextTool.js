/**
 * TextTool — Movable, transparent rich text editor for notes.
 * Renders directly onto the paper background without solid boxes.
 * Automatically switches back to drawing tool once editing is done,
 * preventing accidental text box creation during screen navigation.
 */
import { BaseTool } from './BaseTool.js';
import { icons } from '../ui/icons.js';

export class TextTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'text';
    this.cursor = 'text';
    this.activeEditor = null;
    this.fontSize = 18;
    this.fontFamily = "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif";
    this._justCommitted = false;
  }

  onPointerDown(point, event) {
    // If user clicked to dismiss an active editor, suppress creating a new one
    if (this._justCommitted) {
      this._justCommitted = false;
      return;
    }

    if (this.activeEditor) {
      this._commitEditor();
      return;
    }

    const page = this.app.currentPage;
    if (!page) return;

    // Check if clicking existing text box
    const hitIndex = (page.textBoxes || []).findIndex(tb => {
      return (
        point.x >= tb.x - 5 &&
        point.x <= tb.x + (tb.width || 160) + 10 &&
        point.y >= tb.y - 5 &&
        point.y <= tb.y + (tb.height || 40) + 10
      );
    });

    if (hitIndex >= 0) {
      const tb = page.textBoxes[hitIndex];
      this._openEditor(tb.x, tb.y, tb, hitIndex);
    } else {
      this._openEditor(point.x, point.y);
    }
  }

  _openEditor(docX, docY, existing = null, existingIdx = -1) {
    if (this.activeEditor) {
      this._commitEditor();
      return;
    }

    let currentDocX = docX;
    let currentDocY = docY;
    const screenPos = this.cm.docToScreen(currentDocX, currentDocY);
    const container = this.cm.container;
    const opts = this.getToolOptions();
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const textColor = existing ? existing.color : (opts.color || (isLight ? '#18181b' : '#fafafa'));

    // 1. Wrapper container
    const wrapper = document.createElement('div');
    wrapper.className = 'canvas-text-wrapper active';
    wrapper.style.left = `${screenPos.x}px`;
    wrapper.style.top = `${screenPos.y}px`;

    // 2. Drag Bar with Done and Delete
    const dragBar = document.createElement('div');
    dragBar.className = 'canvas-text-drag-bar';
    dragBar.innerHTML = `
      <span style="display: flex; align-items: center; gap: 4px; pointer-events: none;">
        <span>⠿</span> <span>Text Box</span>
      </span>
      <div style="display: flex; align-items: center; gap: 4px;">
        <button class="ui-btn ui-btn-default ui-btn-sm" id="tb-done-text-btn" style="height: 18px; font-size: 10px; padding: 0 6px;">Done</button>
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="tb-del-text-btn" title="Delete text" style="width: 16px; height: 16px; padding: 0;">
          ${icons.trash}
        </button>
      </div>
    `;

    // 3. Transparent Textarea
    const textarea = document.createElement('textarea');
    textarea.className = 'canvas-text-textarea';
    textarea.value = existing ? existing.text : '';
    textarea.placeholder = 'Type note here...';

    const scaledFontSize = Math.max(12, (existing ? existing.fontSize : (opts.fontSize || this.fontSize)) * this.cm.zoom);
    Object.assign(textarea.style, {
      minWidth: '180px',
      minHeight: '44px',
      fontSize: `${scaledFontSize}px`,
      fontFamily: this.fontFamily,
      color: textColor,
    });

    wrapper.appendChild(dragBar);
    wrapper.appendChild(textarea);
    container.appendChild(wrapper);

    // Movable Drag Logic
    let isDragging = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let wrapperStartX = screenPos.x;
    let wrapperStartY = screenPos.y;

    dragBar.addEventListener('pointerdown', (e) => {
      if (e.target.closest('#tb-del-text-btn') || e.target.closest('#tb-done-text-btn')) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      wrapperStartX = parseFloat(wrapper.style.left) || 0;
      wrapperStartY = parseFloat(wrapper.style.top) || 0;
      dragBar.setPointerCapture(e.pointerId);
      e.stopPropagation();
    });

    dragBar.addEventListener('pointermove', (e) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const newScreenX = wrapperStartX + dx;
      const newScreenY = wrapperStartY + dy;
      wrapper.style.left = `${newScreenX}px`;
      wrapper.style.top = `${newScreenY}px`;

      const docPt = this.cm.screenToDoc(newScreenX, newScreenY);
      currentDocX = docPt.x;
      currentDocY = docPt.y;
    });

    const stopDrag = (e) => {
      if (isDragging) {
        isDragging = false;
        try { dragBar.releasePointerCapture(e.pointerId); } catch (_) {}
      }
    };
    dragBar.addEventListener('pointerup', stopDrag);
    dragBar.addEventListener('pointercancel', stopDrag);

    // Delete button
    dragBar.querySelector('#tb-del-text-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      const page = this.app.currentPage;
      if (existing && existingIdx >= 0 && page && page.textBoxes) {
        page.textBoxes.splice(existingIdx, 1);
        page.modifiedAt = Date.now();
        this.app.redrawContent();
        this.app.scheduleSave();
      }
      wrapper.remove();
      this.activeEditor = null;
      this._justCommitted = true;
      setTimeout(() => { this._justCommitted = false; }, 200);
      this.app.toolbar?.setTool('pen');
    });

    // Commit logic
    const commit = () => {
      if (!this.activeEditor) return;
      this.activeEditor = null;
      this._justCommitted = true;
      setTimeout(() => { this._justCommitted = false; }, 200);

      const text = textarea.value.trim();
      const page = this.app.currentPage;
      if (!page) {
        wrapper.remove();
        this.app.toolbar?.setTool('pen');
        return;
      }

      if (text.length > 0) {
        const lines = text.split('\n');
        const estHeight = lines.length * (this.fontSize * 1.4) + 12;
        const estWidth = Math.max(...lines.map(l => l.length * (this.fontSize * 0.6))) + 20;

        if (existing && existingIdx >= 0) {
          page.textBoxes[existingIdx] = {
            ...existing,
            x: Math.round(currentDocX),
            y: Math.round(currentDocY),
            text,
            width: estWidth,
            height: estHeight,
            modifiedAt: Date.now()
          };
        } else {
          page.textBoxes = page.textBoxes || [];
          page.textBoxes.push({
            id: `tb_${Date.now()}`,
            x: Math.round(currentDocX),
            y: Math.round(currentDocY),
            text,
            fontSize: opts.fontSize || this.fontSize,
            fontFamily: this.fontFamily,
            color: textColor,
            width: estWidth,
            height: estHeight,
            createdAt: Date.now()
          });
        }
        page.modifiedAt = Date.now();
      } else if (existing && existingIdx >= 0 && page.textBoxes) {
        page.textBoxes.splice(existingIdx, 1);
        page.modifiedAt = Date.now();
      }

      wrapper.remove();
      this.app.redrawContent();
      this.app.scheduleSave();

      // Automatically revert to pen tool so navigating the screen does not place text boxes
      this.app.toolbar?.setTool('pen');
    };

    // Done button
    dragBar.querySelector('#tb-done-text-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      commit();
    });

    // Close on outside click
    const outsideClick = (e) => {
      if (!wrapper.contains(e.target)) {
        commit();
        document.removeEventListener('pointerdown', outsideClick);
      }
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideClick);
    }, 80);

    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        commit();
      }
    });

    textarea.focus();
    this.activeEditor = { wrapper, commit };
  }

  _commitEditor() {
    if (this.activeEditor) {
      this.activeEditor.commit();
    }
  }

  onCancel() {
    this._commitEditor();
  }

  /** Render text boxes on content canvas */
  static renderTextBoxes(ctx, textBoxes) {
    if (!textBoxes || textBoxes.length === 0) return;

    for (const tb of textBoxes) {
      ctx.save();
      const fontSize = tb.fontSize || 18;
      ctx.font = `${fontSize}px ${tb.fontFamily || "-apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif"}`;
      ctx.fillStyle = tb.color || '#e8e8f0';
      ctx.textBaseline = 'top';

      const lines = (tb.text || '').split('\n');
      const lineHeight = fontSize * 1.4;

      lines.forEach((line, i) => {
        ctx.fillText(line, tb.x, tb.y + i * lineHeight);
      });

      ctx.restore();
    }
  }
}
