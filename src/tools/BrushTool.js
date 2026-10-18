/**
 * BrushTool — Smooth brush with pressure-dependent width.
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';

export class BrushTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'brush';
    this._stroke = null;
    this._lastPoint = null;
  }

  onPointerDown(point) {
    const opts = this.getToolOptions();
    this._stroke = new Stroke({
      tool: 'brush',
      color: opts.color,
      size: opts.size,
      opacity: opts.opacity
    });
    this._stroke.addPoint(point.x, point.y, point.pressure);
    this._lastPoint = point;

    this.cm.clear('active');
    const ctx = this.activeCtx;
    this.applyTransform(ctx);

    ctx.fillStyle = opts.color;
    ctx.globalAlpha = opts.opacity;
    const r = opts.size * (0.2 + point.pressure * 0.8) / 2;
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(r, 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  onPointerMove(points) {
    if (!this._stroke) return;
    const opts = this.getToolOptions();
    const ctx = this.activeCtx;
    this._stroke.addPoints(points);
    this._lastPoint = StrokeRenderer.renderSegments(
      ctx, this._lastPoint, points,
      { color: opts.color, size: opts.size, opacity: opts.opacity, tool: 'brush' }
    );
  }

  onPointerUp(point) {
    if (!this._stroke) return;
    if (point.x !== undefined) {
      this._stroke.addPoint(point.x, point.y, point.pressure);
    }

    const page = this.app.currentPage;
    if (page) {
      page.addStroke(this._stroke);
      this.app.history.push({
        type: 'addStroke',
        stroke: this._stroke,
        pageId: page.id
      });
    }

    this.cm.clear('active');
    this.app.redrawContent();
    this.app.scheduleSave();
    this._stroke = null;
    this._lastPoint = null;
  }

  onCancel() {
    this._stroke = null;
    this._lastPoint = null;
    this.cm.clear('active');
  }
}
