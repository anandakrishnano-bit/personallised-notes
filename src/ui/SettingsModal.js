/**
 * SettingsModal — Clean, human-friendly preferences dialog built with shadcn/ui styles.
 * No technical jargon, no emojis.
 */
import { icons } from './icons.js';
import { db } from '../storage/Database.js';
import { Toast } from './Toast.js';
import { Select } from './Select.js';

export class SettingsModal {
  static show(app) {
    document.querySelectorAll('.ui-dialog-overlay, .ui-popover-menu').forEach(m => m.remove());

    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const palm = app.inputHandler?._palmRejection ?? true;
    const finger = app.inputHandler?._fingerDrawEnabled ?? true;
    const gestures = app.gestures || {
      twoFingerTap: 'undo',
      threeFingerSlide: 'eraser',
      threeFingerTap: 'undo'
    };
    const shapeRec = app.shapeRecognition || {
      enabled: true,
      delay: 'medium',
      mode: 'preview'
    };

    const overlay = document.createElement('div');
    overlay.className = 'ui-dialog-overlay';
    overlay.innerHTML = `
      <div class="ui-dialog-content" style="max-width: 480px; width: 92vw;">
        <div class="ui-dialog-header">
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <div class="ui-dialog-title" style="font-size: 16px; font-weight: 600;">Settings</div>
            <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="set-close-x" title="Close">
              ${icons.x}
            </button>
          </div>
          <div class="ui-dialog-description">Preferences for writing, appearance, gestures, and backups.</div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px; max-height: 65vh; overflow-y: auto; padding-right: 4px;">
          <!-- Appearance -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">Appearance</div>
            <div style="display: flex; gap: 8px;">
              <button class="ui-btn ${!isLight ? 'ui-btn-default' : 'ui-btn-outline'}" id="set-theme-dark" style="flex: 1;">
                ${icons.moon} Dark Theme
              </button>
              <button class="ui-btn ${isLight ? 'ui-btn-default' : 'ui-btn-outline'}" id="set-theme-light" style="flex: 1;">
                ${icons.sun} Light Theme
              </button>
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- Stylus & Writing -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">Stylus & Touch</div>

            <!-- Palm Rejection -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12.5px; font-weight: 500;">Palm Rejection</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Rest your palm on the screen while writing with a pen</div>
              </div>
              <div class="ui-switch ${palm ? 'checked' : ''}" id="switch-palm">
                <span class="ui-switch-thumb"></span>
              </div>
            </div>

            <!-- Finger Drawing -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12.5px; font-weight: 500;">Draw with Finger</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Allow drawing strokes using touch or trackpad</div>
              </div>
              <div class="ui-switch ${finger ? 'checked' : ''}" id="switch-finger">
                <span class="ui-switch-thumb"></span>
              </div>
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- Drawing & Shape Recognition -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">Shape Recognition</div>

            <!-- Enable Shape Recognition -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12.5px; font-weight: 500;">Hold to Convert Shapes</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Hold pen still after drawing to neaten into clean geometric shapes</div>
              </div>
              <div class="ui-switch ${shapeRec.enabled ? 'checked' : ''}" id="switch-shape-rec">
                <span class="ui-switch-thumb"></span>
              </div>
            </div>

            <!-- Recognition Delay -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 500;">Hold Duration</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Time to hold still before shape converts</div>
              </div>
              <select class="ui-input" id="set-shape-delay" style="width: 170px; height: 32px; padding: 2px 8px; font-size: 11.5px; cursor: pointer;">
                <option value="short" ${shapeRec.delay === 'short' ? 'selected' : ''}>Quick (0.35s)</option>
                <option value="medium" ${shapeRec.delay === 'medium' ? 'selected' : ''}>Standard (0.5s)</option>
                <option value="long" ${shapeRec.delay === 'long' ? 'selected' : ''}>Relaxed (0.75s)</option>
              </select>
            </div>

            <!-- Conversion Interaction Mode -->
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 500;">Drawing Mode</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Preview on hold or convert directly</div>
              </div>
              <select class="ui-input" id="set-shape-mode" style="width: 170px; height: 32px; padding: 2px 8px; font-size: 11.5px; cursor: pointer;">
                <option value="preview" ${shapeRec.mode === 'preview' ? 'selected' : ''}>Preview Before Confirm</option>
                <option value="auto" ${shapeRec.mode === 'auto' ? 'selected' : ''}>Convert Automatically</option>
              </select>
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- Touch Gestures -->
          <div style="display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">Hand Gestures</div>
            
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 500;">Two-Finger Tap</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Quick tap with two fingers</div>
              </div>
              <select class="ui-input" id="set-gest-2tap" style="width: 170px; height: 32px; padding: 2px 8px; font-size: 11.5px; cursor: pointer;">
                <option value="undo" ${gestures.twoFingerTap === 'undo' ? 'selected' : ''}>Undo</option>
                <option value="redo" ${gestures.twoFingerTap === 'redo' ? 'selected' : ''}>Redo</option>
                <option value="quick-panel" ${gestures.twoFingerTap === 'quick-panel' ? 'selected' : ''}>Quick Tool Panel</option>
                <option value="tool-pen" ${gestures.twoFingerTap === 'tool-pen' ? 'selected' : ''}>Switch to Pen</option>
                <option value="eraser" ${gestures.twoFingerTap === 'eraser' ? 'selected' : ''}>Switch to Eraser</option>
                <option value="zoom-fit" ${gestures.twoFingerTap === 'zoom-fit' ? 'selected' : ''}>Fit to Screen</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 500;">Three-Finger Swipe</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Swipe with three fingers</div>
              </div>
              <select class="ui-input" id="set-gest-3slide" style="width: 170px; height: 32px; padding: 2px 8px; font-size: 11.5px; cursor: pointer;">
                <option value="eraser" ${gestures.threeFingerSlide === 'eraser' ? 'selected' : ''}>Temporary Eraser</option>
                <option value="undo" ${gestures.threeFingerSlide === 'undo' ? 'selected' : ''}>Undo</option>
                <option value="redo" ${gestures.threeFingerSlide === 'redo' ? 'selected' : ''}>Redo</option>
                <option value="zoom-fit" ${gestures.threeFingerSlide === 'zoom-fit' ? 'selected' : ''}>Fit to Screen</option>
              </select>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div>
                <div style="font-size: 12px; font-weight: 500;">Three-Finger Tap</div>
                <div style="font-size: 11px; color: hsl(var(--muted-foreground));">Tap with three fingers</div>
              </div>
              <select class="ui-input" id="set-gest-3tap" style="width: 170px; height: 32px; padding: 2px 8px; font-size: 11.5px; cursor: pointer;">
                <option value="undo" ${gestures.threeFingerTap === 'undo' ? 'selected' : ''}>Undo</option>
                <option value="redo" ${gestures.threeFingerTap === 'redo' ? 'selected' : ''}>Redo</option>
                <option value="quick-panel" ${gestures.threeFingerTap === 'quick-panel' ? 'selected' : ''}>Quick Tool Panel</option>
              </select>
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- Data Backup & Restore -->
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <div style="font-size: 13px; font-weight: 600; color: hsl(var(--foreground));">Backup & Restore</div>
            <div style="display: flex; gap: 8px;">
              <button class="ui-btn ui-btn-outline" id="set-backup-btn" style="flex: 1;">
                ${icons.download} Backup All Notes
              </button>
              <button class="ui-btn ui-btn-outline" id="set-restore-btn" style="flex: 1;">
                ${icons.upload} Restore Backup
              </button>
            </div>
          </div>

          <div class="ui-separator-h"></div>

          <!-- About Section -->
          <div class="ui-card" style="padding: 14px 16px; background-color: hsl(var(--muted) / 0.25); border-radius: var(--radius-md); border: 1px solid hsl(var(--border) / 0.7);">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;">
              <div style="font-size: 13.5px; font-weight: 600; color: hsl(var(--foreground));">Personalized Notes</div>
              <span class="ui-badge ui-badge-secondary" style="font-size: 10px; font-weight: 500;">Version 1.2</span>
            </div>
            <div style="font-size: 12px; color: hsl(var(--muted-foreground)); line-height: 1.5; margin-bottom: 12px;">
              Created by <strong style="color: hsl(var(--foreground));">Ananda krishnan O</strong>. Built for fluid, distraction-free handwriting, sketches, and geometric notes.
            </div>
            <div style="display: flex; align-items: center; gap: 10px;">
              <a href="https://github.com/anandakrishnano-bit" target="_blank" rel="noopener noreferrer" class="ui-btn ui-btn-outline ui-btn-sm" style="display: inline-flex; align-items: center; gap: 6px; text-decoration: none; font-size: 11.5px;">
                ${icons.github} GitHub Profile ${icons.externalLink}
              </a>
            </div>
          </div>
        </div>

        <div class="ui-dialog-footer">
          <button class="ui-btn ui-btn-default" id="set-done-btn">Done</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // Transform all selection menus into shadcn/ui Select components
    Select.enhanceAll(overlay);

    const close = () => {
      Select.closeAll();
      overlay.remove();
    };
    overlay.querySelector('#set-close-x')?.addEventListener('click', close);
    overlay.querySelector('#set-done-btn')?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });

    // Theme switches
    overlay.querySelector('#set-theme-dark')?.addEventListener('click', () => {
      app.setTheme('dark');
      close();
      SettingsModal.show(app);
    });
    overlay.querySelector('#set-theme-light')?.addEventListener('click', () => {
      app.setTheme('light');
      close();
      SettingsModal.show(app);
    });

    // Palm rejection switch
    const switchPalm = overlay.querySelector('#switch-palm');
    switchPalm?.addEventListener('click', () => {
      const isChecked = switchPalm.classList.toggle('checked');
      app.inputHandler?.setPalmRejection(isChecked);
      db.setSetting('palmRejection', isChecked);
    });

    // Finger drawing switch
    const switchFinger = overlay.querySelector('#switch-finger');
    switchFinger?.addEventListener('click', () => {
      const isChecked = switchFinger.classList.toggle('checked');
      app.inputHandler?.setFingerDrawEnabled(isChecked);
      db.setSetting('fingerDrawEnabled', isChecked);
    });

    // Shape Recognition (Hold-To-Convert) listeners
    const switchShapeRec = overlay.querySelector('#switch-shape-rec');
    switchShapeRec?.addEventListener('click', () => {
      const isChecked = switchShapeRec.classList.toggle('checked');
      app.shapeRecognition.enabled = isChecked;
      db.setSetting('shapeRecognition', app.shapeRecognition);
    });

    overlay.querySelector('#set-shape-delay')?.addEventListener('change', (e) => {
      app.shapeRecognition.delay = e.target.value;
      db.setSetting('shapeRecognition', app.shapeRecognition);
    });

    overlay.querySelector('#set-shape-mode')?.addEventListener('change', (e) => {
      app.shapeRecognition.mode = e.target.value;
      db.setSetting('shapeRecognition', app.shapeRecognition);
    });

    // Gesture dropdowns
    overlay.querySelector('#set-gest-2tap')?.addEventListener('change', (e) => {
      app.gestures.twoFingerTap = e.target.value;
      db.setSetting('gestures', app.gestures);
    });
    overlay.querySelector('#set-gest-3slide')?.addEventListener('change', (e) => {
      app.gestures.threeFingerSlide = e.target.value;
      db.setSetting('gestures', app.gestures);
    });
    overlay.querySelector('#set-gest-3tap')?.addEventListener('change', (e) => {
      app.gestures.threeFingerTap = e.target.value;
      db.setSetting('gestures', app.gestures);
    });

    // Backup
    overlay.querySelector('#set-backup-btn')?.addEventListener('click', async () => {
      try {
        const data = await db.exportAllData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `notes_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        Toast.success('Notes backup exported successfully');
      } catch (err) {
        Toast.error('Could not export backup: ' + err.message);
      }
    });

    // Restore
    overlay.querySelector('#set-restore-btn')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) {
          try {
            const text = await file.text();
            const data = JSON.parse(text);
            await db.importAllData(data);
            Toast.success('Notes restored successfully');
            setTimeout(() => window.location.reload(), 600);
          } catch (err) {
            Toast.error('Failed to restore backup: ' + err.message);
          }
        }
      };
      input.click();
    });
  }
}
