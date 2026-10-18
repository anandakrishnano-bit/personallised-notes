/**
 * BlendTool — Artist paint smudge and blending tool.
 * Smudges, mixes, and diffuses graphite, pen, and watercolor strokes on the page.
 */
import { BaseTool } from './BaseTool.js';

export class BlendTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'blend';
    this.cursor = 'crosshair';
    this._lastPoint = null;
    this._blendCanvas = document.createElement('canvas');
    this._blendCtx = this._blendCanvas.getContext('2d');
  }

  onPointerDown(point) {
    this._lastPoint = point;
    this._sampleAndBlend(point, point);
  }

  onPointerMove(points) {
    if (!this._lastPoint) return;
    for (const pt of points) {
      this._sampleAndBlend(this._lastPoint, pt);
      this._lastPoint = pt;
    }
  }

  onPointerUp() {
    this._lastPoint = null;
    this.app.scheduleSave();
  }

  onCancel() {
    this._lastPoint = null;
  }

  _sampleAndBlend(p0, p1) {
    const ctx = this.contentCtx;
    if (!ctx) return;

    const opts = this.getToolOptions();
    const radius = Math.max(8, opts.size || 20);
    const dist = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const steps = Math.max(1, Math.ceil(dist / (radius * 0.3)));

    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const curX = p0.x + (p1.x - p0.x) * t;
      const curY = p0.y + (p1.y - p0.y) * t;

      this._smudgeAt(ctx, curX, curY, radius);
    }
  }

  _smudgeAt(ctx, x, y, radius) {
    const size = Math.round(radius * 2);
    if (this._blendCanvas.width !== size || this._blendCanvas.height !== size) {
      this._blendCanvas.width = size;
      this._blendCanvas.height = size;
    }

    const sx = Math.round(x - radius);
    const sy = Math.round(y - radius);

    // Grab current area
    this._blendCtx.clearRect(0, 0, size, size);
    try {
      this._blendCtx.drawImage(
        this.cm.getCanvas('content'),
        sx, sy, size, size,
        0, 0, size, size
      );
    } catch (_) {
      return;
    }

    // Draw circular soft stamp back onto content
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.filter = 'blur(2.5px)';
    ctx.drawImage(this._blendCanvas, sx, sy, size, size);
    ctx.restore();
  }
}
