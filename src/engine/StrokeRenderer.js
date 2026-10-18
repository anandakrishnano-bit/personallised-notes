/**
 * StrokeRenderer — Efficient stroke and shape rendering functions.
 * 
 * Supports:
 * 1. Incremental rendering during active handwriting (fast)
 * 2. Full curve-smoothed stroke rendering (quality)
 * 3. Exact geometric vector shape rendering (crisp lines, rects, circles, arrows)
 */
export class StrokeRenderer {
  /**
   * Calculate velocity-dependent dynamic stroke width for pen tool.
   * - Slow movements: pen stays close to paper, depositing fuller ink (up to 1.25x base size)
   * - Medium handwriting pace: standard comfortable stroke (around 0.95x - 1.05x base size)
   * - Rapid flicks / fast flourishes: finer line width (down to 0.58x base size)
   */
  static calculatePenWidth(p1, p2, baseSize, lastWidth) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const dist = Math.hypot(dx, dy);

    // Calculate time delta in ms (fallback to ~16.6ms at 60Hz if timestamps missing)
    const dt = Math.max(2, (p2.timestamp && p1.timestamp) ? Math.abs(p2.timestamp - p1.timestamp) : 16.6);
    const speed = dist / dt; // pixels per millisecond

    // Realistic handwriting velocity response curve:
    // Typical speeds: 0.05 px/ms (slow) to 2.5 px/ms (fast flourish)
    // Speed factor ranges smoothly between 1.24 (slow) down to 0.58 (fast)
    const speedRatio = Math.min(2.5, Math.max(0, speed));
    const speedFactor = 1.24 - (speedRatio / 2.5) * 0.64;

    // Stylus pressure (if hardware pressure is available, e.g. Wacom, Apple Pencil, USI stylus)
    const pressure = p2.pressure !== undefined ? p2.pressure : 0.5;
    const pressureFactor = 0.55 + pressure * 0.45;

    const targetWidth = Math.max(0.75, baseSize * pressureFactor * speedFactor);

