/**
 * PenTool — Primary handwriting tool with Hold-To-Convert intelligent shape recognition.
 * 
 * Features:
 * - Ultra-low latency incremental rendering for normal handwriting
 * - Stationary hold detection (< 7px jitter tolerance)
 * - Configurable hold delay (Short 350ms, Medium 500ms, Long 750ms)
 * - Fast, offline geometric shape recognition via ShapeRecognizer (< 0.2ms)
 * - Real-time subtle visual preview on active canvas while holding
 * - Stroke continuation: moving the stylus again cancels conversion and restores freehand ink
 * - Two-stage undo integration: undoing restores original freehand stroke, second undo removes it
 */
import { BaseTool } from './BaseTool.js';
import { Stroke } from '../models/Stroke.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';
import { ShapeRecognizer } from '../engine/ShapeRecognizer.js';

export class PenTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'pen';
    this.cursor = 'crosshair';
    this._stroke = null;
    this._lastPoint = null;

    // Hold-to-convert state
    this._holdTimer = null;
    this._holdAnchor = null;
    this._recognizedShape = null;
    this._previewActive = false;
  }

  onPointerDown(point) {
    this._clearHoldTimer();
    this._recognizedShape = null;
    this._previewActive = false;

    const opts = this.getToolOptions();
    this._stroke = new Stroke({
      tool: 'pen',
      color: opts.color,
      size: opts.size,
      opacity: opts.opacity
    });
    const initialWidth = opts.size;
    this._stroke.addPoint(point.x, point.y, point.pressure, point.timestamp);
    this._lastPoint = {
      x: point.x,
      y: point.y,
      pressure: point.pressure,
      timestamp: point.timestamp || Date.now(),
      midX: point.x,
      midY: point.y,
      width: initialWidth
    };
    this._holdAnchor = { x: point.x, y: point.y };

    // Clear active canvas and set up transform
    this.cm.clear('active');
    const ctx = this.activeCtx;
    this.applyTransform(ctx);

    // Draw initial dot with clean, smooth antialiased circle
    ctx.fillStyle = opts.color;
    ctx.globalAlpha = opts.opacity;
    const r = Math.max(initialWidth / 2, 0.75);
    ctx.beginPath();
    ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
    ctx.fill();

    // Start hold timer
    this._startHoldTimer();
  }

  onPointerMove(points) {
    if (!this._stroke) return;

    const lastPt = points[points.length - 1];

    // If shape was already recognized and previewing:
    if (this._previewActive) {
      // Only cancel preview if user deliberately continues drawing far away (> 28px)
      const dist = this._holdAnchor ? Math.hypot(lastPt.x - this._holdAnchor.x, lastPt.y - this._holdAnchor.y) : 0;
      if (dist > 28) {
        // Deliberate stroke continuation
        this._previewActive = false;
        this._recognizedShape = null;
        this.cm.clear('active');
        const ctx = this.activeCtx;
        this.applyTransform(ctx);
        StrokeRenderer.renderStroke(ctx, this._stroke);
        this._lastPoint = lastPt;
        this._holdAnchor = { x: lastPt.x, y: lastPt.y };
        this._startHoldTimer();
      }
      return; // Stylus is holding on screen: keep preview stable without disappearing!
    }

    const opts = this.getToolOptions();
    const ctx = this.activeCtx;

    // Add points to stroke
    this._stroke.addPoints(points);

    // Normal incremental rendering (zero latency)
    this._lastPoint = StrokeRenderer.renderSegments(
      ctx, this._lastPoint, points,
      { color: opts.color, size: opts.size, opacity: opts.opacity, tool: 'pen' }
    );

    // Check displacement from hold anchor
    if (this._holdAnchor) {
      const dist = Math.hypot(lastPt.x - this._holdAnchor.x, lastPt.y - this._holdAnchor.y);
      if (dist > 10) {
        // Pen moved beyond micro-jitter threshold -> reset anchor and restart hold timer
        this._holdAnchor = { x: lastPt.x, y: lastPt.y };
        this._startHoldTimer();
      }
      // If dist <= 10, stylus is holding still or micro-tremoring -> keep timer running
    } else {
      this._holdAnchor = { x: lastPt.x, y: lastPt.y };
      this._startHoldTimer();
    }
  }

  onPointerUp(point) {
    this._clearHoldTimer();
    if (!this._stroke) return;

    const page = this.app.currentPage;

    // Check if shape was held or if auto mode is enabled
    let shapeToCommit = (this._previewActive && this._recognizedShape) ? this._recognizedShape : null;
    if (!shapeToCommit && this.app.shapeRecognition?.enabled !== false && this.app.shapeRecognition?.mode === 'auto') {
      if (this._stroke.points && this._stroke.points.length >= 4) {
        shapeToCommit = ShapeRecognizer.recognize(this._stroke);
      }
    }

    if (shapeToCommit) {
      // User held and confirmed the converted shape on lift
      const shape = shapeToCommit;
      const convertedStroke = new Stroke({
        tool: 'shape',
        color: this._stroke.color,
        size: this._stroke.size,
        opacity: this._stroke.opacity,
        isShape: true,
        shapeType: shape.shapeType,
        shapeData: shape,
        start: shape.start,
        end: shape.end
      });
      convertedStroke.points = shape.points || [];

      if (page) {
        page.addStroke(convertedStroke);
        this.app.history.push({
          type: 'convertShape',
          stroke: convertedStroke,
          convertedStroke: convertedStroke,
          originalStroke: this._stroke,
          pageId: page.id
        });
      }
    } else {
      // Normal freehand stroke commit (no shape conversion)
      if (point.x !== undefined) {
        this._stroke.addPoint(point.x, point.y, point.pressure, point.timestamp);
      }
      if (page) {
        page.addStroke(this._stroke);
        this.app.history.push({
          type: 'addStroke',
          stroke: this._stroke,
          pageId: page.id
        });
      }
    }

    // Clear active canvas and redraw content
    this.cm.clear('active');
    this.app.redrawContent();
    this.app.scheduleSave();

    this._stroke = null;
    this._lastPoint = null;
    this._recognizedShape = null;
    this._previewActive = false;
    this._holdAnchor = null;
  }

  onCancel() {
    this._clearHoldTimer();
    this._stroke = null;
    this._lastPoint = null;
    this._recognizedShape = null;
    this._previewActive = false;
    this._holdAnchor = null;
    this.cm.clear('active');
  }

  // --- Hold-To-Convert Recognition ---

  _startHoldTimer() {
    this._clearHoldTimer();
    if (this.app.shapeRecognition?.enabled === false) return;

    const delays = { short: 350, medium: 500, long: 750 };
    const delayKey = this.app.shapeRecognition?.delay || 'medium';
    const delay = delays[delayKey] || 500;

    this._holdTimer = setTimeout(() => {
      this._onHoldTrigger();
    }, delay);
  }

  _clearHoldTimer() {
    if (this._holdTimer) {
      clearTimeout(this._holdTimer);
      this._holdTimer = null;
    }
  }

  _onHoldTrigger() {
    if (!this._stroke || !this._stroke.points || this._stroke.points.length < 4) return;

    // Fast, lightweight, offline geometric recognition (< 0.2ms)
    const shape = ShapeRecognizer.recognize(this._stroke);
    if (!shape) {
      // Low confidence or handwriting/letters/math -> preserve original drawing untouched!
      return;
    }

    this._recognizedShape = shape;
    this._previewActive = true;

    // Render clean shape preview on active canvas
    this._renderPreview(shape);
  }

  _renderPreview(shape) {
    this.cm.clear('active');
    const ctx = this.activeCtx;
    this.applyTransform(ctx);

    const opts = this.getToolOptions();

    // Render subtle preview glow and crisp vector shape
    ctx.save();
    ctx.shadowColor = 'rgba(99, 102, 241, 0.45)';
    ctx.shadowBlur = 6;
    StrokeRenderer.renderShape(
      ctx,
      shape.shapeType,
      shape.start,
      shape.end,
      opts.color,
      opts.size,
      opts.opacity,
      null,
      shape
    );
    ctx.restore();
  }
}
