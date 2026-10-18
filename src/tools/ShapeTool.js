/**
 * ShapeTool — Draws geometric shapes with intelligent snapping:
 * - Angle snapping (0°, 45°, 90°, etc.)
 * - Aspect ratio snapping (1:1 square, perfect circle)
 * - Element alignment snapping (snaps to nearby shape boundaries/centers with visual guides)
 * - Live measurement and dimension badge
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';
import { CanvasManager } from '../engine/CanvasManager.js';

export class ShapeTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'shape';
    this.cursor = 'crosshair';
    this.shapeType = 'rectangle';
    this._startPoint = null;
    this._currentPoint = null;
    this._snappedPoint = null;
    this._snapGuides = [];
    this._badgeEl = null;
  }

  setShapeType(type) {
    this.shapeType = type;
  }

  onPointerDown(point) {
    // Snap starting point to nearby element edges if close
    const snappedStart = this._snapToExistingElements(point);
    this._startPoint = snappedStart.point;
    this._currentPoint = this._startPoint;
    this._snappedPoint = this._startPoint;
    this._snapGuides = [];

    this.cm.clear('active');
    this._createBadge();
  }

  onPointerMove(points, event) {
    if (!this._startPoint) return;
    const rawPoint = points[points.length - 1];
    const shiftKey = event?.shiftKey ?? false;

    // Apply snapping logic
    this._applySnapping(rawPoint, shiftKey);
    this._renderPreview();
  }

  onPointerUp(point) {
    if (!this._startPoint) return;
    if (point && point.x !== undefined) {
      this._applySnapping(point, false);
    }

    const start = this._startPoint;
    const end = this._snappedPoint || this._currentPoint;
    const dx = end.x - start.x;
    const dy = end.y - start.y;

    if (Math.hypot(dx, dy) >= 4) {
      const opts = this.getToolOptions();
      const stroke = this._createShapeStroke(start, end, opts);

      if (stroke) {
        const page = this.app.currentPage;
        if (page) {
          page.addStroke(stroke);
          this.app.history.push({
            type: 'addStroke',
            stroke,
            pageId: page.id
          });
        }
      }
    }

    this._cleanupBadge();
    this.cm.clear('active');
    this.app.redrawContent();
    this.app.scheduleSave();

    this._startPoint = null;
    this._currentPoint = null;
    this._snappedPoint = null;
    this._snapGuides = [];
  }

  onCancel() {
    this._cleanupBadge();
    this._startPoint = null;
    this._currentPoint = null;
    this._snappedPoint = null;
    this._snapGuides = [];
    this.cm.clear('active');
  }

  _applySnapping(rawPoint, forceSquare = false) {
    let x = rawPoint.x;
    let y = rawPoint.y;
    const sx = this._startPoint.x;
    const sy = this._startPoint.y;
    let dx = x - sx;
    let dy = y - sy;
    this._snapGuides = [];

    // 1. Line & Arrow angle snapping (0, 30, 45, 60, 90, 180, etc.)
    if (this.shapeType === 'line' || this.shapeType === 'arrow') {
      const length = Math.hypot(dx, dy);
      if (length > 10) {
        let angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
        const snapAngles = [0, 30, 45, 60, 90, 120, 135, 150, 180, -180, -150, -135, -120, -90, -60, -45, -30];
        
        for (const target of snapAngles) {
          if (Math.abs(angleDeg - target) < 6 || (forceSquare && Math.abs(angleDeg - target) < 18)) {
            const rad = (target * Math.PI) / 180;
            x = sx + length * Math.cos(rad);
            y = sy + length * Math.sin(rad);
            break;
          }
        }
      }
    } 
    // 2. Aspect Ratio Snapping (1:1 square / circle)
    else {
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (forceSquare || Math.abs(absDx - absDy) < 14) {
        const side = Math.max(absDx, absDy);
        x = sx + (dx >= 0 ? 1 : -1) * side;
        y = sy + (dy >= 0 ? 1 : -1) * side;
      }
    }

    // 3. Snap to existing shapes on page
    const elemSnap = this._snapToExistingElements({ x, y });
    x = elemSnap.point.x;
    y = elemSnap.point.y;
    this._snapGuides = elemSnap.guides;

    this._snappedPoint = { x, y };
    this._updateBadge(sx, sy, x, y);
  }

  _snapToExistingElements(point) {
    const page = this.app.currentPage;
    if (!page || !page.strokes) return { point, guides: [] };

    let bestX = point.x;
    let bestY = point.y;
    let minDiffX = 10;
    let minDiffY = 10;
    const guides = [];

    // Check bounds of all shapes
    for (const s of page.strokes) {
      if (!s.isShape && !s.bounds) continue;
      const b = s.bounds;
      if (!b) continue;

      const candidatesX = [b.minX, b.maxX, (b.minX + b.maxX) / 2];
      const candidatesY = [b.minY, b.maxY, (b.minY + b.maxY) / 2];

      for (const cx of candidatesX) {
        const diffX = Math.abs(point.x - cx);
        if (diffX < minDiffX) {
          minDiffX = diffX;
          bestX = cx;
          guides.push({ type: 'vertical', x: cx });
        }
      }

      for (const cy of candidatesY) {
        const diffY = Math.abs(point.y - cy);
        if (diffY < minDiffY) {
          minDiffY = diffY;
          bestY = cy;
          guides.push({ type: 'horizontal', y: cy });
        }
      }
    }

    return { point: { x: bestX, y: bestY }, guides };
  }

  _createBadge() {
    this._cleanupBadge();
    const badge = document.createElement('div');
    badge.className = 'shape-snap-badge';
    this.cm.container.appendChild(badge);
    this._badgeEl = badge;
  }

  _updateBadge(x1, y1, x2, y2) {
    if (!this._badgeEl) return;
    const dx = Math.abs(Math.round(x2 - x1));
    const dy = Math.abs(Math.round(y2 - y1));
    const dist = Math.round(Math.hypot(x2 - x1, y2 - y1));

    let text = '';
    if (this.shapeType === 'line' || this.shapeType === 'arrow') {
      const deg = Math.round((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
      text = `${dist} px • ${deg}°`;
    } else if (dx === dy && dx > 0) {
      text = `${dx} × ${dy} px (1:1)`;
    } else {
      text = `${dx} × ${dy} px`;
    }

    this._badgeEl.textContent = text;
    const screenPt = this.cm.docToScreen(x2, y2);
    this._badgeEl.style.left = `${screenPt.x + 12}px`;
    this._badgeEl.style.top = `${screenPt.y + 12}px`;
    this._badgeEl.style.display = 'block';
  }

  _cleanupBadge() {
    if (this._badgeEl) {
      this._badgeEl.remove();
      this._badgeEl = null;
    }
  }

  _renderPreview() {
    if (!this._startPoint || !this._snappedPoint) return;
    const ctx = this.activeCtx;
    this.cm.clear('active');
    this.applyTransform(ctx);

    // 1. Draw Snap Guides (alignment lines)
    if (this._snapGuides && this._snapGuides.length > 0) {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);

      for (const g of this._snapGuides) {
        ctx.beginPath();
        if (g.type === 'vertical') {
          ctx.moveTo(g.x, 0);
          ctx.lineTo(g.x, this.cm.docHeight || 2000);
        } else if (g.type === 'horizontal') {
          ctx.moveTo(0, g.y);
          ctx.lineTo(this.cm.docWidth || 2000, g.y);
        }
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Render Shape Preview
    const opts = this.getToolOptions();
    const fillColor = opts.fill ? (opts.fillColor || opts.color || '#8FA89B') : null;
    StrokeRenderer.renderShape(
      ctx,
      this.shapeType,
      this._startPoint,
      this._snappedPoint,
      opts.color || '#6c63ff',
      opts.size || 3,
      opts.opacity || 1,
      fillColor
    );
  }

  _createShapeStroke(start, end, opts) {
    const fillColor = opts.fill ? (opts.fillColor || opts.color || '#8FA89B') : null;
    const stroke = new Stroke({
      tool: 'shape',
      color: opts.color || '#6c63ff',
      size: opts.size || 3,
      opacity: opts.opacity || 1,
      isShape: true,
      shapeType: this.shapeType,
      fillColor,
      start: { x: start.x, y: start.y },
      end: { x: end.x, y: end.y }
    });

    stroke.points = [
      { x: start.x, y: start.y, pressure: 0.5 },
      { x: end.x, y: end.y, pressure: 0.5 }
    ];

    return stroke;
  }
}
