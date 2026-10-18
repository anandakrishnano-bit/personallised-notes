import { describe, it, expect, beforeEach } from 'vitest';
import { ShapeRecognizer } from './ShapeRecognizer.js';
import { Stroke } from '../models/Stroke.js';
import { HistoryManager } from '../history/HistoryManager.js';

// Helper to simulate noisy hand-drawn stroke
function generateNoisyStroke(basePoints, noise = 1.5) {
  const points = [];
  for (let i = 0; i < basePoints.length - 1; i++) {
    const p1 = basePoints[i];
    const p2 = basePoints[i + 1];
    const steps = 12;
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const x = p1.x + t * (p2.x - p1.x) + (Math.random() - 0.5) * noise;
      const y = p1.y + t * (p2.y - p1.y) + (Math.random() - 0.5) * noise;
      points.push({ x, y, pressure: 0.5 });
    }
  }
  points.push({ ...basePoints[basePoints.length - 1], pressure: 0.5 });
  const s = new Stroke({ tool: 'pen', color: '#ff0000', size: 3 });
  s.points = points;
  return s;
}

function generateCircleStroke(cx, cy, r, noise = 2.0, pointCount = 60) {
  const points = [];
  for (let i = 0; i <= pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const rad = r + (Math.sin(angle * 3) * 0.5 + (Math.random() - 0.5) * noise);
    points.push({
      x: cx + rad * Math.cos(angle),
      y: cy + rad * Math.sin(angle),
      pressure: 0.5
    });
  }
  const s = new Stroke({ tool: 'pen', color: '#00ff00', size: 2 });
  s.points = points;
  return s;
}

function generateEllipseStroke(cx, cy, rx, ry, rotation = 0, noise = 1.5, pointCount = 60) {
  const points = [];
  const cosT = Math.cos(rotation);
  const sinT = Math.sin(rotation);
  for (let i = 0; i <= pointCount; i++) {
    const angle = (i / pointCount) * Math.PI * 2;
    const x0 = rx * Math.cos(angle) + (Math.random() - 0.5) * noise;
    const y0 = ry * Math.sin(angle) + (Math.random() - 0.5) * noise;
    points.push({
      x: cx + x0 * cosT - y0 * sinT,
      y: cy + x0 * sinT + y0 * cosT,
      pressure: 0.5
    });
  }
  const s = new Stroke({ tool: 'pen', color: '#3366ff', size: 2 });
  s.points = points;
  return s;
}

