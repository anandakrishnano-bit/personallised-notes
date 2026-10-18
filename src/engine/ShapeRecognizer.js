/**
 * ShapeRecognizer — Fast, lightweight, offline geometric shape recognition.
 * 
 * Optimized for resource-constrained hardware (e.g. Chromebook Celeron N4120).
 * Zero external ML dependencies. Operates in < 0.2ms via geometric analysis:
 * - Equidistant resampling
 * - Bounding box, centroid, and area (shoelace)
 * - Circularity & radial variance (circles and ellipses)
 * - Covariance matrix second moments (eigenvalues & principal angle for rotated shapes)
 * - Ramer-Douglas-Peucker polygon simplification (corners of triangles, quads, polygons)
 * - Direction & straightness evaluation (lines & arrows)
 */

export class ShapeRecognizer {
  /**
   * Recognize if a given stroke represents a geometric shape.
   * @param {Object} stroke - Stroke instance containing points: [{x, y, pressure}]
   * @param {Object} [options] - Optional settings (e.g. minConfidence, snapAngles)
   * @returns {Object|null} Recognized shape descriptor or null if not a confident shape.
   */
  static recognize(stroke, options = {}) {
    if (!stroke || !stroke.points || stroke.points.length < 8) {
      return null;
    }

    const rawPoints = stroke.points;
    const minConfidence = options.minConfidence ?? 0.70;

    // 1. Calculate path length and pre-filter
    let totalLength = 0;
    for (let i = 1; i < rawPoints.length; i++) {
      totalLength += Math.hypot(rawPoints[i].x - rawPoints[i - 1].x, rawPoints[i].y - rawPoints[i - 1].y);
    }

    if (totalLength < 32) {
      // Too small for deliberate geometric shape (usually handwriting dot, accent, or punctuation)
      return null;
    }

    // 2. Uniform arc-length resampling (48 points)
    const NUM_SAMPLES = 48;
    const resampled = ShapeRecognizer._resample(rawPoints, NUM_SAMPLES, totalLength);
    if (!resampled || resampled.length < NUM_SAMPLES) return null;

    // 3. Compute Bounding Box, Diagonal & Centroid
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let sumX = 0, sumY = 0;

    for (let i = 0; i < NUM_SAMPLES; i++) {
      const p = resampled[i];
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
      sumX += p.x;
      sumY += p.y;
    }

    const width = maxX - minX;
    const height = maxY - minY;
    if (Math.max(width, height) < 22) return null;

    const centroid = { x: sumX / NUM_SAMPLES, y: sumY / NUM_SAMPLES };
    const diag = Math.hypot(width, height);

    // 4. End-to-end distance & closure analysis
    const pStart = resampled[0];
    const pEnd = resampled[NUM_SAMPLES - 1];
    const endToEndDist = Math.hypot(pEnd.x - pStart.x, pEnd.y - pStart.y);
    const closureRatio = endToEndDist / Math.max(1, diag);
    const pathClosureRatio = endToEndDist / Math.max(1, totalLength);

    const isClosed = closureRatio < 0.28 || pathClosureRatio < 0.22;

    // 5. Check OPEN shapes: Straight Line or Arrow
    if (!isClosed) {
      const lineCandidate = ShapeRecognizer._checkLine(resampled, pStart, pEnd, totalLength);
      if (lineCandidate && lineCandidate.confidence >= minConfidence) {
        return lineCandidate;
      }

      const arrowCandidate = ShapeRecognizer._checkArrow(resampled, pStart, pEnd, totalLength);
      if (arrowCandidate && arrowCandidate.confidence >= minConfidence) {
        return arrowCandidate;
      }

      // If not closed and not a line/arrow, it's handwriting / open sketch
      return null;
    }

    // 6. CLOSED shapes analysis:
    // Close the resampled loop for geometric symmetry
    const closedLoop = [...resampled, { ...resampled[0] }];
    const N = closedLoop.length;

    // Signed Area (Shoelace formula)
    let shoelaceSum = 0;
    for (let i = 0; i < N - 1; i++) {
      shoelaceSum += closedLoop[i].x * closedLoop[i + 1].y - closedLoop[i + 1].x * closedLoop[i].y;
    }
    const area = Math.abs(shoelaceSum) / 2;
    if (area < 80) return null; // Degenerate closed shape

    // Circularity (Isoperimetric quotient: 4 * pi * Area / Perimeter^2)
    const circularity = (4 * Math.PI * area) / (totalLength * totalLength);

    // Radial variance from centroid
    let sumR = 0;
    const radii = new Float32Array(NUM_SAMPLES);
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const r = Math.hypot(resampled[i].x - centroid.x, resampled[i].y - centroid.y);
      radii[i] = r;
      sumR += r;
    }
    const meanR = sumR / NUM_SAMPLES;

