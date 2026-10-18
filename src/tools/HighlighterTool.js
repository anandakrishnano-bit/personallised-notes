/**
 * HighlighterTool — Transparent highlighter.
 * 
 * During drawing: renders incrementally (slight overlap acceptable for speed).
 * On completion: re-renders the full stroke cleanly to avoid opacity buildup.
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';

export class HighlighterTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'highlighter';
    this._stroke = null;
    this._lastPoint = null;
  }

  onPointerDown(point) {
    const opts = this.getToolOptions();
    this._stroke = new Stroke({
      tool: 'highlighter',
      color: opts.color,
      size: opts.size,
      opacity: opts.opacity
    });
    this._stroke.addPoint(point.x, point.y, point.pressure);
    this._lastPoint = point;

    this.cm.clear('active');
    const ctx = this.activeCtx;
    this.applyTransform(ctx);
  }

  onPointerMove(points) {
    if (!this._stroke) return;
    const opts = this.getToolOptions();
    const ctx = this.activeCtx;
    this._stroke.addPoints(points);
    this._lastPoint = StrokeRenderer.renderSegments(
      ctx, this._lastPoint, points,
      { color: opts.color, size: opts.size, opacity: opts.opacity, tool: 'highlighter' }
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
