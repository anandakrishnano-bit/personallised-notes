/**
 * Stroke model — efficient representation of a single drawn stroke or geometric shape.
 */
let _strokeId = 0;

export class Stroke {
  /**
   * @param {Object} opts
   * @param {string} opts.tool - pen|pencil|highlighter|brush|shape
   * @param {string} opts.color
   * @param {number} opts.size
   * @param {number} opts.opacity
   * @param {boolean} opts.isShape
   * @param {string} opts.shapeType - rectangle|circle|line|arrow|triangle|diamond|star
   * @param {Object} opts.start - { x, y }
   * @param {Object} opts.end - { x, y }
   */
  constructor(opts = {}) {
    this.id = opts.id || `s_${Date.now()}_${_strokeId++}`;
    this.type = 'stroke';
    this.tool = opts.tool || 'pen';
    this.color = opts.color || '#e8e8f0';
    this.size = opts.size || 2;
    this.opacity = opts.opacity ?? 1;
    this.points = [];  // Array of { x, y, pressure }
    this.isShape = opts.isShape || false;
    this.shapeType = opts.shapeType || null;
    this.shapeData = opts.shapeData || null;
    this.fillColor = opts.fillColor || null;
    this.start = opts.start || null;
    this.end = opts.end || null;
    this.bounds = null; // Cached bounding box
    this.timestamp = Date.now();
  }

  /** Add a point to the stroke */
  addPoint(x, y, pressure = 0.5, timestamp = Date.now()) {
    this.points.push({
      x,
      y,
      pressure: Math.max(0.01, pressure),
      timestamp: timestamp || Date.now()
    });
    this.bounds = null; // Invalidate cache
  }

  /** Add multiple points */
  addPoints(pts) {
    for (const p of pts) {
      this.points.push({
        x: p.x,
        y: p.y,
        pressure: Math.max(0.01, p.pressure || 0.5),
        timestamp: p.timestamp || Date.now()
      });
    }
    this.bounds = null;
  }

  /** Get bounding box (cached) */
  getBounds() {
    if (this.bounds) return this.bounds;

    const pad = this.size / 2 + 4;

    if (this.shapeData && this.shapeData.vertices && this.shapeData.vertices.length > 0) {
      let minX = Infinity, minY = Infinity;
      let maxX = -Infinity, maxY = -Infinity;
      for (const v of this.shapeData.vertices) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
        if (v.y < minY) minY = v.y;
        if (v.y > maxY) maxY = v.y;
      }
      this.bounds = {
        x: minX - pad,
        y: minY - pad,
        width: Math.max(1, maxX - minX) + pad * 2,
        height: Math.max(1, maxY - minY) + pad * 2
      };
      return this.bounds;
    }

    if (this.isShape && this.start && this.end) {
      const minX = Math.min(this.start.x, this.end.x);
      const minY = Math.min(this.start.y, this.end.y);
      const maxX = Math.max(this.start.x, this.end.x);
      const maxY = Math.max(this.start.y, this.end.y);
      this.bounds = {
        x: minX - pad,
        y: minY - pad,
        width: Math.max(1, maxX - minX) + pad * 2,
        height: Math.max(1, maxY - minY) + pad * 2
      };
      return this.bounds;
    }

    if (this.points.length === 0) return null;

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    for (const p of this.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }

    this.bounds = {
      x: minX - pad, y: minY - pad,
      width: maxX - minX + pad * 2,
      height: maxY - minY + pad * 2
    };
    return this.bounds;
  }

  /** Serialize for storage */
  toJSON() {
    return {
      id: this.id,
      type: this.type,
      tool: this.tool,
      color: this.color,
      size: this.size,
      opacity: this.opacity,
      points: this.points,
      isShape: this.isShape,
      shapeType: this.shapeType,
      shapeData: this.shapeData,
      fillColor: this.fillColor,
      start: this.start,
      end: this.end,
      timestamp: this.timestamp
    };
  }

  /** Deserialize from storage */
  static fromJSON(data) {
    const s = new Stroke({
      id: data.id,
      tool: data.tool,
      color: data.color,
      size: data.size,
      opacity: data.opacity,
      isShape: data.isShape,
      shapeType: data.shapeType,
      shapeData: data.shapeData,
      fillColor: data.fillColor,
      start: data.start,
      end: data.end
    });
    s.points = data.points || [];
    s.timestamp = data.timestamp || Date.now();
    return s;
  }
}
