/**
 * CanvasManager — Multi-layer canvas system for low-latency drawing.
 * 
 * Architecture (bottom to top):
 *   Layer 0: background — page color, template pattern, PDF page
 *   Layer 1: content    — all completed strokes, shapes, images, text
 *   Layer 2: active     — current stroke being drawn (cleared per-frame)
 *   Layer 3: ui         — selection handles, cursor overlay, guides
 *
 * The active layer uses { desynchronized: true } which tells Chrome to
 * bypass the compositor, cutting 1-2 frames of latency.
 */
export class CanvasManager {
  constructor(container) {
    this.container = container;
    this.layers = {};
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
    this._zoom = 1;
    this._panX = 0;
    this._panY = 0;
    this._pageWidth = 794;   // A4 at 96 DPI
    this._pageHeight = 1123; // A4 at 96 DPI

    // Create layers bottom-to-top
    const layerNames = ['background', 'content', 'active', 'ui'];
    layerNames.forEach((name, i) => {
      const canvas = document.createElement('canvas');
      canvas.className = `canvas-layer canvas-${name}`;
      canvas.style.zIndex = i;
      container.appendChild(canvas);

      // desynchronized on active layer = lower latency
      const ctxOptions = { alpha: name !== 'background' };
      if (name === 'active') {
        ctxOptions.desynchronized = true;
      }
      const ctx = canvas.getContext('2d', ctxOptions);
      this.layers[name] = { canvas, ctx };
    });

    // Pointer events go on the top-most (ui) canvas
    this.eventCanvas = this.layers.ui.canvas;

    // Observe resize
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
  }

  /** Resize all canvases to match container */
  resize() {
    const prevWidth = this.width;
    const prevHeight = this.height;
    const rect = this.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    this.dpr = window.devicePixelRatio || 1;

    for (const layer of Object.values(this.layers)) {
      const { canvas, ctx } = layer;
      canvas.width = Math.round(rect.width * this.dpr);
      canvas.height = Math.round(rect.height * this.dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(this.dpr, this.dpr);
    }

    // Keep page centered when resizing window
    if (prevWidth && prevHeight && (prevWidth !== this.width || prevHeight !== this.height)) {
      const dX = (this.width - prevWidth) / 2;
      const dY = (this.height - prevHeight) / 2;
      this._panX += dX;
      this._panY += dY;
    }

    // Notify listeners
    if (this.onResize) this.onResize(this.width, this.height);
  }

  /** Get a layer's 2D context */
  getCtx(name) {
    return this.layers[name]?.ctx;
  }

  /** Get a layer's canvas element */
  getCanvas(name) {
    return this.layers[name]?.canvas;
  }

  /** Clear a specific layer and reset any dirty clipping paths */
  clear(name) {
    const layer = this.layers[name];
    if (!layer) return;
    const { ctx, canvas } = layer;
    if (typeof ctx.reset === 'function') {
      ctx.reset();
    } else {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }

  /** Clear all layers */
  clearAll() {
    for (const name of Object.keys(this.layers)) {
      this.clear(name);
    }
  }

  /** Set page dimensions */
  setPageSize(w, h) {
    this._pageWidth = w;
    this._pageHeight = h;
  }

  /** Set zoom level */
  get zoom() { return this._zoom; }
  set zoom(v) {
    this._zoom = Math.max(0.1, Math.min(10, v));
  }

  /** Pan offset */
  get panX() { return this._panX; }
  set panX(v) { this._panX = v; }
  get panY() { return this._panY; }
  set panY(v) { this._panY = v; }

  get pageWidth() { return this._pageWidth; }
  get pageHeight() { return this._pageHeight; }

  /** Convert screen (CSS px) coords to document coords */
  screenToDoc(sx, sy) {
    return {
      x: (sx - this._panX) / this._zoom,
      y: (sy - this._panY) / this._zoom
    };
  }

  /** Convert document coords to screen coords */
  docToScreen(dx, dy) {
    return {
      x: dx * this._zoom + this._panX,
      y: dy * this._zoom + this._panY
    };
  }

  /** Apply pan/zoom transform to a context */
  applyTransform(ctx) {
    ctx.setTransform(
      this.dpr * this._zoom, 0,
      0, this.dpr * this._zoom,
      this.dpr * this._panX,
      this.dpr * this._panY
    );
  }

  /** Clip context to page sheet boundary (prevents drawing outside page if not infinite) */
  applyPageClip(ctx, page) {
    CanvasManager.applyPageClip(ctx, page, this._pageWidth, this._pageHeight);
  }

  static applyPageClip(ctx, page, defaultW = 794, defaultH = 1123) {
    if (page && !page.isInfinite) {
      const w = page.width || defaultW;
      const h = page.height || defaultH;
      ctx.beginPath();
      ctx.rect(0, 0, w, h);
      ctx.clip();
    }
  }

  /** Reset transform (screen space at DPR scale) */
  resetTransform(ctx) {
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** Center the page in the viewport */
  centerPage() {
    const scaleToFit = Math.min(
      (this.width - 40) / this._pageWidth,
      (this.height - 20) / this._pageHeight
    );
    this._zoom = Math.min(scaleToFit, 1.5);
    this._panX = (this.width - this._pageWidth * this._zoom) / 2;
    this._panY = Math.max(10, (this.height - this._pageHeight * this._zoom) / 2);
  }

  /** Zoom to fit content */
  fitToWidth() {
    this._zoom = (this.width - 40) / this._pageWidth;
    this._panX = (this.width - this._pageWidth * this._zoom) / 2;
    this._panY = 10;
  }

  /** Destroy and clean up */
  destroy() {
    this._ro.disconnect();
    for (const { canvas } of Object.values(this.layers)) {
      canvas.remove();
    }
    this.layers = {};
  }
}
