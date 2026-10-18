/**
 * SelectTool — Lasso and bounding-box stroke selection, moving, duplicating, and deleting.
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';

export class SelectTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'select';
    this.cursor = 'default';
    this.mode = 'lasso'; // 'lasso' | 'box'
    this.selectedStrokes = [];
    this.bounds = null;
    this._selectionPath = [];
    this._isDragging = false;
    this._dragStart = null;
    this._dragMoved = false;
  }

  onPointerDown(point) {
    // Check if clicking inside current selection bounding box
    if (this.bounds && this._isPointInBounds(point, this.bounds)) {
      this._isDragging = true;
      this._dragStart = { x: point.x, y: point.y };
      this._dragMoved = false;
      return;
    }

    // Otherwise start new selection
    this.clearSelection();
    this._selectionPath = [point];
    this._renderSelectionPath();
  }

  onPointerMove(points) {
    const pt = points[points.length - 1];

    if (this._isDragging && this.selectedStrokes.length > 0) {
      const dx = pt.x - this._dragStart.x;
      const dy = pt.y - this._dragStart.y;
      if (Math.hypot(dx, dy) > 2) {
        this._dragMoved = true;
        // Move strokes
        for (const s of this.selectedStrokes) {
          for (const p of s.points) {
            p.x += dx;
            p.y += dy;
          }
          if (s.start && s.end) {
            s.start.x += dx;
            s.start.y += dy;
            s.end.x += dx;
            s.end.y += dy;
          }
          if (s.shapeData) {
            if (s.shapeData.center) {
              s.shapeData.center.x += dx;
              s.shapeData.center.y += dy;
            }
            if (s.shapeData.vertices) {
              for (const v of s.shapeData.vertices) {
                v.x += dx;
                v.y += dy;
              }
            }
            if (s.shapeData.start && s.shapeData.end) {
              s.shapeData.start.x += dx;
              s.shapeData.start.y += dy;
              s.shapeData.end.x += dx;
              s.shapeData.end.y += dy;
            }
          }
          s.bounds = null;
        }
        // Shift bounding box
        this.bounds.x += dx;
        this.bounds.y += dy;
        this._dragStart = { x: pt.x, y: pt.y };

        this.app.redrawContent();
        this._renderSelectionBox();
      }
      return;
    }

    if (this._selectionPath.length > 0) {
      this._selectionPath.push(...points);
      this._renderSelectionPath();
    }
  }

  onPointerUp(point) {
    if (this._isDragging) {
      this._isDragging = false;
      if (this._dragMoved) {
        this.app.scheduleSave();
      }
      return;
    }

    if (this._selectionPath.length < 3) {
      this.clearSelection();
      return;
    }

    // Determine which strokes are selected
    const page = this.app.currentPage;
    if (!page || !page.strokes) return;

    const path = this._selectionPath;
    const selected = [];

    for (const stroke of page.strokes) {
      if (this._isStrokeInPath(stroke, path)) {
        selected.push(stroke);
      }
    }

    this._selectionPath = [];
    this.cm.clear('ui');

    if (selected.length > 0) {
      this.selectedStrokes = selected;
      this._computeBounds();
      this._renderSelectionBox();
    } else {
      this.clearSelection();
    }
  }

  onCancel() {
    this._isDragging = false;
    this._selectionPath = [];
    this.clearSelection();
  }

  clearSelection() {
    this.selectedStrokes = [];
    this.bounds = null;
    this._selectionPath = [];
    this.cm.clear('ui');
  }

  deleteSelected() {
    if (this.selectedStrokes.length === 0) return;
    const page = this.app.currentPage;
    if (!page) return;

    const toRemove = [...this.selectedStrokes];
    page.removeStrokes(toRemove.map(s => s.id));
    this.app.history.push({
      type: 'removeStrokes',
      strokes: toRemove,
      pageId: page.id
    });

    this.clearSelection();
    this.app.redrawContent();
    this.app.scheduleSave();
  }

  duplicateSelected() {
    if (this.selectedStrokes.length === 0) return;
    const page = this.app.currentPage;
    if (!page) return;

    const newStrokes = [];
    const offset = 20;

    for (const s of this.selectedStrokes) {
      const copy = new Stroke({
        tool: s.tool,
        color: s.color,
        size: s.size,
        opacity: s.opacity
      });
      copy.points = s.points.map(p => ({ x: p.x + offset, y: p.y + offset, pressure: p.pressure }));
      page.addStroke(copy);
      newStrokes.push(copy);
      this.app.history.push({
        type: 'addStroke',
        stroke: copy,
        pageId: page.id
      });
    }

    this.selectedStrokes = newStrokes;
    this._computeBounds();
    this.app.redrawContent();
    this._renderSelectionBox();
    this.app.scheduleSave();
  }

  _isPointInBounds(pt, b) {
    return pt.x >= b.x && pt.x <= b.x + b.width && pt.y >= b.y && pt.y <= b.y + b.height;
  }

  _isStrokeInPath(stroke, path) {
    if (!stroke.points || stroke.points.length === 0) return false;
    // Check if at least one point is inside the polygon
    for (const p of stroke.points) {
      if (this._pointInPolygon(p.x, p.y, path)) return true;
    }
    return false;
  }

  _pointInPolygon(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  _computeBounds() {
    if (this.selectedStrokes.length === 0) {
      this.bounds = null;
      return;
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const s of this.selectedStrokes) {
      const b = s.getBounds();
      if (!b) continue;
      if (b.x < minX) minX = b.x;
      if (b.y < minY) minY = b.y;
      if (b.x + b.width > maxX) maxX = b.x + b.width;
      if (b.y + b.height > maxY) maxY = b.y + b.height;
    }

    const pad = 8;
    this.bounds = {
      x: minX - pad,
      y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2
    };
  }

  _renderSelectionPath() {
    const ctx = this.cm.getCtx('ui');
    this.cm.clear('ui');
    if (this._selectionPath.length < 2) return;

    this.applyTransform(ctx);
    ctx.save();
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.fillStyle = 'rgba(108, 99, 255, 0.08)';

    ctx.beginPath();
    ctx.moveTo(this._selectionPath[0].x, this._selectionPath[0].y);
    for (let i = 1; i < this._selectionPath.length; i++) {
      ctx.lineTo(this._selectionPath[i].x, this._selectionPath[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  _renderSelectionBox() {
    if (!this.bounds) return;
    const ctx = this.cm.getCtx('ui');
    this.cm.clear('ui');
    this.applyTransform(ctx);

    const b = this.bounds;
    ctx.save();
    ctx.strokeStyle = '#6c63ff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(b.x, b.y, b.width, b.height);

    // Draw corner handles
    ctx.setLineDash([]);
    ctx.fillStyle = '#6c63ff';
    const corners = [
      { x: b.x, y: b.y },
      { x: b.x + b.width, y: b.y },
      { x: b.x + b.width, y: b.y + b.height },
      { x: b.x, y: b.y + b.height }
    ];
    for (const c of corners) {
      ctx.fillRect(c.x - 4, c.y - 4, 8, 8);
    }

    ctx.restore();
  }
}
