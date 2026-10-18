/**
 * Toast — Non-intrusive notifications for friendly feedback and error handling.
 */
import { icons } from './icons.js';

export class Toast {
  static container = null;

  static _ensureContainer() {
    if (!Toast.container || !document.body.contains(Toast.container)) {
      Toast.container = document.createElement('div');
      Toast.container.className = 'toast-viewport';
      Toast.container.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        max-width: 360px;
        width: 100%;
      `;
      document.body.appendChild(Toast.container);
    }
  }

  static show(message, type = 'info', duration = 3200) {
    Toast._ensureContainer();

    const el = document.createElement('div');
    el.className = `toast-item toast-${type}`;
    el.style.cssText = `
      pointer-events: auto;
      padding: 12px 16px;
      border-radius: var(--radius-md, 8px);
      background-color: hsl(var(--card));
      color: hsl(var(--foreground));
      border: 1px solid ${type === 'error' ? 'hsl(var(--destructive) / 0.4)' : 'hsl(var(--border))'};
      box-shadow: 0 8px 24px -4px rgba(0, 0, 0, 0.16), 0 2px 6px -1px rgba(0, 0, 0, 0.08);
      font-size: 13px;
      line-height: 1.4;
      display: flex;
      align-items: center;
      gap: 10px;
      opacity: 0;
      transform: translateY(12px) scale(0.96);
      transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
    `;

    const iconHtml = type === 'error'
      ? `<span style="color: hsl(var(--destructive)); display: flex; flex-shrink: 0;">${icons.x}</span>`
      : type === 'success'
      ? `<span style="color: hsl(var(--success, 142 76% 36%)); display: flex; flex-shrink: 0;">${icons.check}</span>`
      : `<span style="color: hsl(var(--primary)); display: flex; flex-shrink: 0;">${icons.notebook}</span>`;

    el.innerHTML = `
      ${iconHtml}
      <div style="flex: 1; font-weight: 500;">${message}</div>
    `;

    Toast.container.appendChild(el);

    // Animate in
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0) scale(1)';
    });

    const hide = () => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px) scale(0.95)';
      setTimeout(() => el.remove(), 260);
    };

    const timeout = setTimeout(hide, duration);
    el.addEventListener('click', () => {
      clearTimeout(timeout);
      hide();
    });
  }

  static error(msg) {
    Toast.show(msg, 'error', 4200);
  }

  static success(msg) {
    Toast.show(msg, 'success', 2800);
  }

  static info(msg) {
    Toast.show(msg, 'info', 3200);
  }
}
