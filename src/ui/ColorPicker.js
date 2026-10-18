/**
 * ColorPicker — High-Resolution Interactive Canvas Color Wheel and HSL/Hex Picker
 * styled authentically with shadcn/ui design tokens.
 */
import { icons } from './icons.js';

export class ColorPicker {
  /**
   * @param {Object} options
   * @param {string} options.initialColor - Initial hex/rgb color
   * @param {Function} options.onChange - Callback (hexColor, opacity)
   */
  constructor(options = {}) {
    this.color = options.initialColor || '#fafafa';
    this.opacity = options.initialOpacity ?? 1;
    this.onChange = options.onChange || (() => {});
    this.recentColors = options.recentColors || ['#fafafa', '#a1a1aa', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];
    
    // HSL representation
    this.h = 0;   // 0 - 360
    this.s = 0;   // 0 - 100
    this.l = 100; // 0 - 100
    this._parseColor(this.color);

    this.container = null;
    this.wheelCanvas = null;
    this.wheelCtx = null;
    this.displayRadius = 80; // 160x160 CSS pixels
    this._isDraggingWheel = false;
  }

  _parseColor(c) {
    if (!c) return;
    if (c.startsWith('#')) {
      let hex = c.slice(1);
      if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      let h, s, l = (max + min) / 2;

      if (max === min) {
        h = s = 0;
      } else {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
          case r: h = (g - b) / d + (g < b ? 6 : 0); break;
          case g: h = (b - r) / d + 2; break;
          case b: h = (r - g) / d + 4; break;
        }
        h /= 6;
      }
      this.h = Math.round(h * 360);
      this.s = Math.round(s * 100);
      this.l = Math.round(l * 100);
    }
  }

  _hslToHex(h, s, l) {
    h /= 360;
    s /= 100;
    l /= 100;
    let r, g, b;

    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }

    const toHex = x => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  mount(targetEl) {
    this.container = targetEl;
    this._render();
  }

  _render() {
    const hex = this._hslToHex(this.h, this.s, this.l);

    const presetShades = [
      '#ffffff', '#f4f4f5', '#a1a1aa', '#52525b', '#27272a', '#09090b',
      '#ef4444', '#f97316', '#f59e0b', '#10b981', '#06b6d4', '#3b82f6',
      '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e', '#84cc16'
    ];

    const hasEyeDropper = 'EyeDropper' in window;

    this.container.innerHTML = `
      <div class="ui-popover-content" style="width: 280px; padding: 14px; display: flex; flex-direction: column; gap: 12px;">
        <!-- Header with Preview & Eyedropper -->
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="picker-preview-box" style="width: 32px; height: 32px; border-radius: var(--radius-sm); background-color: ${hex}; border: 1px solid var(--border); box-shadow: var(--shadow-xs);"></div>
            <div style="display: flex; flex-direction: column;">
              <span style="font-size: 13px; font-weight: 600; font-family: monospace;" id="picker-hex-val">${hex.toUpperCase()}</span>
              <span style="font-size: 11px; color: var(--muted-foreground);" id="picker-hsl-val">hsl(${this.h}, ${this.s}%, ${this.l}%)</span>
            </div>
          </div>

          ${hasEyeDropper ? `
            <button class="ui-btn ui-btn-outline ui-btn-icon-sm" id="picker-eyedropper-btn" title="Pick color from screen">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 22 1-1h3l9-9"/><path d="M3 21v-3l9-9"/><path d="m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2 2 0 0 1 0-2.8l.4-.4Z"/></svg>
            </button>
          ` : ''}
        </div>

        <!-- High-Resolution Color Wheel -->
        <div style="display: flex; justify-content: center; position: relative; width: 100%; height: 164px; align-items: center;">
          <canvas id="color-wheel-canvas" style="width: 160px; height: 160px; border-radius: 50%; cursor: crosshair; box-shadow: 0 2px 8px rgba(0,0,0,0.25);"></canvas>
          <div id="wheel-cursor" style="position: absolute; width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: 0 0 6px rgba(0,0,0,0.9); pointer-events: none; transform: translate(-50%, -50%);"></div>
        </div>

        <!-- Lightness Slider -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted-foreground);">
            <span>Brightness</span>
            <span id="picker-lightness-text">${this.l}%</span>
          </div>
          <input type="range" class="ui-slider" id="picker-lightness" min="0" max="100" value="${this.l}" style="background: linear-gradient(to right, #000, ${this._hslToHex(this.h, this.s, 50)}, #fff);" />
        </div>

        <!-- Opacity Slider -->
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: var(--muted-foreground);">
            <span>Opacity</span>
            <span id="picker-opacity-text">${Math.round(this.opacity * 100)}%</span>
          </div>
          <input type="range" class="ui-slider" id="picker-opacity" min="5" max="100" value="${Math.round(this.opacity * 100)}" />
        </div>

        <!-- Preset Swatches -->
        <div style="display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--border); padding-top: 8px;">
          <div style="font-size: 11px; font-weight: 500; color: var(--muted-foreground);">Palette</div>
          <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px;" id="picker-preset-grid">
            ${presetShades.map(c => `
              <div class="preset-swatch" data-color="${c}" style="height: 22px; border-radius: 4px; background: ${c}; border: 1px solid var(--border); cursor: pointer; transition: transform 0.1s ease;"></div>
            `).join('')}
          </div>
        </div>

        <!-- Recent Swatches -->
        ${this.recentColors.length > 0 ? `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div style="font-size: 11px; font-weight: 500; color: var(--muted-foreground);">Recent</div>
            <div style="display: flex; gap: 4px; overflow-x: auto;" id="picker-recent-row">
              ${this.recentColors.map(c => `
                <div class="preset-swatch" data-color="${c}" style="width: 22px; height: 22px; min-width: 22px; border-radius: 4px; background: ${c}; border: 1px solid var(--border); cursor: pointer;"></div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    this._setupWheel();
    this._bindControls();
  }

  _setupWheel() {
    this.wheelCanvas = this.container.querySelector('#color-wheel-canvas');
    if (!this.wheelCanvas) return;

    const dpr = Math.max(2, window.devicePixelRatio || 1);
    const cssR = this.displayRadius; // 80px CSS
    const pixelR = Math.round(cssR * dpr); // 160px or 240px buffer

    this.wheelCanvas.width = pixelR * 2;
    this.wheelCanvas.height = pixelR * 2;

    this.wheelCtx = this.wheelCanvas.getContext('2d');
    const ctx = this.wheelCtx;

    // Draw full HSL wheel at high physical resolution
    const imgData = ctx.createImageData(pixelR * 2, pixelR * 2);
    const data = imgData.data;

    for (let y = -pixelR; y < pixelR; y++) {
      for (let x = -pixelR; x < pixelR; x++) {
        const d = Math.hypot(x, y);
        const index = ((y + pixelR) * (pixelR * 2) + (x + pixelR)) * 4;

        if (d <= pixelR) {
          let angle = Math.atan2(y, x) * (180 / Math.PI);
          if (angle < 0) angle += 360;

          const sat = Math.min(100, (d / pixelR) * 100);
          const rgb = this._hslToRgbRaw(angle, sat, 50);

          data[index] = rgb[0];
          data[index + 1] = rgb[1];
          data[index + 2] = rgb[2];

          // Smooth antialiased circular edge
          if (d >= pixelR - 1.5) {
            const edgeAlpha = Math.max(0, Math.min(1, pixelR - d));
            data[index + 3] = Math.round(edgeAlpha * 255);
          } else {
            data[index + 3] = 255;
          }
        } else {
          data[index + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    this._updateWheelCursor();
  }

  _updateWheelCursor() {
    const cursor = this.container.querySelector('#wheel-cursor');
    const canvas = this.wheelCanvas;
    if (!cursor || !canvas) return;

    const angleRad = (this.h * Math.PI) / 180;
    const dist = (this.s / 100) * this.displayRadius;
    const cx = canvas.offsetLeft + this.displayRadius + Math.cos(angleRad) * dist;
    const cy = canvas.offsetTop + this.displayRadius + Math.sin(angleRad) * dist;

    cursor.style.left = `${cx}px`;
    cursor.style.top = `${cy}px`;
    cursor.style.backgroundColor = this._hslToHex(this.h, this.s, this.l);
  }

  _hslToRgbRaw(h, s, l) {
    h /= 360; s /= 100; l /= 100;
    let r, g, b;
    if (s === 0) r = g = b = l;
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  _bindControls() {
    const canvas = this.wheelCanvas;

    const handlePointer = (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left - this.displayRadius;
      const y = e.clientY - rect.top - this.displayRadius;
      const dist = Math.hypot(x, y);

      let angle = Math.atan2(y, x) * (180 / Math.PI);
      if (angle < 0) angle += 360;

      this.h = Math.round(angle);
      this.s = Math.min(100, Math.round((dist / this.displayRadius) * 100));

      this._notifyChange();
    };

    canvas.addEventListener('pointerdown', (e) => {
      this._isDraggingWheel = true;
      canvas.setPointerCapture(e.pointerId);
      handlePointer(e);
    });

    canvas.addEventListener('pointermove', (e) => {
      if (this._isDraggingWheel) {
        handlePointer(e);
      }
    });

    const stopDrag = () => { this._isDraggingWheel = false; };
    canvas.addEventListener('pointerup', stopDrag);
    canvas.addEventListener('pointercancel', stopDrag);

    // Lightness slider
    const lightSlider = this.container.querySelector('#picker-lightness');
    if (lightSlider) {
      lightSlider.addEventListener('input', (e) => {
        this.l = parseInt(e.target.value, 10);
        this.container.querySelector('#picker-lightness-text').textContent = `${this.l}%`;
        this._notifyChange();
      });
    }

    // Opacity slider
    const opacSlider = this.container.querySelector('#picker-opacity');
    if (opacSlider) {
      opacSlider.addEventListener('input', (e) => {
        this.opacity = parseInt(e.target.value, 10) / 100;
        this.container.querySelector('#picker-opacity-text').textContent = `${Math.round(this.opacity * 100)}%`;
        this._notifyChange();
      });
    }

    // Eyedropper API
    const eyeBtn = this.container.querySelector('#picker-eyedropper-btn');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', async () => {
        try {
          const eyeDropper = new window.EyeDropper();
          const result = await eyeDropper.open();
          if (result && result.sRGBHex) {
            this.setColor(result.sRGBHex);
          }
        } catch (err) {
          // user cancelled
        }
      });
    }

    // Swatches
    this.container.querySelectorAll('.preset-swatch').forEach(sw => {
      sw.addEventListener('click', () => {
        const hex = sw.getAttribute('data-color');
        this.setColor(hex);
      });
    });
  }

  setColor(hex, opacity = null) {
    this.color = hex;
    if (opacity !== null) this.opacity = opacity;
    this._parseColor(hex);
    this._notifyChange();
    this._render();
  }

  _notifyChange() {
    const hex = this._hslToHex(this.h, this.s, this.l);
    this.color = hex;

    // Update preview & labels
    const preview = this.container.querySelector('#picker-preview-box');
    if (preview) preview.style.backgroundColor = hex;
    const hexVal = this.container.querySelector('#picker-hex-val');
    if (hexVal) hexVal.textContent = hex.toUpperCase();
    const hslVal = this.container.querySelector('#picker-hsl-val');
    if (hslVal) hslVal.textContent = `hsl(${this.h}, ${this.s}%, ${this.l}%)`;

    // Update lightness slider gradient
    const lightSlider = this.container.querySelector('#picker-lightness');
    if (lightSlider) {
      lightSlider.style.background = `linear-gradient(to right, #000, ${this._hslToHex(this.h, this.s, 50)}, #fff)`;
    }

    this._updateWheelCursor();
    this.onChange(hex, this.opacity);
  }
}
