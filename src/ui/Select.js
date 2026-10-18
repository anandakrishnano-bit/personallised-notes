/**
 * Select — shadcn/ui Select component implementation in pure Vanilla JS.
 * Matches https://ui.shadcn.com/docs/components/select
 * 
 * Features:
 * - SelectTrigger with chevronDown icon and active state
 * - SelectContent floating popover with backdrop blur & scale-in animation
 * - SelectGroup, SelectLabel, SelectItem with checkmark icon when selected
 * - Select.enhance(selectEl) seamlessly replaces standard HTML <select> elements
 * - Keyboard navigation (Esc to close, Enter/Space/ArrowDown/ArrowUp)
 * - Auto positioning (opens upwards if near bottom of screen)
 */
import { icons } from './icons.js';

export class Select {
  /**
   * Create a programmatic shadcn Select component.
   * @param {Object} options
   * @param {Array<{value: string, label: string, group?: string}>} options.items
   * @param {string} options.value - Initial selected value
   * @param {string} [options.placeholder] - Placeholder text
   * @param {string} [options.className] - Extra CSS classes for trigger
   * @param {string} [options.width] - Custom width (e.g. '180px', '100%')
   * @param {Function} [options.onChange] - Callback when value changes: (val, item) => void
   */
  constructor(options = {}) {
    this.items = options.items || [];
    this.value = options.value ?? (this.items[0]?.value || '');
    this.placeholder = options.placeholder || 'Select an option...';
    this.className = options.className || '';
    this.width = options.width || 'auto';
    this.onChange = options.onChange || null;

    this.isOpen = false;
    this.triggerEl = null;
    this.contentEl = null;
    this._clickOutsideHandler = null;
    this._keyDownHandler = null;

    this._render();
  }