    // Exponential smoothing filter to prevent sudden width steps
    if (lastWidth !== undefined && lastWidth > 0) {
      return lastWidth * 0.65 + targetWidth * 0.35;
    }
    return targetWidth;
  }

  /**
   * Render new segments incrementally on the active canvas with smooth curve interpolation.
   * Called on every pointermove during active drawing.
   */
  static renderSegments(ctx, prevPoint, newPoints, options) {
    if (newPoints.length === 0) return prevPoint;

    const { color, size, opacity, tool } = options;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;

    let last = prevPoint;

    for (const point of newPoints) {
      const dx = point.x - last.x;
      const dy = point.y - last.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.25) continue; // Skip redundant duplicate micro-points

      let width;
      if (tool === 'pen') {
        width = this.calculatePenWidth(last, point, size, last.width);
      } else if (tool === 'pencil') {
        width = Math.max(0.8, size * (0.6 + (point.pressure || 0.5) * 0.4));
      } else if (tool === 'highlighter') {
        width = size;
      } else if (tool === 'brush') {
        width = size * (0.2 + (point.pressure || 0.5) * 0.8);
      } else {
        width = size * (0.4 + (point.pressure || 0.5) * 0.6);
      }

      ctx.lineWidth = width;

      // Smooth midpoint interpolation
      const midX = (last.x + point.x) / 2;
      const midY = (last.y + point.y) / 2;

      const startX = last.midX !== undefined ? last.midX : last.x;
      const startY = last.midY !== undefined ? last.midY : last.y;

      ctx.beginPath();
      ctx.moveTo(startX, startY);
      ctx.quadraticCurveTo(last.x, last.y, midX, midY);
      ctx.stroke();

      last = {
        x: point.x,
        y: point.y,
        pressure: point.pressure,
        timestamp: point.timestamp,
        midX: midX,
        midY: midY,
        width: width
      };
    }

    ctx.restore();
    return last;
  }

  /**
   * Finish ink stroke segments smoothly on pointerup.
   */
  static finishSegments(ctx, lastPoint, finalPoint, options) {
    if (!lastPoint || !finalPoint) return lastPoint;
    const { color, opacity } = options;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = opacity;
    ctx.lineWidth = lastPoint.width || options.size;

    const startX = lastPoint.midX !== undefined ? lastPoint.midX : lastPoint.x;
    const startY = lastPoint.midY !== undefined ? lastPoint.midY : lastPoint.y;

    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(finalPoint.x, finalPoint.y);
    ctx.stroke();
    ctx.restore();
    return finalPoint;
  }

  /**
   * Render a complete stroke or shape.
   * Used for content canvas redraw (undo, zoom, page switch).
   */
  static renderStroke(ctx, stroke) {
    if (stroke.isShape && (stroke.shapeData || (stroke.start && stroke.end))) {
      this.renderShape(
        ctx,
        stroke.shapeType,
        stroke.start,
        stroke.end,
        stroke.color,
        stroke.size,
        stroke.opacity,
        stroke.fillColor || null,
        stroke.shapeData || null
      );
      return;
    }

    const { points, color, size, opacity, tool } = stroke;
    if (!points || points.length === 0) return;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Check if stroke is essentially a single-point tap / dot
    let isDot = points.length === 1;
    if (!isDot && points.length === 2) {
      const dx = points[1].x - points[0].x;
      const dy = points[1].y - points[0].y;
      if (dx * dx + dy * dy < 4.0) isDot = true;
    } else if (!isDot && points.length <= 4) {
      let maxDistSq = 0;
      for (let i = 1; i < points.length; i++) {
        const d = (points[i].x - points[0].x) ** 2 + (points[i].y - points[0].y) ** 2;
        if (d > maxDistSq) maxDistSq = d;
      }
      if (maxDistSq < 6.25) isDot = true;
    }

    if (isDot) {
      const p = points[0];
      const r = Math.max(1, (size * (0.4 + (p.pressure || 0.5) * 0.6)) / 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = opacity;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (tool === 'highlighter') {
      ctx.globalAlpha = opacity;
      ctx.strokeStyle = color;
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = size;
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) {
        const mid = {
          x: (points[i - 1].x + points[i].x) / 2,
          y: (points[i - 1].y + points[i].y) / 2
        };
        if (i === 1) {
          ctx.lineTo(mid.x, mid.y);
        } else {
          ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, mid.x, mid.y);
        }
      }
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
      ctx.stroke();
    } else if (tool === 'pencil') {
      // Authentic graphite pencil: natural opacity, core shading, and texture
      const avgPressure = points.reduce((acc, p) => acc + (p.pressure || 0.5), 0) / points.length;
      const baseWidth = Math.max(1, size * (0.6 + avgPressure * 0.4));

      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity * 0.65;
      ctx.lineWidth = baseWidth;

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
      ctx.stroke();

      // Secondary graphite core pass
      ctx.globalAlpha = opacity * 0.35;
      ctx.lineWidth = Math.max(0.7, baseWidth * 0.45);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      ctx.globalAlpha = opacity;

      // Optional closed stroke fill
      if (stroke.fillColor) {
        ctx.fillStyle = stroke.fillColor;
        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.closePath();
        ctx.fill();
      }

      // Continuous, unbroken curve with speed-responsive calligraphic width
      let lastMid = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2
      };

      const p0 = points[0];
      let curWidth = (tool === 'pen')
        ? this.calculatePenWidth(p0, points[1] || p0, size, size)
        : size * (0.4 + (p0.pressure || 0.5) * 0.6);

      // Initial lead-in
      ctx.lineWidth = curWidth;
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(lastMid.x, lastMid.y);
      ctx.stroke();

      // Continuous intermediate segments from mid to mid
      for (let i = 1; i < points.length - 1; i++) {
        const currentMid = {
          x: (points[i].x + points[i + 1].x) / 2,
          y: (points[i].y + points[i + 1].y) / 2
        };

        if (tool === 'pen') {
          curWidth = this.calculatePenWidth(points[i - 1], points[i], size, curWidth);
        } else {
          const pressure = Math.max(0.1, points[i].pressure || 0.5);
          curWidth = size * (0.4 + pressure * 0.6);
        }

        ctx.lineWidth = curWidth;
        ctx.beginPath();
        ctx.moveTo(lastMid.x, lastMid.y);
        ctx.quadraticCurveTo(points[i].x, points[i].y, currentMid.x, currentMid.y);
        ctx.stroke();
        lastMid = currentMid;
      }

      // Final segment to end point
      const lastPt = points[points.length - 1];
      ctx.lineWidth = curWidth;
      ctx.beginPath();
      ctx.moveTo(lastMid.x, lastMid.y);
      ctx.lineTo(lastPt.x, lastPt.y);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Crisp, exact geometric vector shape rendering.
   */
  static renderShape(ctx, shapeType, start, end, color, size, opacity = 1, fillColor = null, shapeData = null) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = opacity;

    // 1. Explicit polygon vertices (triangles, quads, diamonds, polygons)
    if (shapeData && shapeData.vertices && shapeData.vertices.length >= 3) {
      ctx.beginPath();
      ctx.moveTo(shapeData.vertices[0].x, shapeData.vertices[0].y);
      for (let i = 1; i < shapeData.vertices.length; i++) {
        ctx.lineTo(shapeData.vertices[i].x, shapeData.vertices[i].y);
      }
      ctx.closePath();
      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 2. Ellipse (with rotation)
    if (shapeData && (shapeData.isEllipse || shapeData.rotation !== undefined)) {
      const cx = shapeData.center ? shapeData.center.x : (start && end ? (start.x + end.x) / 2 : 0);
      const cy = shapeData.center ? shapeData.center.y : (start && end ? (start.y + end.y) / 2 : 0);
      const rx = shapeData.rx || (start && end ? Math.abs(end.x - start.x) / 2 : 10);
      const ry = shapeData.ry || (start && end ? Math.abs(end.y - start.y) / 2 : 10);
      const rot = shapeData.rotation || 0;

      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), rot, 0, Math.PI * 2);
      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    // 3. Circle with center and radius
    if (shapeData && shapeData.isCircle && shapeData.radius && shapeData.center) {
      ctx.beginPath();
      ctx.arc(shapeData.center.x, shapeData.center.y, Math.max(1, shapeData.radius), 0, Math.PI * 2);
      if (fillColor) {
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (!start || !end) {
      ctx.restore();
      return;
    }

    const x1 = start.x, y1 = start.y;
    const x2 = end.x, y2 = end.y;
    const minX = Math.min(x1, x2);
    const minY = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;

    ctx.beginPath();
    switch (shapeType) {
      case 'line':
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        break;

      case 'arrow': {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(14, size * 4);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 6),
          y2 - headLen * Math.sin(angle - Math.PI / 6)
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 6),
          y2 - headLen * Math.sin(angle + Math.PI / 6)
        );
        break;
      }

      case 'rectangle':
        ctx.rect(minX, minY, Math.max(1, w), Math.max(1, h));
        break;

      case 'circle': {
        const rx = Math.max(1, w / 2);
        const ry = Math.max(1, h / 2);
        ctx.ellipse(midX, midY, rx, ry, 0, 0, Math.PI * 2);
        break;
      }

      case 'triangle':
        ctx.moveTo(midX, minY);
        ctx.lineTo(x2, y2);
        ctx.lineTo(x1, y2);
        ctx.closePath();
        break;

      case 'diamond':
        ctx.moveTo(midX, minY);
        ctx.lineTo(minX + w, midY);
        ctx.lineTo(midX, minY + h);
        ctx.lineTo(minX, midY);
        ctx.closePath();
        break;

      case 'star': {
        const rOuter = Math.min(w, h) / 2;
        const rInner = rOuter * 0.42;
        const cx = midX, cy = midY;
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? rOuter : rInner;
          const a = (i * Math.PI) / 5 - Math.PI / 2;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }

      default:
        ctx.rect(minX, minY, Math.max(1, w), Math.max(1, h));
    }

    if (fillColor && shapeType !== 'line' && shapeType !== 'arrow') {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    ctx.stroke();
    ctx.restore();
  }

  /**
   * Render eraser indicator on UI layer
   */
  static renderEraserCursor(ctx, x, y, size) {
    ctx.save();
    ctx.strokeStyle = '#a1a1aa';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Check if a point is near a stroke or shape (for eraser hit-testing)
   */
  static isPointNearStroke(px, py, stroke, threshold) {
    if (stroke.isShape && stroke.start && stroke.end) {
      const b = stroke.getBounds ? stroke.getBounds() : null;
      if (!b) return false;
      return (
        px >= b.x - threshold &&
        px <= b.x + b.width + threshold &&
        py >= b.y - threshold &&
        py <= b.y + b.height + threshold
      );
    }

    const points = stroke.points;
    if (!points || points.length === 0) return false;
    const t2 = threshold * threshold;

    for (let i = 0; i < points.length; i++) {
      const dx = px - points[i].x;
      const dy = py - points[i].y;
      if (dx * dx + dy * dy <= t2) return true;

      if (i < points.length - 1) {
        const dist2 = StrokeRenderer._pointToSegmentDist2(
          px, py,
          points[i].x, points[i].y,
          points[i + 1].x, points[i + 1].y
        );
        if (dist2 <= t2) return true;
      }
    }
    return false;
  }

  /** Squared distance from point to line segment */
  static _pointToSegmentDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return (px - ax) ** 2 + (py - ay) ** 2;

    let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const projX = ax + t * dx;
    const projY = ay + t * dy;
    return (px - projX) ** 2 + (py - projY) ** 2;
  }

  /** Get bounding box of stroke or shape */
  static getStrokeBounds(stroke) {
    return stroke.getBounds ? stroke.getBounds() : null;
  }
}