describe('Intelligent Shape Recognition', () => {

  it('recognizes a rough hand-drawn circle and preserves center & radius', () => {
    const stroke = generateCircleStroke(200, 300, 50, 2.5);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('circle');
    expect(result.center.x).toBeCloseTo(200, -1);
    expect(result.center.y).toBeCloseTo(300, -1);
    expect(result.radius).toBeCloseTo(50, -1);
  });

  it('recognizes a horizontal and rotated ellipse preserving orientation and aspect ratio', () => {
    // Horizontal ellipse
    const strokeH = generateEllipseStroke(150, 150, 80, 40, 0, 1.5);
    const resultH = ShapeRecognizer.recognize(strokeH);
    expect(resultH).not.toBeNull();
    expect(resultH.isEllipse).toBe(true);
    expect(resultH.rx).toBeGreaterThan(resultH.ry);

    // Rotated ellipse at 45 degrees
    const strokeR = generateEllipseStroke(300, 300, 90, 45, Math.PI / 4, 1.5);
    const resultR = ShapeRecognizer.recognize(strokeR);
    expect(resultR).not.toBeNull();
    expect(resultR.isEllipse).toBe(true);
    expect(resultR.rotation).toBeCloseTo(Math.PI / 4, 0.2);
  });

  it('recognizes a wide rectangle and preserves its dimensions', () => {
    const base = [
      { x: 100, y: 100 },
      { x: 300, y: 100 },
      { x: 300, y: 180 },
      { x: 100, y: 180 },
      { x: 100, y: 100 }
    ];
    const stroke = generateNoisyStroke(base, 1.2);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('rectangle');
    expect(result.width).toBeCloseTo(200, -1);
    expect(result.height).toBeCloseTo(80, -1);
  });

  it('recognizes a tall narrow rectangle', () => {
    const base = [
      { x: 100, y: 100 },
      { x: 140, y: 100 },
      { x: 140, y: 320 },
      { x: 100, y: 320 },
      { x: 100, y: 100 }
    ];
    const stroke = generateNoisyStroke(base, 1.0);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('rectangle');
    expect(result.height).toBeGreaterThan(result.width * 2);
  });

  it('recognizes a square with approximately equal sides', () => {
    const base = [
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 150, y: 150 },
      { x: 50, y: 150 },
      { x: 50, y: 50 }
    ];
    const stroke = generateNoisyStroke(base, 1.2);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('rectangle');
    expect(result.isSquare).toBe(true);
  });

  it('recognizes a rotated rectangle and preserves orientation', () => {
    // 30 degree rotated box
    const cx = 200, cy = 200, w = 120, h = 60, rot = Math.PI / 6;
    const cosT = Math.cos(rot);
    const sinT = Math.sin(rot);
    const r = (x, y) => ({
      x: cx + x * cosT - y * sinT,
      y: cy + x * sinT + y * cosT
    });
    const base = [
      r(-w/2, -h/2),
      r(w/2, -h/2),
      r(w/2, h/2),
      r(-w/2, h/2),
      r(-w/2, -h/2)
    ];
    const stroke = generateNoisyStroke(base, 1.0);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('rectangle');
    expect(result.rotation).toBeCloseTo(rot, 0.2);
  });

  it('recognizes triangles in different orientations', () => {
    // Upright triangle
    const base1 = [
      { x: 200, y: 50 },
      { x: 280, y: 180 },
      { x: 120, y: 180 },
      { x: 200, y: 50 }
    ];
    const stroke1 = generateNoisyStroke(base1, 1.2);
    const result1 = ShapeRecognizer.recognize(stroke1);

    expect(result1).not.toBeNull();
    expect(result1.shapeType).toBe('triangle');
    expect(result1.vertices.length).toBe(3);

    // Right-angled triangle
    const base2 = [
      { x: 100, y: 100 },
      { x: 220, y: 100 },
      { x: 100, y: 220 },
      { x: 100, y: 100 }
    ];
    const stroke2 = generateNoisyStroke(base2, 1.0);
    const result2 = ShapeRecognizer.recognize(stroke2);

    expect(result2).not.toBeNull();
    expect(result2.shapeType).toBe('triangle');
  });

  it('recognizes straight lines with angle snapping', () => {
    // Horizontal line
    const pointsH = [];
    for (let i = 0; i <= 20; i++) {
      pointsH.push({ x: 50 + i * 10, y: 200 + (Math.random() - 0.5) * 1.5, pressure: 0.5 });
    }
    const strokeH = new Stroke({ tool: 'pen' });
    strokeH.points = pointsH;
    const resultH = ShapeRecognizer.recognize(strokeH);

    expect(resultH).not.toBeNull();
    expect(resultH.shapeType).toBe('line');
    // Snapped to exact horizontal
    expect(resultH.start.y).toBe(resultH.end.y);

    // Vertical line
    const pointsV = [];
    for (let i = 0; i <= 20; i++) {
      pointsV.push({ x: 300 + (Math.random() - 0.5) * 1.5, y: 50 + i * 10, pressure: 0.5 });
    }
    const strokeV = new Stroke({ tool: 'pen' });
    strokeV.points = pointsV;
    const resultV = ShapeRecognizer.recognize(strokeV);

    expect(resultV).not.toBeNull();
    expect(resultV.shapeType).toBe('line');
    // Snapped to exact vertical
    expect(resultV.start.x).toBe(resultV.end.x);
  });

  it('recognizes single-stroke arrows', () => {
    const points = [];
    // Stem
    for (let i = 0; i <= 25; i++) {
      points.push({ x: 50 + i * 8, y: 150, pressure: 0.5 });
    }
    // Arrowhead return fold
    points.push({ x: 235, y: 140, pressure: 0.5 });
    points.push({ x: 220, y: 130, pressure: 0.5 });

    const stroke = new Stroke({ tool: 'pen' });
    stroke.points = points;
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('arrow');
  });

  it('recognizes a diamond (rhombus)', () => {
    const base = [
      { x: 150, y: 50 },
      { x: 230, y: 150 },
      { x: 150, y: 250 },
      { x: 70, y: 150 },
      { x: 150, y: 50 }
    ];
    const stroke = generateNoisyStroke(base, 1.0);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('diamond');
    expect(result.vertices.length).toBe(4);
  });

  it('recognizes a regular polygon (pentagon)', () => {
    const base = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
      base.push({ x: 200 + 80 * Math.cos(a), y: 200 + 80 * Math.sin(a) });
    }
    base.push({ ...base[0] });
    const stroke = generateNoisyStroke(base, 1.0);
    const result = ShapeRecognizer.recognize(stroke);

    expect(result).not.toBeNull();
    expect(result.shapeType).toBe('polygon');
    expect(result.vertices.length).toBe(5);
  });

  it('rejects ordinary handwriting, letters, and math symbols without converting them', () => {
    // Letter 'S'
    const pointsS = [
      { x: 100, y: 50 }, { x: 80, y: 60 }, { x: 90, y: 80 },
      { x: 110, y: 100 }, { x: 100, y: 120 }, { x: 75, y: 115 }
    ].map(p => ({ ...p, pressure: 0.5 }));
    const strokeS = new Stroke({ tool: 'pen' });
    strokeS.points = pointsS;
    expect(ShapeRecognizer.recognize(strokeS)).toBeNull();

    // Math symbol '+' (single stroke cross)
    const pointsPlus = [
      { x: 100, y: 50 }, { x: 100, y: 150 },
      { x: 100, y: 100 }, { x: 50, y: 100 }, { x: 150, y: 100 }
    ].map(p => ({ ...p, pressure: 0.5 }));
    const strokePlus = new Stroke({ tool: 'pen' });
    strokePlus.points = pointsPlus;
    expect(ShapeRecognizer.recognize(strokePlus)).toBeNull();

    // Fast cursive squiggle
    const pointsSquiggle = [];
    for (let x = 0; x < 200; x += 5) {
      pointsSquiggle.push({ x, y: 100 + Math.sin(x * 0.2) * 25, pressure: 0.5 });
    }
    const strokeSquiggle = new Stroke({ tool: 'pen' });
    strokeSquiggle.points = pointsSquiggle;
    expect(ShapeRecognizer.recognize(strokeSquiggle)).toBeNull();
  });

  it('handles clean single-step undo and redo in HistoryManager', () => {
    const history = new HistoryManager();
    const mockPage = {
      id: 'page_1',
      strokes: [],
      modifiedAt: Date.now()
    };

    const originalStroke = new Stroke({ id: 's_orig', tool: 'pen' });
    const convertedStroke = new Stroke({ id: 's_clean', tool: 'shape', isShape: true });

    // User draws and converts shape
    mockPage.strokes.push(convertedStroke);
    history.push({
      type: 'convertShape',
      originalStroke,
      convertedStroke,
      stroke: convertedStroke,
      pageId: 'page_1'
    });

    expect(mockPage.strokes.length).toBe(1);
    expect(mockPage.strokes[0].id).toBe('s_clean');

    // Undo: immediately removes the shape ("undo whatever i do")
    const undone = history.undo(mockPage);
    expect(undone).toBe(true);
    expect(mockPage.strokes.length).toBe(0);

    // Redo: restores the shape
    const redone = history.redo(mockPage);
    expect(redone).toBe(true);
    expect(mockPage.strokes.length).toBe(1);
    expect(mockPage.strokes[0].id).toBe('s_clean');
  });

});