  _render() {
    this.triggerEl = document.createElement('button');
    this.triggerEl.type = 'button';
    this.triggerEl.className = `ui-select-trigger ${this.className}`.trim();
    if (this.width) {
      this.triggerEl.style.width = this.width;
    }

    const currentItem = this.items.find(it => String(it.value) === String(this.value));
    const label = currentItem ? currentItem.label : this.placeholder;

    this.triggerEl.innerHTML = `
      <span class="ui-select-value" title="${label}">${label}</span>
      <span class="ui-select-icon">${icons.chevronDown}</span>
    `;

    this.triggerEl.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.toggle();
    });

    this.triggerEl.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      } else if (e.key === 'Escape') {
        this.close();
      }
    });
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (this.isOpen) return;
    Select.closeAll();

    this.isOpen = true;
    this.triggerEl.classList.add('open');
    this.triggerEl.setAttribute('aria-expanded', 'true');

    // Build content popover
    this.contentEl = document.createElement('div');
    this.contentEl.className = 'ui-select-content';
    this.contentEl.setAttribute('role', 'listbox');

    // Group items if any have `group`
    const groups = new Map();
    for (const item of this.items) {
      const g = item.group || '';
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(item);
    }

    let html = '';
    for (const [groupName, groupItems] of groups.entries()) {
      html += '<div class="ui-select-group">';
      if (groupName) {
        html += `<div class="ui-select-label">${groupName}</div>`;
      }
      for (const item of groupItems) {
        const isSelected = String(item.value) === String(this.value);
        html += `
          <div class="ui-select-item ${isSelected ? 'selected' : ''}" 
               data-value="${item.value}" 
               role="option" 
               aria-selected="${isSelected}">
            <span class="ui-select-item-text">${item.label}</span>
            <span class="ui-select-item-check" style="${isSelected ? '' : 'opacity: 0;'}">
              ${icons.check}
            </span>
          </div>
        `;
      }
      html += '</div>';
    }

    this.contentEl.innerHTML = html;
    document.body.appendChild(this.contentEl);

    // Position content popover relative to trigger
    this._positionContent();

    // Item click
    this.contentEl.querySelectorAll('.ui-select-item').forEach(itemEl => {
      itemEl.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const val = itemEl.getAttribute('data-value');
        this.setValue(val);
        this.close();
      });
    });

    // Close on click outside
    this._clickOutsideHandler = (e) => {
      if (!this.triggerEl.contains(e.target) && !this.contentEl.contains(e.target)) {
        this.close();
      }
    };
    setTimeout(() => {
      window.addEventListener('pointerdown', this._clickOutsideHandler);
    }, 10);

    // Close on Escape or window resize
    this._keyDownHandler = (e) => {
      if (e.key === 'Escape') this.close();
    };
    window.addEventListener('keydown', this._keyDownHandler);
    this._resizeHandler = () => this.close();
    window.addEventListener('resize', this._resizeHandler);
  }

  _positionContent() {
    if (!this.contentEl || !this.triggerEl) return;
    const rect = this.triggerEl.getBoundingClientRect();
    const contentH = Math.min(260, this.contentEl.scrollHeight || 200);
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    const popoverW = Math.max(rect.width, 175);
    let left = rect.left;
    if (left + popoverW > window.innerWidth - 12) {
      left = window.innerWidth - popoverW - 12;
    }
    if (left < 10) left = 10;

    this.contentEl.style.width = `${popoverW}px`;
    this.contentEl.style.left = `${left}px`;

    if (spaceBelow < contentH + 10 && spaceAbove > spaceBelow) {
      // Open upwards
      this.contentEl.style.bottom = `${window.innerHeight - rect.top + 4}px`;
      this.contentEl.style.top = 'auto';
      this.contentEl.classList.add('opens-up');
    } else {
      // Open downwards
      this.contentEl.style.top = `${rect.bottom + 4}px`;
      this.contentEl.style.bottom = 'auto';
      this.contentEl.classList.remove('opens-up');
    }
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.triggerEl?.classList.remove('open');
    this.triggerEl?.setAttribute('aria-expanded', 'false');

    if (this.contentEl) {
      this.contentEl.classList.add('closing');
      setTimeout(() => {
        this.contentEl?.remove();
        this.contentEl = null;
      }, 100);
    }

    if (this._clickOutsideHandler) {
      window.removeEventListener('pointerdown', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }
    if (this._keyDownHandler) {
      window.removeEventListener('keydown', this._keyDownHandler);
      this._keyDownHandler = null;
    }
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
  }

  setValue(val) {
    this.value = val;
    const item = this.items.find(it => String(it.value) === String(val));
    const label = item ? item.label : this.placeholder;

    if (this.triggerEl) {
      const valEl = this.triggerEl.querySelector('.ui-select-value');
      if (valEl) {
        valEl.textContent = label;
        valEl.title = label;
      }
    }

    if (this.onChange) {
      this.onChange(val, item);
    }
  }

  getValue() {
    return this.value;
  }

  destroy() {
    this.close();
    this.triggerEl?.remove();
  }

  static closeAll() {
    document.querySelectorAll('.ui-select-content').forEach(el => el.remove());
    document.querySelectorAll('.ui-select-trigger.open').forEach(el => {
      el.classList.remove('open');
      el.setAttribute('aria-expanded', 'false');
    });
  }

  /**
   * Enhance an existing HTML <select> element in the DOM with the shadcn/ui Select UI.
   * Keeps the original <select> synced in the background so form submits and change listeners work.
   * @param {HTMLSelectElement} selectEl
   * @param {Object} [options]
   * @param {Function} [options.onChange]
   * @returns {Select}
   */
  static enhance(selectEl, options = {}) {
    if (!selectEl || selectEl._shadcnEnhanced) return selectEl._shadcnInstance;

    const items = Array.from(selectEl.options).map(opt => ({
      value: opt.value,
      label: opt.text,
      group: opt.parentElement?.tagName === 'OPTGROUP' ? opt.parentElement.label : ''
    }));

    const initialVal = selectEl.value;
    const customWidth = options.width || selectEl.style.width || selectEl.getAttribute('data-width') || 'auto';

    const selectComponent = new Select({
      items,
      value: initialVal,
      width: customWidth,
      className: options.className || selectEl.className.replace('ui-input', '').trim(),
      onChange: (newVal, item) => {
        selectEl.value = newVal;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        if (options.onChange) options.onChange(newVal, item);
      }
    });

    // Hide original native select visually but keep in DOM for form data
    selectEl.style.display = 'none';
    selectEl.setAttribute('aria-hidden', 'true');
    selectEl.parentNode.insertBefore(selectComponent.triggerEl, selectEl.nextSibling);

    // Keep synced if selectEl.value is changed programmatically
    selectEl.addEventListener('change', () => {
      if (selectComponent.getValue() !== selectEl.value) {
        selectComponent.setValue(selectEl.value);
      }
    });

    selectEl._shadcnEnhanced = true;
    selectEl._shadcnInstance = selectComponent;

    return selectComponent;
  }

  /**
   * Helper to enhance all <select> elements inside a container.
   * @param {HTMLElement} container
   */
  static enhanceAll(container) {
    if (!container) return [];
    const selects = container.querySelectorAll('select:not([data-native])');
    return Array.from(selects).map(s => Select.enhance(s));
  }
}
