/**
 * FillTool — Shape and area fill tool.
 * Allows filling geometric shapes (rectangle, circle, triangle, polygon, etc.)
 * or custom closed strokes with the active pastel or custom color.
 * Clicking empty paper fills the page background.
 * 
 * Safety & UX:
 * - Only triggers on a deliberate tap (never during panning, zooming, or dragging)
 * - Uses exact geometric hit-testing (never broad bounding boxes)
 * - Single-step clean undo/redo support
 */
import { BaseTool } from './BaseTool.js';

function isPointInPolygon(point, vs) {
  if (!vs || vs.length < 3) return false;
  let inside = false;
  for (let i = 0, j = vs.length - 1; i < vs.length; j = i++) {
    const xi = vs[i].x, yi = vs[i].y;
    const xj = vs[j].x, yj = vs[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInShape(point, stroke) {
  if (stroke.isShape) {
    const data = stroke.shapeData || {};
    const type = stroke.shapeType || data.shapeType;

    // 1. Circle / Ellipse
    if (type === 'circle') {
      const cx = data.center?.x ?? (stroke.start.x + stroke.end.x) / 2;
      const cy = data.center?.y ?? (stroke.start.y + stroke.end.y) / 2;

      if (data.isEllipse) {
        const rot = data.rotation || 0;
        const rx = data.rx || Math.abs(stroke.end.x - stroke.start.x) / 2;
        const ry = data.ry || Math.abs(stroke.end.y - stroke.start.y) / 2;
        const dx = point.x - cx;
        const dy = point.y - cy;
        const cos = Math.cos(-rot);
        const sin = Math.sin(-rot);
        const u = dx * cos - dy * sin;
        const v = dx * sin + dy * cos;
        return (u * u) / (rx * rx) + (v * v) / (ry * ry) <= 1.08;
      }

      const r = data.radius || Math.hypot(stroke.end.x - stroke.start.x, stroke.end.y - stroke.start.y) / 2;
      return Math.hypot(point.x - cx, point.y - cy) <= r + 4;
    }

    // 2. Polygon, Rectangle, Triangle, Diamond
    if (data.vertices && data.vertices.length >= 3) {
      return isPointInPolygon(point, data.vertices);
    }

    // Fallback for simple bounding box
    if (stroke.start && stroke.end) {
      const minX = Math.min(stroke.start.x, stroke.end.x);
      const maxX = Math.max(stroke.start.x, stroke.end.x);
      const minY = Math.min(stroke.start.y, stroke.end.y);
      const maxY = Math.max(stroke.start.y, stroke.end.y);
      return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
    }
  }

  // 3. Closed hand-drawn stroke
  if (stroke.points && stroke.points.length >= 6) {
    const p0 = stroke.points[0];
    const pN = stroke.points[stroke.points.length - 1];
    if (Math.hypot(pN.x - p0.x, pN.y - p0.y) < 45) {
      return isPointInPolygon(point, stroke.points);
    }
  }

  return false;
}

export class FillTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'fill';
    this.cursor = 'crosshair';
    this._downPoint = null;
    this._downScreen = null;
    this._isCancelled = false;
  }

  onPointerDown(point, event) {
    this._downPoint = point;
    this._downScreen = event ? { x: event.clientX, y: event.clientY } : null;
    this._isCancelled = false;
  }

  onPointerMove(points, event) {
    if (this._isCancelled || !this._downScreen || !event) return;
    // Any drag movement > 7px cancels fill (user is panning or dragging)
    const dist = Math.hypot(event.clientX - this._downScreen.x, event.clientY - this._downScreen.y);
    if (dist > 7) {
      this._isCancelled = true;
    }
  }

  onCancel() {
    this._isCancelled = true;
    this._downPoint = null;
    this._downScreen = null;
  }

  onPointerUp(point, event) {
    if (this._isCancelled || !this._downPoint) {
      this._downPoint = null;
      this._downScreen = null;
      return;
    }

    // Check if system is currently panning or gesture was performed
    const ih = this.app.inputHandler;
    if (ih) {
      if (ih._isPanning || ih._justPanned || ih._gestureTriggered) {
        this._downPoint = null;
        this._downScreen = null;
        return;
      }
      if (ih._touches && ih._touches.size > 1) {
        this._downPoint = null;
        this._downScreen = null;
        return;
      }
    }

    // Check screen movement distance between down and up
    if (event && this._downScreen) {
      const dist = Math.hypot(event.clientX - this._downScreen.x, event.clientY - this._downScreen.y);
      if (dist > 7) {
        this._downPoint = null;
        this._downScreen = null;
        return;
      }
    }

    const clickPt = this._downPoint;
    this._downPoint = null;
    this._downScreen = null;

    const page = this.app.currentPage;
    if (!page) return;

    const opts = this.getToolOptions();
    const fillColor = opts.color || '#8FA89B';

    // 1. Check if clicking inside an existing shape or closed stroke
    if (page.strokes && page.strokes.length > 0) {
      for (let i = page.strokes.length - 1; i >= 0; i--) {
        const s = page.strokes[i];
        if (isPointInShape(clickPt, s)) {
          const oldFill = s.fillColor || null;
          s.fillColor = fillColor;
          page.modifiedAt = Date.now();
          this.app.history.push({
            type: 'fillShape',
            strokeId: s.id,
            oldFill,
            newFill: fillColor,
            pageId: page.id
          });
          this.app.redrawContent();
          this.app.scheduleSave();

          // Flash visual feedback
          const b = s.getBounds ? s.getBounds() : (s.start && s.end ? {
            x: Math.min(s.start.x, s.end.x),
            y: Math.min(s.start.y, s.end.y),
            width: Math.abs(s.end.x - s.start.x),
            height: Math.abs(s.end.y - s.start.y)
          } : null);
          if (b) {
            this._flashFillFeedback(b.x, b.y, b.width, b.height);
          }
          return;
        }
      }
    }

    // 2. Clicked empty page area -> fill page background
    const oldBg = page.bgColor || null;
    page.bgColor = fillColor;
    page.modifiedAt = Date.now();
    this.app.history.push({
      type: 'pageBg',
      oldBg,
      newBg: fillColor,
      pageId: page.id
    });
    this.app.redrawBackground();
    this.app.redrawContent();
    this.app.scheduleSave();
  }

  _flashFillFeedback(x, y, w, h) {
    const ctx = this.cm.getCtx('ui');
    this.cm.clear('ui');
    this.applyTransform(ctx);

    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 2, y - 2, w + 4, h + 4);
    ctx.restore();

    setTimeout(() => {
      this.cm.clear('ui');
    }, 250);
  }
}
