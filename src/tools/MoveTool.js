/**
 * MoveTool — Universal transform & move tool.
 * Allows selecting, moving, and repositioning ANY element on the canvas:
 * strokes, geometric shapes, text boxes, images, and tables.
 * Clicking a text box or table also allows direct in-place editing.
 */
import { BaseTool } from './BaseTool.js';

export class MoveTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'move';
    this.cursor = 'grab';
    this._dragTarget = null; // { type: 'stroke'|'text'|'image'|'table', item, index, startX, startY, origX, origY, origPoints }
    this._hoverTarget = null;
    this._hasMoved = false;
  }

  onPointerDown(point, event) {
    const page = this.app.currentPage;
    if (!page) return;

    this.cm.eventCanvas.style.cursor = 'grabbing';
    this._hasMoved = false;

    // 1. Check Tables (top z-index)
    if (page.tables && page.tables.length > 0) {
      for (let i = page.tables.length - 1; i >= 0; i--) {
        const tbl = page.tables[i];
        const w = tbl.cols * 95;
        const h = (tbl.rows + 1) * 30;
        if (point.x >= tbl.x && point.x <= tbl.x + w && point.y >= tbl.y && point.y <= tbl.y + h) {
          this._dragTarget = {
            type: 'table',
            item: tbl,
            index: i,
            startX: point.x,
            startY: point.y,
            origX: tbl.x,
            origY: tbl.y
          };
          return;
        }
      }
    }

    // 2. Check Text Boxes
    if (page.textBoxes && page.textBoxes.length > 0) {
      for (let i = page.textBoxes.length - 1; i >= 0; i--) {
        const tb = page.textBoxes[i];
        const w = tb.width || 180;
        const h = tb.height || 60;
        if (point.x >= tb.x - 5 && point.x <= tb.x + w + 5 && point.y >= tb.y - 5 && point.y <= tb.y + h + 5) {
          this._dragTarget = {
            type: 'text',
            item: tb,
            index: i,
            startX: point.x,
            startY: point.y,
            origX: tb.x,
            origY: tb.y
          };
          return;
        }
      }
    }

    // 3. Check Images
    if (page.images && page.images.length > 0) {
      for (let i = page.images.length - 1; i >= 0; i--) {
        const img = page.images[i];
        if (point.x >= img.x && point.x <= img.x + img.width && point.y >= img.y && point.y <= img.y + img.height) {
          this._dragTarget = {
            type: 'image',
            item: img,
            index: i,
            startX: point.x,
            startY: point.y,
            origX: img.x,
            origY: img.y
          };
          return;
        }
      }
    }

    // 4. Check Strokes & Shapes
    if (page.strokes && page.strokes.length > 0) {
      for (let i = page.strokes.length - 1; i >= 0; i--) {
        const s = page.strokes[i];
        const b = s.getBounds ? s.getBounds() : null;
        if (b && point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
          const origPoints = (s.points || []).map(p => ({ x: p.x, y: p.y, pressure: p.pressure }));
          const origStart = s.start ? { x: s.start.x, y: s.start.y } : null;
          const origEnd = s.end ? { x: s.end.x, y: s.end.y } : null;
          const origShapeData = s.shapeData ? JSON.parse(JSON.stringify(s.shapeData)) : null;

          this._dragTarget = {
            type: 'stroke',
            item: s,
            index: i,
            startX: point.x,
            startY: point.y,
            origPoints,
            origStart,
            origEnd,
            origShapeData
          };
          return;
        }
      }
    }

    this._dragTarget = null;
    this._isCanvasPan = true;
    this._panStart = event ? {
      clientX: event.clientX,
      clientY: event.clientY,
      panX: this.cm.panX,
      panY: this.cm.panY
    } : null;
  }

  onPointerMove(points, event) {
    if (this._isCanvasPan && this._panStart && event) {
      const dx = event.clientX - this._panStart.clientX;
      const dy = event.clientY - this._panStart.clientY;
      this.cm.panX = this._panStart.panX + dx;
      this.cm.panY = this._panStart.panY + dy;
      this.app.requestRedraw();
      return;
    }

    const pt = points[points.length - 1];

    if (!this._dragTarget) {
      // Hover feedback
      this._updateHoverFeedback(pt);
      return;
    }

    const dx = pt.x - this._dragTarget.startX;
    const dy = pt.y - this._dragTarget.startY;

    if (Math.hypot(dx, dy) > 2) {
      this._hasMoved = true;
    }

    const target = this._dragTarget;

    if (target.type === 'table') {
      target.item.x = Math.round(target.origX + dx);
      target.item.y = Math.round(target.origY + dy);
      this.app.redrawContent();
    } else if (target.type === 'text') {
      target.item.x = Math.round(target.origX + dx);
      target.item.y = Math.round(target.origY + dy);
      this.app.redrawContent();
    } else if (target.type === 'image') {
      target.item.x = Math.round(target.origX + dx);
      target.item.y = Math.round(target.origY + dy);
      this.app.redrawContent();
    } else if (target.type === 'stroke') {
      const s = target.item;
      if (s.isShape && s.start && s.end && target.origStart && target.origEnd) {
        s.start.x = Math.round(target.origStart.x + dx);
        s.start.y = Math.round(target.origStart.y + dy);
        s.end.x = Math.round(target.origEnd.x + dx);
        s.end.y = Math.round(target.origEnd.y + dy);
      }
      if (s.shapeData && target.origShapeData) {
        if (target.origShapeData.center) {
          s.shapeData.center = {
            x: Math.round(target.origShapeData.center.x + dx),
            y: Math.round(target.origShapeData.center.y + dy)
          };
        }
        if (target.origShapeData.vertices) {
          s.shapeData.vertices = target.origShapeData.vertices.map(v => ({
            x: Math.round(v.x + dx),
            y: Math.round(v.y + dy)
          }));
        }
        if (target.origShapeData.start && target.origShapeData.end) {
          s.shapeData.start = {
            x: Math.round(target.origShapeData.start.x + dx),
            y: Math.round(target.origShapeData.start.y + dy)
          };
          s.shapeData.end = {
            x: Math.round(target.origShapeData.end.x + dx),
            y: Math.round(target.origShapeData.end.y + dy)
          };
        }
      }
      if (s.points && target.origPoints) {
        for (let i = 0; i < s.points.length; i++) {
          s.points[i].x = target.origPoints[i].x + dx;
          s.points[i].y = target.origPoints[i].y + dy;
        }
      }
      s.bounds = null; // Invalidate cached bounds
      this.app.redrawContent();
    }

    // Draw selection outline on UI layer while dragging
    this._drawSelectionGuide(target);
  }

  onPointerUp(point) {
    this.cm.eventCanvas.style.cursor = 'grab';
    this.cm.clear('ui');

    if (this._isCanvasPan) {
      this._isCanvasPan = false;
      this._panStart = null;
      return;
    }

    if (!this._dragTarget) return;

    const target = this._dragTarget;
    const page = this.app.currentPage;

    // If user clicked without dragging (tap to edit)
    if (!this._hasMoved) {
      if (target.type === 'text') {
        this.app.tools.text?.editText(target.item, target.index);
        this._dragTarget = null;
        return;
      } else if (target.type === 'table') {
        this.app.tools.table?.editTable(target.item, target.index);
        this._dragTarget = null;
        return;
      }
    }

    if (this._hasMoved && page) {
      page.modifiedAt = Date.now();
      this.app.scheduleSave();

      let revertFn = null;
      let applyFn = null;

      if (target.type === 'stroke') {
        const stroke = target.item;
        const oldPoints = target.origPoints ? target.origPoints.map(p => ({ ...p })) : null;
        const oldStart = target.origStart ? { ...target.origStart } : null;
        const oldEnd = target.origEnd ? { ...target.origEnd } : null;
        const oldShapeData = target.origShapeData ? JSON.parse(JSON.stringify(target.origShapeData)) : null;

        const newPoints = stroke.points ? stroke.points.map(p => ({ ...p })) : null;
        const newStart = stroke.start ? { ...stroke.start } : null;
        const newEnd = stroke.end ? { ...stroke.end } : null;
        const newShapeData = stroke.shapeData ? JSON.parse(JSON.stringify(stroke.shapeData)) : null;

        revertFn = () => {
          if (oldPoints) stroke.points = oldPoints.map(p => ({ ...p }));
          if (oldStart) stroke.start = { ...oldStart };
          if (oldEnd) stroke.end = { ...oldEnd };
          if (oldShapeData) stroke.shapeData = JSON.parse(JSON.stringify(oldShapeData));
          stroke.bounds = null;
          this.app.redrawContent();
        };
        applyFn = () => {
          if (newPoints) stroke.points = newPoints.map(p => ({ ...p }));
          if (newStart) stroke.start = { ...newStart };
          if (newEnd) stroke.end = { ...newEnd };
          if (newShapeData) stroke.shapeData = JSON.parse(JSON.stringify(newShapeData));
          stroke.bounds = null;
          this.app.redrawContent();
        };
      } else {
        const item = target.item;
        const oldX = target.origX;
        const oldY = target.origY;
        const newX = item.x;
        const newY = item.y;
        revertFn = () => {
          item.x = oldX;
          item.y = oldY;
          this.app.redrawContent();
        };
        applyFn = () => {
          item.x = newX;
          item.y = newY;
          this.app.redrawContent();
        };
      }

      this.app.history.push({
        type: 'moveElement',
        elementType: target.type,
        index: target.index,
        revert: revertFn,
        apply: applyFn,
        pageId: page.id
      });
    }

    this._dragTarget = null;
  }

  onCancel() {
    this.cm.eventCanvas.style.cursor = 'grab';
    this.cm.clear('ui');
    this._dragTarget = null;
  }

  _updateHoverFeedback(point) {
    const page = this.app.currentPage;
    if (!page) return;

    let found = false;

    // Check hit on any element to show appropriate pointer cursor
    if (page.tables) {
      for (const tbl of page.tables) {
        if (point.x >= tbl.x && point.x <= tbl.x + tbl.cols * 95 && point.y >= tbl.y && point.y <= tbl.y + tbl.rows * 30) {
          found = true;
          break;
        }
      }
    }
    if (!found && page.textBoxes) {
      for (const tb of page.textBoxes) {
        if (point.x >= tb.x && point.x <= tb.x + (tb.width || 180) && point.y >= tb.y && point.y <= tb.y + (tb.height || 60)) {
          found = true;
          break;
        }
      }
    }
    if (!found && page.images) {
      for (const img of page.images) {
        if (point.x >= img.x && point.x <= img.x + img.width && point.y >= img.y && point.y <= img.y + img.height) {
          found = true;
          break;
        }
      }
    }
    if (!found && page.strokes) {
      for (const s of page.strokes) {
        const b = s.getBounds ? s.getBounds() : null;
        if (b && point.x >= b.x && point.x <= b.x + b.width && point.y >= b.y && point.y <= b.y + b.height) {
          found = true;
          break;
        }
      }
    }

    this.cm.eventCanvas.style.cursor = found ? 'move' : 'grab';
  }

  _drawSelectionGuide(target) {
    const ctx = this.cm.getCtx('ui');
    this.cm.clear('ui');
    this.applyTransform(ctx);

    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    if (target.type === 'table') {
      const t = target.item;
      ctx.strokeRect(t.x - 2, t.y - 2, t.cols * 95 + 4, (t.rows + 1) * 30 + 4);
    } else if (target.type === 'text') {
      const tb = target.item;
      ctx.strokeRect(tb.x - 2, tb.y - 2, (tb.width || 180) + 4, (tb.height || 60) + 4);
    } else if (target.type === 'image') {
      const img = target.item;
      ctx.strokeRect(img.x - 2, img.y - 2, img.width + 4, img.height + 4);
    } else if (target.type === 'stroke') {
      const b = target.item.getBounds ? target.item.getBounds() : null;
      if (b) {
        ctx.strokeRect(b.x, b.y, b.width, b.height);
      }
    }

    ctx.restore();
  }

  onCancel() {
    this._isCanvasPan = false;
    this._panStart = null;
    this._dragTarget = null;
    this._hasMoved = false;
    this.cm.clear('ui');
    this.cm.eventCanvas.style.cursor = 'grab';
  }
}