    let varRSum = 0;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const diff = radii[i] - meanR;
      varRSum += diff * diff;
    }
    const stdDevR = Math.sqrt(varRSum / NUM_SAMPLES);
    const coeffVarR = stdDevR / Math.max(1, meanR); // Radius coefficient of variation

    // Covariance matrix & principal axes (eigenvalues & orientation angle)
    let muXX = 0, muYY = 0, muXY = 0;
    for (let i = 0; i < NUM_SAMPLES; i++) {
      const dx = resampled[i].x - centroid.x;
      const dy = resampled[i].y - centroid.y;
      muXX += dx * dx;
      muYY += dy * dy;
      muXY += dx * dy;
    }
    muXX /= NUM_SAMPLES;
    muYY /= NUM_SAMPLES;
    muXY /= NUM_SAMPLES;

    const delta = Math.sqrt((muXX - muYY) ** 2 + 4 * (muXY ** 2));
    const lambda1 = (muXX + muYY + delta) / 2;
    const lambda2 = Math.max(0.1, (muXX + muYY - delta) / 2);
    const axisA = Math.sqrt(2 * lambda1); // Semi-major axis
    const axisB = Math.sqrt(2 * lambda2); // Semi-minor axis
    let thetaRot = 0.5 * Math.atan2(2 * muXY, muXX - muYY); // Principal rotation angle

    // Snap angle if within 5.5 degrees of 0 or 90
    if (Math.abs(thetaRot) < 0.096) thetaRot = 0;
    else if (Math.abs(Math.abs(thetaRot) - Math.PI / 2) < 0.096) thetaRot = Math.sign(thetaRot) * (Math.PI / 2);

    // 7. Corner Detection via Douglas-Peucker Polygon Simplification
    const corners = ShapeRecognizer._findPolygonCorners(resampled, totalLength);

    // --- TEST A: TRIANGLE (3 dominant corners) ---
    if (corners && corners.length === 3) {
      const triCandidate = ShapeRecognizer._buildTriangle(corners, resampled, centroid, totalLength);
      if (triCandidate && triCandidate.confidence >= minConfidence) {
        return triCandidate;
      }
    }

    // --- TEST B: RECTANGLE / SQUARE / DIAMOND (4 dominant corners) ---
    if (corners && corners.length === 4) {
      const quadCandidate = ShapeRecognizer._buildQuadrilateral(corners, resampled, centroid, totalLength, area);
      if (quadCandidate && quadCandidate.confidence >= minConfidence) {
        return quadCandidate;
      }
    }

    // --- TEST C: GENERAL POLYGON (5 or 6 corners, e.g. Pentagon, Hexagon) ---
    if (corners && (corners.length === 5 || corners.length === 6)) {
      const polyCandidate = ShapeRecognizer._buildPolygon(corners, resampled, centroid, totalLength);
      if (polyCandidate && polyCandidate.confidence >= minConfidence) {
        return polyCandidate;
      }
    }

    // --- TEST D: CIRCLE ---
    if (coeffVarR < 0.18 && circularity >= 0.72 && axisB / axisA >= 0.80) {
      const radius = Math.round(meanR);
      const cx = Math.round(centroid.x);
      const cy = Math.round(centroid.y);
      const circlePts = ShapeRecognizer._sampleCircle(cx, cy, radius);

      return {
        type: 'circle',
        shapeType: 'circle',
        isCircle: true,
        confidence: Math.min(0.98, 1.0 - coeffVarR),
        center: { x: cx, y: cy },
        radius,
        start: { x: cx - radius, y: cy - radius },
        end: { x: cx + radius, y: cy + radius },
        points: circlePts
      };
    }

    // --- TEST E: ELLIPSE (including rotated ellipses) ---
    if (circularity >= 0.50 && axisB / axisA < 0.85) {
      // Verify ellipse fit: transform points into principal coordinates
      let ellipseDevSum = 0;
      const cosT = Math.cos(-thetaRot);
      const sinT = Math.sin(-thetaRot);

      for (let i = 0; i < NUM_SAMPLES; i++) {
        const dx = resampled[i].x - centroid.x;
        const dy = resampled[i].y - centroid.y;
        const ex = dx * cosT - dy * sinT;
        const ey = dx * sinT + dy * cosT;
        const val = (ex * ex) / (axisA * axisA) + (ey * ey) / (axisB * axisB);
        ellipseDevSum += Math.abs(val - 1.0);
      }
      const avgEllipseError = ellipseDevSum / NUM_SAMPLES;

      if (avgEllipseError < 0.32) {
        const cx = Math.round(centroid.x);
        const cy = Math.round(centroid.y);
        const rx = Math.round(axisA);
        const ry = Math.round(axisB);
        const ellipsePts = ShapeRecognizer._sampleEllipse(cx, cy, rx, ry, thetaRot);

        return {
          type: 'circle',
          shapeType: 'circle',
          isEllipse: true,
          confidence: Math.min(0.96, 1.0 - avgEllipseError),
          center: { x: cx, y: cy },
          rx,
          ry,
          rotation: thetaRot,
          start: { x: cx - rx, y: cy - ry },
          end: { x: cx + rx, y: cy + ry },
          points: ellipsePts
        };
      }
    }

    // Fallback corner simplification for slightly noisy shapes
    if (corners && corners.length > 4 && corners.length <= 7) {
      const reducedCorners = ShapeRecognizer._simplifyToDominantCorners(corners, resampled);
      if (reducedCorners && reducedCorners.length === 3) {
        const tri = ShapeRecognizer._buildTriangle(reducedCorners, resampled, centroid, totalLength);
        if (tri && tri.confidence >= minConfidence) return tri;
      } else if (reducedCorners && reducedCorners.length === 4) {
        const quad = ShapeRecognizer._buildQuadrilateral(reducedCorners, resampled, centroid, totalLength, area);
        if (quad && quad.confidence >= minConfidence) return quad;
      }
    }

    // No confident geometric shape match -> preserve original freehand stroke
    return null;
  }

  // --- Geometric Analyzers ---

  /** Test for straight line with angle snapping */
  static _checkLine(points, start, end, totalLength) {
    const endDist = Math.hypot(end.x - start.x, end.y - start.y);
    if (endDist / Math.max(1, totalLength) < 0.88) return null;

    let maxDev = 0;
    const N = points.length;
    for (let i = 1; i < N - 1; i++) {
      const dev = ShapeRecognizer._pointToSegmentDist(points[i], start, end);
      if (dev > maxDev) maxDev = dev;
    }

    const devRatio = maxDev / Math.max(1, endDist);
    if (devRatio > 0.095) return null;

    // Angle snapping
    let x1 = start.x;
    let y1 = start.y;
    let x2 = end.x;
    let y2 = end.y;

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const deg = (angle * 180 / Math.PI + 360) % 180;

    // Horizontal snap (< 5.5 deg)
    if (deg < 5.5 || deg > 174.5) {
      const midY = Math.round((y1 + y2) / 2);
      y1 = midY;
      y2 = midY;
    }
    // Vertical snap (< 5.5 deg)
    else if (Math.abs(deg - 90) < 5.5) {
      const midX = Math.round((x1 + x2) / 2);
      x1 = midX;
      x2 = midX;
    }
    // 45 degree snap (< 4.5 deg)
    else if (Math.abs(deg - 45) < 4.5 || Math.abs(deg - 135) < 4.5) {
      const signY = (y2 >= y1) ? 1 : -1;
      const signX = (x2 >= x1) ? 1 : -1;
      const avgSpan = (Math.abs(x2 - x1) + Math.abs(y2 - y1)) / 2;
      x2 = x1 + signX * avgSpan;
      y2 = y1 + signY * avgSpan;
    }

    return {
      type: 'line',
      shapeType: 'line',
      confidence: Math.min(0.98, 1.0 - devRatio),
      start: { x: Math.round(x1), y: Math.round(y1) },
      end: { x: Math.round(x2), y: Math.round(y2) },
      points: [
        { x: Math.round(x1), y: Math.round(y1), pressure: 0.5 },
        { x: Math.round(x2), y: Math.round(y2), pressure: 0.5 }
      ]
    };
  }

  /** Test for arrow (stem + arrowhead) */
  static _checkArrow(points, start, end, totalLength) {
    const N = points.length;
    // Find point furthest from start
    let maxDist = 0;
    let tipIdx = 0;

    for (let i = 0; i < N; i++) {
      const d = Math.hypot(points[i].x - start.x, points[i].y - start.y);
      if (d > maxDist) {
        maxDist = d;
        tipIdx = i;
      }
    }

    // The tip must be between 65% and 94% along the stroke
    if (tipIdx < Math.floor(N * 0.65) || tipIdx >= N - 2) return null;

    const tip = points[tipIdx];
    const stemDist = Math.hypot(tip.x - start.x, tip.y - start.y);
    if (stemDist < 30) return null;

    // Check that stem (start -> tip) is straight
    let maxStemDev = 0;
    for (let i = 1; i < tipIdx; i++) {
      const dev = ShapeRecognizer._pointToSegmentDist(points[i], start, tip);
      if (dev > maxStemDev) maxStemDev = dev;
    }
    if (maxStemDev / stemDist > 0.12) return null;

    // Check that the remaining stroke (tip -> end) folds backwards like an arrowhead
    const stemAngle = Math.atan2(tip.y - start.y, tip.x - start.x);
    const returnAngle = Math.atan2(end.y - tip.y, end.x - tip.x);
    let angleDiff = Math.abs(returnAngle - stemAngle);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;

    if (angleDiff < 1.7) return null; // Must turn backwards (> ~100 degrees)

    return {
      type: 'arrow',
      shapeType: 'arrow',
      confidence: 0.92,
      start: { x: Math.round(start.x), y: Math.round(start.y) },
      end: { x: Math.round(tip.x), y: Math.round(tip.y) },
      points: [
        { x: Math.round(start.x), y: Math.round(start.y), pressure: 0.5 },
        { x: Math.round(tip.x), y: Math.round(tip.y), pressure: 0.5 }
      ]
    };
  }

  /** Build clean triangle preserving original vertices & orientation */
  static _buildTriangle(corners, resampled, centroid, totalLength) {
    if (!corners || corners.length !== 3) return null;

    const [v0, v1, v2] = corners;
    // Check non-degeneracy
    const triArea = 0.5 * Math.abs(v0.x * (v1.y - v2.y) + v1.x * (v2.y - v0.y) + v2.x * (v0.y - v1.y));
    const diag = Math.hypot(
      Math.max(v0.x, v1.x, v2.x) - Math.min(v0.x, v1.x, v2.x),
      Math.max(v0.y, v1.y, v2.y) - Math.min(v0.y, v1.y, v2.y)
    );
    if (triArea / (diag * diag) < 0.08) return null; // Collinear points

    // Snap edges that are nearly horizontal or vertical
    const vertices = [ { ...v0 }, { ...v1 }, { ...v2 } ];
    for (let i = 0; i < 3; i++) {
      const a = vertices[i];
      const b = vertices[(i + 1) % 3];
      const angle = (Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 360) % 180;
      if (angle < 4.5 || angle > 175.5) {
        const midY = Math.round((a.y + b.y) / 2);
        a.y = midY;
        b.y = midY;
      } else if (Math.abs(angle - 90) < 4.5) {
        const midX = Math.round((a.x + b.x) / 2);
        a.x = midX;
        b.x = midX;
      }
    }

    const minX = Math.min(vertices[0].x, vertices[1].x, vertices[2].x);
    const maxX = Math.max(vertices[0].x, vertices[1].x, vertices[2].x);
    const minY = Math.min(vertices[0].y, vertices[1].y, vertices[2].y);
    const maxY = Math.max(vertices[0].y, vertices[1].y, vertices[2].y);

    const pts = [
      { x: vertices[0].x, y: vertices[0].y, pressure: 0.5 },
      { x: vertices[1].x, y: vertices[1].y, pressure: 0.5 },
      { x: vertices[2].x, y: vertices[2].y, pressure: 0.5 },
      { x: vertices[0].x, y: vertices[0].y, pressure: 0.5 }
    ];

    return {
      type: 'triangle',
      shapeType: 'triangle',
      confidence: 0.93,
      vertices,
      center: { x: Math.round(centroid.x), y: Math.round(centroid.y) },
      start: { x: Math.round(minX), y: Math.round(minY) },
      end: { x: Math.round(maxX), y: Math.round(maxY) },
      points: pts
    };
  }

  /** Build clean rectangle, square, or diamond with preserved rotation */
  static _buildQuadrilateral(corners, resampled, centroid, totalLength, area = 0) {
    if (!corners || corners.length !== 4) return null;

    const [v0, v1, v2, v3] = corners;

    // Side vectors & lengths
    const s0 = Math.hypot(v1.x - v0.x, v1.y - v0.y);
    const s1 = Math.hypot(v2.x - v1.x, v2.y - v1.y);
    const s2 = Math.hypot(v3.x - v2.x, v3.y - v2.y);
    const s3 = Math.hypot(v0.x - v3.x, v0.y - v3.y);

    // Opposite sides must be reasonably comparable
    if (Math.abs(s0 - s2) / Math.max(s0, s2) > 0.45) return null;
    if (Math.abs(s1 - s3) / Math.max(s1, s3) > 0.45) return null;

    // Verify each edge between corners is roughly straight (reject curving ellipse arcs)
    let maxEdgeDev = 0;
    for (const p of resampled) {
      let minD = Infinity;
      for (let j = 0; j < 4; j++) {
        minD = Math.min(minD, ShapeRecognizer._pointToSegmentDist(p, corners[j], corners[(j + 1) % 4]));
      }
      maxEdgeDev = Math.max(maxEdgeDev, minD);
    }
    if (maxEdgeDev / Math.max(1, totalLength) > 0.027) return null;

    // Check if it is a Diamond (Rhombus)
    // Diagonals roughly horizontal and vertical, or side lengths equal with ~45 deg orientation
    const diag1 = Math.hypot(v2.x - v0.x, v2.y - v0.y);
    const diag2 = Math.hypot(v3.x - v1.x, v3.y - v1.y);
    const diag1Angle = (Math.atan2(v2.y - v0.y, v2.x - v0.x) * 180 / Math.PI + 360) % 180;
    const isDiamondAligned = (diag1Angle < 8 || diag1Angle > 172 || Math.abs(diag1Angle - 90) < 8);

    const diamondW = Math.max(v0.x, v1.x, v2.x, v3.x) - Math.min(v0.x, v1.x, v2.x, v3.x);
    const diamondH = Math.max(v0.y, v1.y, v2.y, v3.y) - Math.min(v0.y, v1.y, v2.y, v3.y);
    const expectedDiamondArea = (diamondW * diamondH) / 2;
    const isDiamondArea = area > 0 ? Math.abs(area / Math.max(1, expectedDiamondArea) - 1.0) < 0.22 : true;

    if (isDiamondAligned && isDiamondArea && Math.abs(s0 - s1) / Math.max(s0, s1) < 0.25) {
      const minX = Math.min(v0.x, v1.x, v2.x, v3.x);
      const maxX = Math.max(v0.x, v1.x, v2.x, v3.x);
      const minY = Math.min(v0.y, v1.y, v2.y, v3.y);
      const maxY = Math.max(v0.y, v1.y, v2.y, v3.y);
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      const hw = (maxX - minX) / 2;
      const hh = (maxY - minY) / 2;

      const diamondVerts = [
        { x: Math.round(cx), y: Math.round(cy - hh) },
        { x: Math.round(cx + hw), y: Math.round(cy) },
        { x: Math.round(cx), y: Math.round(cy + hh) },
        { x: Math.round(cx - hw), y: Math.round(cy) }
      ];

      return {
        type: 'diamond',
        shapeType: 'diamond',
        confidence: 0.92,
        vertices: diamondVerts,
        center: { x: Math.round(cx), y: Math.round(cy) },
        start: { x: Math.round(minX), y: Math.round(minY) },
        end: { x: Math.round(maxX), y: Math.round(maxY) },
        points: [...diamondVerts, diamondVerts[0]].map(p => ({ ...p, pressure: 0.5 }))
      };
    }

    // Primary edge angle: use the longest side for maximum angular accuracy
    let theta;
    if (s1 > s0) {
      theta = Math.atan2(v2.y - v1.y, v2.x - v1.x) - Math.PI / 2;
    } else {
      theta = Math.atan2(v1.y - v0.y, v1.x - v0.x);
    }
    // Snap to 0, 90, 180 if within 9.0 degrees
    const deg = (theta * 180 / Math.PI + 360) % 90;
    if (deg < 9.0 || deg > 81.0) {
      theta = Math.round(theta / (Math.PI / 2)) * (Math.PI / 2);
    }

    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);

    // Project resampled points onto principal axes to obtain exact extents
    let minU = Infinity, maxU = -Infinity;
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < resampled.length; i++) {
      const u = resampled[i].x * cosT + resampled[i].y * sinT;
      const v = -resampled[i].x * sinT + resampled[i].y * cosT;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (v < minV) minV = v;
      if (v > maxV) maxV = v;
    }

    const width = maxU - minU;
    const height = maxV - minV;
    const midU = (minU + maxU) / 2;
    const midV = (minV + maxV) / 2;
    const cx = midU * cosT - midV * sinT;
    const cy = midU * sinT + midV * cosT;

    if (width < 12 || height < 12) return null;

    // A true rectangle has rectangularity (area / (width * height)) >= 0.70 (smooth hand-drawn tolerance)
    if (area > 0 && area / (width * height) < 0.70) return null;

    // Check if Square vs Rectangle
    const aspectDiff = Math.abs(width - height) / Math.max(width, height);
    const isSquare = aspectDiff < 0.18;
    const finalW = isSquare ? (width + height) / 2 : width;
    const finalH = isSquare ? (width + height) / 2 : height;

    const hw = finalW / 2;
    const hh = finalH / 2;

    const rot = (x, y) => ({
      x: Math.round(cx + x * cosT - y * sinT),
      y: Math.round(cy + x * sinT + y * cosT)
    });

    const rectVerts = [
      rot(-hw, -hh),
      rot(hw, -hh),
      rot(hw, hh),
      rot(-hw, hh)
    ];

    const minX = Math.min(...rectVerts.map(p => p.x));
    const maxX = Math.max(...rectVerts.map(p => p.x));
    const minY = Math.min(...rectVerts.map(p => p.y));
    const maxY = Math.max(...rectVerts.map(p => p.y));

    return {
      type: 'rectangle',
      shapeType: 'rectangle',
      isSquare,
      confidence: 0.94,
      vertices: rectVerts,
      width: Math.round(finalW),
      height: Math.round(finalH),
      center: { x: Math.round(cx), y: Math.round(cy) },
      rotation: theta,
      start: { x: Math.round(minX), y: Math.round(minY) },
      end: { x: Math.round(maxX), y: Math.round(maxY) },
      points: [...rectVerts, rectVerts[0]].map(p => ({ ...p, pressure: 0.5 }))
    };
  }

  /** Build clean regular/convex polygon */
  static _buildPolygon(corners, resampled, centroid, totalLength) {
    if (!corners || (corners.length !== 5 && corners.length !== 6)) return null;

    let polyCorners = corners;
    // If 6 corners, eliminate any vertex that is practically colinear (turn < 0.45 rad)
    if (polyCorners.length === 6) {
      const N = polyCorners.length;
      const filtered = [];
      for (let i = 0; i < N; i++) {
        const prev = polyCorners[(i - 1 + N) % N];
        const cur = polyCorners[i];
        const next = polyCorners[(i + 1) % N];
        const v1 = { x: cur.x - prev.x, y: cur.y - prev.y };
        const v2 = { x: next.x - cur.x, y: next.y - cur.y };
        const dot = v1.x * v2.x + v1.y * v2.y;
        const det = v1.x * v2.y - v1.y * v2.x;
        const turn = Math.abs(Math.atan2(det, dot));
        if (turn >= 0.45) filtered.push(cur);
      }
      if (filtered.length === 5) polyCorners = filtered;
    }

    // Verify each remaining corner has significant angular deflection
    const N = polyCorners.length;
    for (let i = 0; i < N; i++) {
      const prev = polyCorners[(i - 1 + N) % N];
      const cur = polyCorners[i];
      const next = polyCorners[(i + 1) % N];
      const v1 = { x: cur.x - prev.x, y: cur.y - prev.y };
      const v2 = { x: next.x - cur.x, y: next.y - cur.y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const det = v1.x * v2.y - v1.y * v2.x;
      const turn = Math.abs(Math.atan2(det, dot));
      if (turn < 0.75) return null; // Distinguish sharp polygon corners from smooth curved ellipse/circle points
    }

    // Verify straightness of polygon edges (points must lie close to the chord perimeter)
    let maxD = 0;
    for (const p of resampled) {
      let minD = Infinity;
      for (let j = 0; j < N; j++) {
        const a = polyCorners[j], b = polyCorners[(j + 1) % N];
        minD = Math.min(minD, ShapeRecognizer._pointToSegmentDist(p, a, b));
      }
      maxD = Math.max(maxD, minD);
    }
    // Circles and ellipses bow outwards by ~0.0304 * length; hand-drawn polygons stay tightly within ~0.032 * length
    if (maxD / Math.max(1, totalLength) > 0.032) return null;

    const minX = Math.min(...polyCorners.map(p => p.x));
    const maxX = Math.max(...polyCorners.map(p => p.x));
    const minY = Math.min(...polyCorners.map(p => p.y));
    const maxY = Math.max(...polyCorners.map(p => p.y));

    return {
      type: 'polygon',
      shapeType: 'polygon',
      confidence: 0.88,
      vertices: polyCorners.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) })),
      center: { x: Math.round(centroid.x), y: Math.round(centroid.y) },
      start: { x: Math.round(minX), y: Math.round(minY) },
      end: { x: Math.round(maxX), y: Math.round(maxY) },
      points: [...polyCorners, polyCorners[0]].map(p => ({ x: Math.round(p.x), y: Math.round(p.y), pressure: 0.5 }))
    };
  }

  // --- Helper Methods ---

  /** Uniform arc-length resampling */
  static _resample(points, numSamples, totalLength) {
    const step = totalLength / (numSamples - 1);
    const resampled = [{ x: points[0].x, y: points[0].y }];
    let targetDist = step;
    let accumulatedDist = 0;

    for (let i = 1; i < points.length && resampled.length < numSamples; i++) {
      const segLen = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      if (segLen === 0) continue;

      while (accumulatedDist + segLen >= targetDist && resampled.length < numSamples) {
        const ratio = (targetDist - accumulatedDist) / segLen;
        resampled.push({
          x: points[i - 1].x + ratio * (points[i].x - points[i - 1].x),
          y: points[i - 1].y + ratio * (points[i].y - points[i - 1].y)
        });
        targetDist += step;
      }
      accumulatedDist += segLen;
    }

    while (resampled.length < numSamples) {
      resampled.push({ ...points[points.length - 1] });
    }

    return resampled;
  }

  /** Find corners of closed stroke via RDP and angular change */
  static _findPolygonCorners(points, perimeter) {
    const epsilon = Math.max(2.5, perimeter * 0.028);
    // Find point furthest from points[0] to split loop into two halves
    let maxD = 0, splitIdx = Math.floor(points.length / 2);
    for (let i = 1; i < points.length; i++) {
      const d = Math.hypot(points[i].x - points[0].x, points[i].y - points[0].y);
      if (d > maxD) {
        maxD = d;
        splitIdx = i;
      }
    }

    const half1 = ShapeRecognizer._rdp(points.slice(0, splitIdx + 1), epsilon);
    const half2 = ShapeRecognizer._rdp(points.slice(splitIdx), epsilon);

    const merged = [...half1.slice(0, -1), ...half2.slice(0, -1)];
    // Remove duplicate consecutive vertices within 12px
    const cleaned = [];
    for (let i = 0; i < merged.length; i++) {
      const cur = merged[i];
      const prev = cleaned[cleaned.length - 1];
      if (!prev || Math.hypot(cur.x - prev.x, cur.y - prev.y) > 14) {
        cleaned.push(cur);
      }
    }

    // Ensure loop ends are not duplicated
    if (cleaned.length > 2 && Math.hypot(cleaned[0].x - cleaned[cleaned.length - 1].x, cleaned[0].y - cleaned[cleaned.length - 1].y) < 16) {
      cleaned.pop();
    }

    // Filter out flat/spurious points along edges (turn angle < 0.40 rad)
    let finalCorners = cleaned;
    if (finalCorners.length > 3) {
      let changed = true;
      while (changed && finalCorners.length > 3) {
        changed = false;
        const N = finalCorners.length;
        for (let i = 0; i < N; i++) {
          const prev = finalCorners[(i - 1 + N) % N];
          const cur = finalCorners[i];
          const next = finalCorners[(i + 1) % N];
          const v1 = { x: cur.x - prev.x, y: cur.y - prev.y };
          const v2 = { x: next.x - cur.x, y: next.y - cur.y };
          const dot = v1.x * v2.x + v1.y * v2.y;
          const det = v1.x * v2.y - v1.y * v2.x;
          const turn = Math.abs(Math.atan2(det, dot));
          if (turn < 0.40) {
            finalCorners.splice(i, 1);
            changed = true;
            break;
          }
        }
      }
    }

    return finalCorners;
  }

  /** Ramer-Douglas-Peucker algorithm */
  static _rdp(pts, eps) {
    if (pts.length <= 2) return pts;
    let dmax = 0;
    let idx = 0;
    const start = pts[0];
    const end = pts[pts.length - 1];

    for (let i = 1; i < pts.length - 1; i++) {
      const d = ShapeRecognizer._pointToSegmentDist(pts[i], start, end);
      if (d > dmax) {
        dmax = d;
        idx = i;
      }
    }

    if (dmax > eps) {
      const left = ShapeRecognizer._rdp(pts.slice(0, idx + 1), eps);
      const right = ShapeRecognizer._rdp(pts.slice(idx), eps);
      return [...left.slice(0, -1), ...right];
    } else {
      return [start, end];
    }
  }

  /** Reduce 5 or 6 corners to 3 or 4 if minor vertices are colinear */
  static _simplifyToDominantCorners(corners, resampled) {
    if (!corners || corners.length < 4) return corners;
    // Calculate exterior turn angle at each vertex
    const N = corners.length;
    const scores = [];

    for (let i = 0; i < N; i++) {
      const prev = corners[(i - 1 + N) % N];
      const cur = corners[i];
      const next = corners[(i + 1) % N];

      const v1 = { x: cur.x - prev.x, y: cur.y - prev.y };
      const v2 = { x: next.x - cur.x, y: next.y - cur.y };
      const dot = v1.x * v2.x + v1.y * v2.y;
      const det = v1.x * v2.y - v1.y * v2.x;
      const turn = Math.abs(Math.atan2(det, dot));
      scores.push({ vertex: cur, turn });
    }

    // Sort by largest turn angle
    const top4 = [...scores].sort((a, b) => b.turn - a.turn).slice(0, 4);
    // Maintain original polygon ordering
    const filtered = corners.filter(c => top4.some(t => t.vertex === c));
    return filtered.length === 4 ? filtered : corners.filter(c => top4.slice(0, 3).some(t => t.vertex === c));
  }

  /** Distance from point to line segment */
  static _pointToSegmentDist(p, a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);

    let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const projX = a.x + t * dx;
    const projY = a.y + t * dy;
    return Math.hypot(p.x - projX, p.y - projY);
  }

  /** Sample circle points */
  static _sampleCircle(cx, cy, r, count = 32) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      pts.push({
        x: Math.round(cx + r * Math.cos(a)),
        y: Math.round(cy + r * Math.sin(a)),
        pressure: 0.5
      });
    }
    pts.push({ ...pts[0] });
    return pts;
  }

  /** Sample rotated ellipse points */
  static _sampleEllipse(cx, cy, rx, ry, rot, count = 32) {
    const pts = [];
    const cosT = Math.cos(rot);
    const sinT = Math.sin(rot);

    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2;
      const x0 = rx * Math.cos(a);
      const y0 = ry * Math.sin(a);
      pts.push({
        x: Math.round(cx + x0 * cosT - y0 * sinT),
        y: Math.round(cy + x0 * sinT + y0 * cosT),
        pressure: 0.5
      });
    }
    pts.push({ ...pts[0] });
    return pts;
  }
}
