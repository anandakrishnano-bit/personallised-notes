/**
 * Dialog — Human-friendly accessible modal dialog boxes for confirmations, prompts, and alerts.
 * Seamlessly matches the app's modern design system with backdrop blur, keyboard trap, and animations.
 */
import { icons } from './icons.js';

export class Dialog {
  /**
   * Show a confirmation dialog (replaces native window.confirm)
   */
  static confirm({
    title = 'Confirm Action',
    description = '',
    confirmText = 'Continue',
    cancelText = 'Cancel',
    isDestructive = false
  }) {
    return new Promise((resolve) => {
      document.querySelectorAll('.ui-dialog-overlay.custom-dialog').forEach(el => el.remove());

      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay custom-dialog';
      overlay.style.zIndex = '9999';

      overlay.innerHTML = `
        <div class="ui-dialog-content" style="max-width: 420px; animation: modalSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
          <div class="ui-dialog-header">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div class="ui-dialog-title" style="font-size: 15px; font-weight: 600; color: hsl(var(--foreground));">
                ${title}
              </div>
              <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="dlg-close-x" title="Close" style="color: hsl(var(--muted-foreground));">
                ${icons.x}
              </button>
            </div>
            ${description ? `<div class="ui-dialog-description" style="margin-top: 6px; font-size: 12.5px; line-height: 1.5; color: hsl(var(--muted-foreground));">${description}</div>` : ''}
          </div>

          <div class="ui-dialog-footer" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="dlg-cancel-btn">${cancelText}</button>
            <button class="ui-btn ${isDestructive ? 'ui-btn-danger' : 'ui-btn-default'} ui-btn-sm" id="dlg-confirm-btn">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const close = (result) => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 160);
        window.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') close(false);
        else if (e.key === 'Enter') close(true);
      };

      window.addEventListener('keydown', onKeyDown);

      overlay.querySelector('#dlg-close-x')?.addEventListener('click', () => close(false));
      overlay.querySelector('#dlg-cancel-btn')?.addEventListener('click', () => close(false));
      overlay.querySelector('#dlg-confirm-btn')?.addEventListener('click', () => close(true));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(false);
      });

      // Focus confirm button or cancel
      setTimeout(() => {
        const btn = isDestructive ? overlay.querySelector('#dlg-cancel-btn') : overlay.querySelector('#dlg-confirm-btn');
        btn?.focus();
      }, 50);
    });
  }

  /**
   * Show a text prompt dialog (replaces native window.prompt)
   */
  static prompt({
    title = 'Input',
    description = '',
    label = '',
    defaultValue = '',
    placeholder = '',
    confirmText = 'Save',
    cancelText = 'Cancel'
  }) {
    return new Promise((resolve) => {
      document.querySelectorAll('.ui-dialog-overlay.custom-dialog').forEach(el => el.remove());

      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay custom-dialog';
      overlay.style.zIndex = '9999';

      overlay.innerHTML = `
        <div class="ui-dialog-content" style="max-width: 420px; animation: modalSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
          <div class="ui-dialog-header">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div class="ui-dialog-title" style="font-size: 15px; font-weight: 600; color: hsl(var(--foreground));">
                ${title}
              </div>
              <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="dlg-close-x" title="Close" style="color: hsl(var(--muted-foreground));">
                ${icons.x}
              </button>
            </div>
            ${description ? `<div class="ui-dialog-description" style="margin-top: 6px; font-size: 12.5px; color: hsl(var(--muted-foreground));">${description}</div>` : ''}
          </div>

          <div style="margin-top: 14px;">
            ${label ? `<label style="display: block; font-size: 12px; font-weight: 500; margin-bottom: 6px; color: hsl(var(--foreground));">${label}</label>` : ''}
            <input type="text" class="ui-input" id="dlg-prompt-input" value="${defaultValue}" placeholder="${placeholder}" style="width: 100%; border-radius: var(--radius-md);" />
          </div>

          <div class="ui-dialog-footer" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 8px;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="dlg-cancel-btn">${cancelText}</button>
            <button class="ui-btn ui-btn-default ui-btn-sm" id="dlg-confirm-btn">${confirmText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = overlay.querySelector('#dlg-prompt-input');

      const close = (result) => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 160);
        window.removeEventListener('keydown', onKeyDown);
        resolve(result);
      };

      const onKeyDown = (e) => {
        if (e.key === 'Escape') close(null);
        else if (e.key === 'Enter') close(input.value.trim());
      };

      window.addEventListener('keydown', onKeyDown);

      overlay.querySelector('#dlg-close-x')?.addEventListener('click', () => close(null));
      overlay.querySelector('#dlg-cancel-btn')?.addEventListener('click', () => close(null));
      overlay.querySelector('#dlg-confirm-btn')?.addEventListener('click', () => close(input.value.trim()));

      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close(null);
      });

      setTimeout(() => {
        input?.focus();
        input?.select();
      }, 50);
    });
  }

  /**
   * Show a friendly message dialog (replaces native window.alert)
   */
  static alert({
    title = 'Notice',
    description = '',
    buttonText = 'Understood'
  }) {
    return new Promise((resolve) => {
      document.querySelectorAll('.ui-dialog-overlay.custom-dialog').forEach(el => el.remove());

      const overlay = document.createElement('div');
      overlay.className = 'ui-dialog-overlay custom-dialog';
      overlay.style.zIndex = '9999';

      overlay.innerHTML = `
        <div class="ui-dialog-content" style="max-width: 400px; animation: modalSlideUp 0.22s cubic-bezier(0.16, 1, 0.3, 1);">
          <div class="ui-dialog-header">
            <div class="ui-dialog-title" style="font-size: 15px; font-weight: 600; color: hsl(var(--foreground));">
              ${title}
            </div>
            ${description ? `<div class="ui-dialog-description" style="margin-top: 8px; font-size: 13px; line-height: 1.5; color: hsl(var(--muted-foreground));">${description}</div>` : ''}
          </div>

          <div class="ui-dialog-footer" style="margin-top: 20px; display: flex; justify-content: flex-end;">
            <button class="ui-btn ui-btn-default ui-btn-sm" id="dlg-ok-btn">${buttonText}</button>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const close = () => {
        overlay.classList.add('fade-out');
        setTimeout(() => overlay.remove(), 160);
        resolve();
      };

      overlay.querySelector('#dlg-ok-btn')?.addEventListener('click', close);
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) close();
      });

      setTimeout(() => overlay.querySelector('#dlg-ok-btn')?.focus(), 50);
    });
  }
}
