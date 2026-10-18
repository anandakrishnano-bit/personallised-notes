/**
 * FillTool — Intelligent Flood Fill & Shape Fill Tool.
 * 
 * Supports:
 * 1. Boundary-Aware Flood Fill: Fills closed spaces enclosed by any combination of
 *    hand-drawn lines, pen strokes, pencil strokes, or overlapping shapes.
 * 2. Closed Vector Shape Fill: Direct hit-test fill on clean geometric shapes.
 * 3. Page Background Fill: Changes background only when clicking empty paper with no strokes.
 * 4. Gap protection: Prevents accidental full-page flooding when lines do not connect,
 *    giving human-friendly feedback.
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';
import { Toast } from '../ui/Toast.js';

function parseColorRgba(colorStr, opacity = 1) {
  const c = document.createElement('canvas');
  c.width = 1;
  c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = colorStr;
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return [data[0], data[1], data[2], Math.round((opacity ?? 1) * 255)];
}

function dilateFill(data, width, height, r, g, b, a) {
  // 1-pixel bleed so fill tucks smoothly under boundary strokes without gap
  const copy = new Uint8Array(data.length);
  copy.set(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      if (copy[idx + 3] === 0) {
        if (
          copy[((y - 1) * width + x) * 4 + 3] > 0 ||
          copy[((y + 1) * width + x) * 4 + 3] > 0 ||
          copy[(y * width + (x - 1)) * 4 + 3] > 0 ||
          copy[(y * width + (x + 1)) * 4 + 3] > 0
        ) {
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = a;
        }
      }
    }
  }
}

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
    const opacity = opts.opacity ?? 1;

    // 1. If page has no strokes at all, clicking paper fills background
    if (!page.strokes || page.strokes.length === 0) {
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
      return;
    }

    // 2. Perform Boundary-Aware Flood Fill to detect closed spaces between lines or shapes
    const filledSuccess = this._floodFillEnclosedArea(clickPt, page, fillColor, opacity);
    if (filledSuccess) {
      return;
    }

    // 3. Fallback: check if clicked directly inside a single closed geometric vector shape
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

        const b = s.getBounds ? s.getBounds() : null;
        if (b) {
          this._flashFillFeedback(b.x, b.y, b.width, b.height);
        }
        return;
      }
    }
  }

  _floodFillEnclosedArea(clickPt, page, fillColor, opacity) {
    const pageW = page.width || 794;
    const pageH = page.height || 1123;

    // Boundary canvas resolution
    const maxDim = 1200;
    const scale = Math.min(1, maxDim / Math.max(pageW, pageH));
    const canvasW = Math.max(10, Math.round(pageW * scale));
    const canvasH = Math.max(10, Math.round(pageH * scale));

    const offCanvas = document.createElement('canvas');
    offCanvas.width = canvasW;
    offCanvas.height = canvasH;
    const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });

    // Render boundary barriers: strokes and shapes
    offCtx.setTransform(scale, 0, 0, scale, 0, 0);

    for (const s of page.strokes) {
      if (s.tool === 'fill' && s.fillData) {
        StrokeRenderer.renderStroke(offCtx, s);
      } else {
        // Enforce solid stroke lines with minimum thickness 3 to reliably close corners
        const savedSize = s.size;
        s.size = Math.max(s.size || 2, 3);
        StrokeRenderer.renderStroke(offCtx, s);
        s.size = savedSize;
      }
    }

    const imgData = offCtx.getImageData(0, 0, canvasW, canvasH);
    const data = imgData.data;

    let seedX = Math.round(clickPt.x * scale);
    let seedY = Math.round(clickPt.y * scale);

    if (seedX < 0 || seedX >= canvasW || seedY < 0 || seedY >= canvasH) {
      return false;
    }

    const getAlpha = (x, y) => data[(y * canvasW + x) * 4 + 3];

    // If seed point lands directly on a stroke barrier, probe immediate neighborhood for empty pocket
    if (getAlpha(seedX, seedY) > 50) {
      let found = false;
      for (let r = 1; r <= 8 && !found; r++) {
        const deltas = [[0, -r], [0, r], [-r, 0], [r, 0], [-r, -r], [r, r], [-r, r], [-r, -r]];
        for (const [dx, dy] of deltas) {
          const nx = seedX + dx;
          const ny = seedY + dy;
          if (nx >= 0 && nx < canvasW && ny >= 0 && ny < canvasH && getAlpha(nx, ny) <= 30) {
            seedX = nx;
            seedY = ny;
            found = true;
            break;
          }
        }
      }
      if (!found) return false;
    }

    // Flood fill queue & visited buffer
    const totalPixels = canvasW * canvasH;
    const visited = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let qHead = 0;
    let qTail = 0;

    const startIdx = seedY * canvasW + seedX;
    visited[startIdx] = 1;
    queue[qTail++] = startIdx;

    let minX = seedX, maxX = seedX;
    let minY = seedY, maxY = seedY;
    let filledCount = 0;
    let reachedCanvasEdge = false;

    // Safety threshold: if fill spans more than 65% of the page, it has leaked out of an open boundary
    const maxFillPixels = Math.floor(totalPixels * 0.65);

    while (qHead < qTail) {
      const curr = queue[qHead++];
      const cx = curr % canvasW;
      const cy = (curr / canvasW) | 0;
      filledCount++;

      if (cx < minX) minX = cx;
      if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy;
      if (cy > maxY) maxY = cy;

      if (cx <= 1 || cx >= canvasW - 2 || cy <= 1 || cy >= canvasH - 2) {
        reachedCanvasEdge = true;
      }

      if (filledCount > maxFillPixels) {
        Toast.info('Area is not closed. Connect lines to fill.');
        return false;
      }

      // Check 4-connected neighbors
      if (cx > 0) {
        const n = curr - 1;
        if (!visited[n]) {
          visited[n] = 1;
          if (data[n * 4 + 3] <= 40) queue[qTail++] = n;
        }
      }
      if (cx < canvasW - 1) {
        const n = curr + 1;
        if (!visited[n]) {
          visited[n] = 1;
          if (data[n * 4 + 3] <= 40) queue[qTail++] = n;
        }
      }
      if (cy > 0) {
        const n = curr - canvasW;
        if (!visited[n]) {
          visited[n] = 1;
          if (data[n * 4 + 3] <= 40) queue[qTail++] = n;
        }
      }
      if (cy < canvasH - 1) {
        const n = curr + canvasW;
        if (!visited[n]) {
          visited[n] = 1;
          if (data[n * 4 + 3] <= 40) queue[qTail++] = n;
        }
      }
    }

    // If flood fill reached the outer edge and flooded open canvas
    if (reachedCanvasEdge && filledCount > totalPixels * 0.12) {
      Toast.info('Area is not closed. Connect lines to fill.');
      return false;
    }

    if (filledCount < 4) {
      return false;
    }

    // Extract closed region patch
    const rw = maxX - minX + 1;
    const rh = maxY - minY + 1;

    const patchCanvas = document.createElement('canvas');
    patchCanvas.width = rw;
    patchCanvas.height = rh;
    const patchCtx = patchCanvas.getContext('2d');
    const patchImgData = patchCtx.createImageData(rw, rh);
    const pData = patchImgData.data;

    const [r, g, b, a] = parseColorRgba(fillColor, opacity);

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = y * canvasW + x;
        if (visited[idx] === 1 && data[idx * 4 + 3] <= 40) {
          const outIdx = ((y - minY) * rw + (x - minX)) * 4;
          pData[outIdx] = r;
          pData[outIdx + 1] = g;
          pData[outIdx + 2] = b;
          pData[outIdx + 3] = a;
        }
      }
    }

    dilateFill(pData, rw, rh, r, g, b, a);
    patchCtx.putImageData(patchImgData, 0, 0);

    const dataUrl = patchCanvas.toDataURL('image/png');

    const docX = Math.round(minX / scale);
    const docY = Math.round(minY / scale);
    const docW = Math.round(rw / scale);
    const docH = Math.round(rh / scale);

    const fillStroke = new Stroke({
      tool: 'fill',
      color: fillColor,
      fillColor: fillColor,
      opacity: opacity,
      start: { x: docX, y: docY },
      end: { x: docX + docW, y: docY + docH },
      fillData: {
        x: docX,
        y: docY,
        width: docW,
        height: docH,
        dataUrl: dataUrl
      }
    });
    fillStroke._image = patchCanvas;

    // Place fill underneath boundary lines
    page.strokes.unshift(fillStroke);
    page.modifiedAt = Date.now();

    this.app.history.push({
      type: 'addStroke',
      stroke: fillStroke,
      insertAtStart: true,
      pageId: page.id
    });

    this.app.redrawContent();
    this.app.scheduleSave();
    this._flashFillFeedback(docX, docY, docW, docH);
    return true;
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
