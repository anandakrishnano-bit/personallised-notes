/**
 * EraserTool — Erases drawn strokes.
 * 
 * Modes:
 * - 'stroke' (default): Erases entire strokes touched by the eraser.
 * - 'precision': Removes points within the eraser radius.
 */
import { BaseTool } from './BaseTool.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';

export class EraserTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'eraser';
    this.cursor = 'none'; // Custom circle cursor drawn on UI layer
    this.mode = 'stroke'; // 'stroke' | 'precision'
    this._erasedStrokes = [];
    this._lastPos = null;
  }

  onPointerDown(point) {
    this._erasedStrokes = [];
    this._lastPos = point;
    this._eraseAt(point.x, point.y);
  }

  onPointerMove(points) {
    for (const p of points) {
      this._eraseAt(p.x, p.y);
      this._lastPos = p;
    }
    this._drawCursor(this._lastPos);
  }

  onPointerUp(point) {
    if (point && point.x !== undefined) {
      this._eraseAt(point.x, point.y);
    }

    if (this._erasedStrokes.length > 0) {
      const page = this.app.currentPage;
      if (page) {
        this.app.history.push({
          type: 'removeStrokes',
          strokes: [...this._erasedStrokes],
          pageId: page.id
        });
      }
      this.app.scheduleSave();
    }

    this._erasedStrokes = [];
    this._lastPos = null;
    this.cm.clear('ui');
  }

  onCancel() {
    this._erasedStrokes = [];
    this._lastPos = null;
    this.cm.clear('ui');
  }

  _eraseAt(x, y) {
    const page = this.app.currentPage;
    if (!page || !page.strokes || page.strokes.length === 0) return;

    const opts = this.getToolOptions();
    const radius = Math.max(8, (opts.size || 20) / 2);
    const toRemove = [];

    for (const stroke of page.strokes) {
      if (StrokeRenderer.isPointNearStroke(x, y, stroke, radius)) {
        toRemove.push(stroke);
      }
    }

    if (toRemove.length > 0) {
      const removed = page.removeStrokes(toRemove.map(s => s.id));
      this._erasedStrokes.push(...removed);
      this.app.redrawContent();
    }
  }

  _drawCursor(point) {
    if (!point) return;
    const ctx = this.cm.getCtx('ui');
    this.cm.clear('ui');
    this.applyTransform(ctx);

    const opts = this.getToolOptions();
    const size = opts.size || 24;
    StrokeRenderer.renderEraserCursor(ctx, point.x, point.y, size);
  }
}
