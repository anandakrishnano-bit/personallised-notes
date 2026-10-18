/**
 * QuickActionPanel — Floating glassmorphic radial/pill tool palette launched via 2-finger tap.
 * Provides instant access to Pen, Pencil, Highlighter, Eraser, Undo, Redo, and top colors.
 */
import { icons } from './icons.js';

export class QuickActionPanel {
  static show(app, screenX, screenY) {
    // Remove any existing quick panel
    QuickActionPanel.hide();

    const panel = document.createElement('div');
    panel.id = 'app-quick-action-panel';
    panel.className = 'quick-action-panel';

    const currentTool = app.activeTool?.name || 'pen';
    const quickColors = ['#18181b', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#fafafa'];

    panel.innerHTML = `
      <div class="ui-toggle-group">
        <button class="ui-toggle ${currentTool === 'pen' ? 'active' : ''}" data-qtool="pen" title="Pen">
          ${icons.pen}
        </button>
        <button class="ui-toggle ${currentTool === 'pencil' ? 'active' : ''}" data-qtool="pencil" title="Pencil">
          ${icons.pencil}
        </button>
        <button class="ui-toggle ${currentTool === 'highlighter' ? 'active' : ''}" data-qtool="highlighter" title="Highlighter">
          ${icons.highlighter}
        </button>
        <button class="ui-toggle ${currentTool === 'eraser' ? 'active' : ''}" data-qtool="eraser" title="Eraser">
          ${icons.eraser}
        </button>
        <button class="ui-toggle ${currentTool === 'shape' ? 'active' : ''}" data-qtool="shape" title="Shapes">
          ${icons.shapes}
        </button>
      </div>

      <div class="ui-separator-v"></div>

      <!-- Quick Colors -->
      <div style="display: flex; align-items: center; gap: 4px;">
        ${quickColors.map(c => `
          <button data-qcolor="${c}" style="width: 18px; height: 18px; border-radius: 50%; background-color: ${c}; border: 1.5px solid hsl(var(--border)); cursor: pointer; padding: 0; outline: none; transition: transform 0.1s ease;" title="${c}"></button>
        `).join('')}
      </div>

      <div class="ui-separator-v"></div>

      <!-- Quick History -->
      <div style="display: flex; align-items: center; gap: 2px;">
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="q-undo-btn" title="Undo">
          ${icons.undo}
        </button>
        <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="q-redo-btn" title="Redo">
          ${icons.redo}
        </button>
      </div>

      <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="q-close-btn" title="Close" style="margin-left: 2px;">
        ${icons.x}
      </button>
    `;

    document.body.appendChild(panel);

    // Position panel centered around tap coordinates
    const pWidth = panel.offsetWidth || 340;
    const pHeight = panel.offsetHeight || 44;
    const left = Math.max(10, Math.min(window.innerWidth - pWidth - 10, screenX - pWidth / 2));
    const top = Math.max(60, Math.min(window.innerHeight - pHeight - 10, screenY - pHeight - 20));

    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;

    // Tool switching
    panel.querySelectorAll('[data-qtool]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.getAttribute('data-qtool');
        app.toolbar?.setTool(tool);
        QuickActionPanel.hide();
      });
    });

    // Color switching
    panel.querySelectorAll('[data-qcolor]').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.getAttribute('data-qcolor');
        const activeName = app.activeTool?.name || 'pen';
        app.setToolOption(activeName, 'color', color);
        app.toolbar?.updateColorSwatch?.(color);
        QuickActionPanel.hide();
      });
    });

    // Undo / Redo
    panel.querySelector('#q-undo-btn')?.addEventListener('click', () => {
      app.undo();
    });
    panel.querySelector('#q-redo-btn')?.addEventListener('click', () => {
      app.redo();
    });

    // Close
    panel.querySelector('#q-close-btn')?.addEventListener('click', () => {
      QuickActionPanel.hide();
    });

    // Auto-close on click outside
    const outsideListener = (e) => {
      if (!panel.contains(e.target)) {
        QuickActionPanel.hide();
        document.removeEventListener('pointerdown', outsideListener);
      }
    };
    setTimeout(() => {
      document.addEventListener('pointerdown', outsideListener);
    }, 50);
  }

  static hide() {
    const p = document.getElementById('app-quick-action-panel');
    if (p) p.remove();
  }
}
