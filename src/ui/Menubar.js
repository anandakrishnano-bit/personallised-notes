/**
 * Menubar — shadcn/ui Menubar component implementation in pure Vanilla JS.
 * Matches https://ui.shadcn.com/docs/components/menubar
 * 
 * Features:
 * - MenubarMenu with MenubarTrigger
 * - MenubarContent floating popover with backdrop blur & subtle shadow
 * - MenubarItem with optional MenubarShortcut and icons
 * - MenubarSeparator, MenubarCheckboxItem
 * - Seamless desktop menubar behavior: clicking one opens it, hovering others switches menu
 * - Keyboard navigation (Esc to close, Arrow keys)
 */
import { icons } from './icons.js';

export class Menubar {
  /**
   * Create a shadcn Menubar component.
   * @param {Object} options
   * @param {Array<Object>} options.menus - Array of menu configurations
   *   Menu format:
   *   {
   *     trigger: 'File',
   *     items: [
   *       { label: 'New Page', shortcut: '+ / PgDn', icon?: string, onClick: fn },
   *       { separator: true },
   *       { label: 'Export as PDF', shortcut: 'Ctrl+P', onClick: fn },
   *       { type: 'checkbox', label: 'Palm Rejection', checked: true, onToggle: fn }
   *     ]
   *   }
   */
  constructor(options = {}) {
    this.menus = options.menus || [];
    this.app = options.app || null;
    this.element = null;
    this.activeMenuIndex = null;
    this.openContentEl = null;

    this._clickOutsideHandler = null;
    this._keyDownHandler = null;

    this._render();
  }

  _render() {
    this.element = document.createElement('div');
    this.element.className = 'ui-menubar';
    this.element.setAttribute('role', 'menubar');

    this.menus.forEach((menu, index) => {
      const triggerBtn = document.createElement('button');
      triggerBtn.type = 'button';
      triggerBtn.className = 'ui-menubar-trigger';
      triggerBtn.setAttribute('role', 'menuitem');
      triggerBtn.setAttribute('aria-haspopup', 'true');
      triggerBtn.setAttribute('aria-expanded', 'false');
      triggerBtn.setAttribute('data-index', String(index));
      triggerBtn.textContent = menu.trigger;

      // Click to toggle
      triggerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.activeMenuIndex === index) {
          this.closeMenu();
        } else {
          this.openMenu(index);
        }
      });

      // Hover while active switches menu (standard desktop menubar behavior)
      triggerBtn.addEventListener('mouseenter', () => {
        if (this.activeMenuIndex !== null && this.activeMenuIndex !== index) {
          this.openMenu(index);
        }
      });

      this.element.appendChild(triggerBtn);
    });
  }

  openMenu(index) {
    this.closeMenu();
    const menu = this.menus[index];
    if (!menu) return;

    this.activeMenuIndex = index;
    const triggers = this.element.querySelectorAll('.ui-menubar-trigger');
    const triggerBtn = triggers[index];
    if (triggerBtn) {
      triggerBtn.classList.add('active');
      triggerBtn.setAttribute('aria-expanded', 'true');
    }

    // Build MenubarContent
    this.openContentEl = document.createElement('div');
    this.openContentEl.className = 'ui-menubar-content';
    this.openContentEl.setAttribute('role', 'menu');

    let html = '';
    menu.items.forEach((item, itemIdx) => {
      if (item.separator) {
        html += '<div class="ui-menubar-separator"></div>';
        return;
      }

      if (item.type === 'checkbox') {
        html += `
          <div class="ui-menubar-item ui-menubar-checkbox-item ${item.checked ? 'checked' : ''}" data-item-idx="${itemIdx}" role="menuitemcheckbox" aria-checked="${!!item.checked}">
            <span class="ui-menubar-check">${item.checked ? icons.check : ''}</span>
            <span class="ui-menubar-item-label">${item.label}</span>
            ${item.shortcut ? `<span class="ui-menubar-shortcut">${item.shortcut}</span>` : ''}
          </div>
        `;
        return;
      }

      const disabled = typeof item.disabled === 'function' ? item.disabled() : !!item.disabled;
      const isDisabled = disabled ? 'disabled' : '';
      const isDestructive = item.destructive ? 'destructive' : '';
      html += `
        <div class="ui-menubar-item ${isDisabled} ${isDestructive}" data-item-idx="${itemIdx}" role="menuitem">
          ${item.icon ? `<span class="ui-menubar-icon">${item.icon}</span>` : ''}
          <span class="ui-menubar-item-label">${item.label}</span>
          ${item.shortcut ? `<span class="ui-menubar-shortcut">${item.shortcut}</span>` : ''}
        </div>
      `;
    });

    this.openContentEl.innerHTML = html;
    document.body.appendChild(this.openContentEl);

    // Position popover under the trigger button
    if (triggerBtn) {
      const rect = triggerBtn.getBoundingClientRect();
      const contentW = Math.max(rect.width, 210);
      let left = rect.left;
      if (left + contentW > window.innerWidth - 12) {
        left = window.innerWidth - contentW - 12;
      }
      if (left < 8) left = 8;

      this.openContentEl.style.top = `${rect.bottom + 4}px`;
      this.openContentEl.style.left = `${left}px`;
      this.openContentEl.style.minWidth = `${contentW}px`;
    }

    // Bind item clicks
    this.openContentEl.querySelectorAll('.ui-menubar-item').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = Number(el.getAttribute('data-item-idx'));
        const item = menu.items[idx];
        const disabled = typeof item?.disabled === 'function' ? item.disabled() : !!item?.disabled;
        if (!item || disabled) return;

        this.closeMenu();
        if (item.onClick) {
          item.onClick();
        } else if (item.onToggle) {
          item.checked = !item.checked;
          item.onToggle(item.checked);
        }
      });
    });

    // Close on outside pointerdown
    this._clickOutsideHandler = (e) => {
      if (!this.element.contains(e.target) && !this.openContentEl?.contains(e.target)) {
        this.closeMenu();
      }
    };
    setTimeout(() => {
      window.addEventListener('pointerdown', this._clickOutsideHandler);
    }, 10);

    // Keyboard navigation
    this._keyDownHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeMenu();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = (index + 1) % this.menus.length;
        this.openMenu(next);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = (index - 1 + this.menus.length) % this.menus.length;
        this.openMenu(prev);
      }
    };
    window.addEventListener('keydown', this._keyDownHandler);
  }

  closeMenu() {
    this.activeMenuIndex = null;
    const triggers = this.element?.querySelectorAll('.ui-menubar-trigger') || [];
    triggers.forEach(t => {
      t.classList.remove('active');
      t.setAttribute('aria-expanded', 'false');
    });

    if (this.openContentEl) {
      this.openContentEl.remove();
      this.openContentEl = null;
    }

    if (this._clickOutsideHandler) {
      window.removeEventListener('pointerdown', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
    if (this._keyDownHandler) {
      window.removeEventListener('keydown', this._keyDownHandler);
      this._keyDownHandler = null;
    }
  }

  destroy() {
    this.closeMenu();
    this.element?.remove();
  }
}
