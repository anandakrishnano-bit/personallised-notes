/**
 * InputHandler — Processes pointer events with coalesced event support.
 * 
 * Key optimizations:
 * - Uses getCoalescedEvents() for sub-frame point capture
 * - Distinguishes pen/touch/mouse via pointerType
 * - Converts screen coords to document coords before passing to tools
 * - Does NOT trigger any DOM/UI updates during drawing
 * - Supports palm rejection by ignoring touch when stylus is active
 */
import { Dialog } from '../ui/Dialog.js';

export class InputHandler {
  constructor(canvasManager, app) {
    this.cm = canvasManager;
    this.app = app;
    this.isDrawing = false;
    this.activePointerId = null;
    this.pointerType = null;
    this._stylusActive = false;
    this._touchCount = 0;
    this._isPanning = false;
    this._lastPinchDist = 0;
    this._lastPinchCenter = null;
    this._touches = new Map();
    this._fingerDrawEnabled = true;
    this._palmRejection = true;

    this._bindEvents();
  }

  _bindEvents() {
    const el = this.cm.eventCanvas;
    
    // Pointer events for drawing
    el.addEventListener('pointerdown', this._onPointerDown.bind(this), { passive: false });
    el.addEventListener('pointermove', this._onPointerMove.bind(this), { passive: false });
    el.addEventListener('pointerup', this._onPointerUp.bind(this));
    el.addEventListener('pointercancel', this._onPointerUp.bind(this));
    el.addEventListener('pointerleave', this._onPointerUp.bind(this));

    // Touch events for gestures (pan/zoom)
    el.addEventListener('touchstart', this._onTouchStart.bind(this), { passive: false });
    el.addEventListener('touchmove', this._onTouchMove.bind(this), { passive: false });
    el.addEventListener('touchend', this._onTouchEnd.bind(this));
    el.addEventListener('touchcancel', this._onTouchEnd.bind(this));

    // Wheel for zoom
    el.addEventListener('wheel', this._onWheel.bind(this), { passive: false });

    // Spacebar pan listeners
    this._spacePressed = false;
    this._isMousePanning = false;
    this._mousePanStart = null;
    this._justPanned = false;

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && !['INPUT', 'TEXTAREA'].includes(e.target.tagName)) {
        this._spacePressed = true;
        if (!this._isMousePanning && this.cm.eventCanvas) {
          this.cm.eventCanvas.style.cursor = 'grab';
        }
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this._spacePressed = false;
        if (!this._isMousePanning && this.cm.eventCanvas) {
          this.cm.eventCanvas.style.cursor = this.app.activeTool?.cursor || 'crosshair';
        }
      }
    });

    // Prevent context menu on canvas
    el.addEventListener('contextmenu', e => e.preventDefault());
  }

  /** Set whether finger drawing is enabled */
  setFingerDrawEnabled(v) { this._fingerDrawEnabled = v; }
  setPalmRejection(v) { this._palmRejection = v; }

  _shouldDraw(e) {
    // Always allow pen/stylus
    if (e.pointerType === 'pen') return true;
    // Always allow mouse
    if (e.pointerType === 'mouse') return true;
    // Touch: only if finger drawing is enabled and no stylus is active
    if (e.pointerType === 'touch') {
      if (!this._fingerDrawEnabled) return false;
      if (this._palmRejection && this._stylusActive) return false;
      if (this._touches && this._touches.size > 1) return false; // multi-touch = gesture
      return true;
    }
    return true;
  }

  _getDocPoint(e) {
    const rect = this.cm.eventCanvas.getBoundingClientRect();
    const scaleX = (rect.width > 0 && this.cm.width > 0) ? (this.cm.width / rect.width) : 1;
    const scaleY = (rect.height > 0 && this.cm.height > 0) ? (this.cm.height / rect.height) : 1;
    const sx = (e.clientX - rect.left) * scaleX;
    const sy = (e.clientY - rect.top) * scaleY;
    const doc = this.cm.screenToDoc(sx, sy);
    return {
      x: doc.x,
      y: doc.y,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      pointerType: e.pointerType,
      timestamp: e.timeStamp
    };
  }

  _onPointerDown(e) {
    if (e.button === 1 || this._spacePressed) {
      e.preventDefault();
      this._isMousePanning = true;
      this._mousePanStart = { clientX: e.clientX, clientY: e.clientY, panX: this.cm.panX, panY: this.cm.panY };
      this.cm.eventCanvas.style.cursor = 'grabbing';
      return;
    }

    if (e.pointerType === 'pen') {
      this._stylusActive = true;
    }

    if (!this._shouldDraw(e)) return;
    if (this.isDrawing) return;

    const point = this._getDocPoint(e);
    // Boundary check for non-infinite pages: ink cannot start outside page boundaries
    if (this.app.currentPage && !this.app.currentPage.isInfinite) {
      const pw = this.app.currentPage.width || 794;
      const ph = this.app.currentPage.height || 1123;
      if (point.x < 0 || point.x > pw || point.y < 0 || point.y > ph) {
        if (this.app.activeTool?.name !== 'move') {
          return;
        }
      }
    }

    e.preventDefault();
    this.cm.eventCanvas.setPointerCapture(e.pointerId);
    this.activePointerId = e.pointerId;
    this.pointerType = e.pointerType;
    this.isDrawing = true;

    const tool = this.app.activeTool;
    if (tool && tool.onPointerDown) {
      tool.onPointerDown(point, e);
    }
  }

  _onPointerMove(e) {
    if (this._isMousePanning && this._mousePanStart) {
      e.preventDefault();
      const dx = e.clientX - this._mousePanStart.clientX;
      const dy = e.clientY - this._mousePanStart.clientY;
      this.cm.panX = this._mousePanStart.panX + dx;
      this.cm.panY = this._mousePanStart.panY + dy;
      this.app.requestRedraw();
      return;
    }

    // Update eraser cursor position
    if (this.app.activeTool?.name === 'eraser') {
      this.app.updateEraserCursor(e.clientX, e.clientY);
    }

    if (!this.isDrawing) return;
    if (e.pointerId !== this.activePointerId) return;
    
    e.preventDefault();

    // Get coalesced events for sub-frame points
    const points = [];
    const rawCoalesced = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    const coalescedEvents = (rawCoalesced && rawCoalesced.length > 0) ? rawCoalesced : [e];
    for (const ce of coalescedEvents) {
      points.push(this._getDocPoint(ce));
    }

    const tool = this.app.activeTool;
    if (tool && tool.onPointerMove) {
      tool.onPointerMove(points, e);
    }
  }

  _onPointerUp(e) {
    if (this._isMousePanning) {
      this._isMousePanning = false;
      this._mousePanStart = null;
      this.cm.eventCanvas.style.cursor = this.app.activeTool?.cursor || 'crosshair';
      this._justPanned = true;
      setTimeout(() => { this._justPanned = false; }, 180);
      return;
    }

    this._touchCount = 0;
    if (e.pointerType === 'pen') {
      // Delay stylus inactive flag to prevent palm marks
      setTimeout(() => { this._stylusActive = false; }, 300);
    }

    if (!this.isDrawing) return;
    if (e.pointerId !== this.activePointerId) return;

    this.isDrawing = false;
    this.activePointerId = null;

    const point = this._getDocPoint(e);
    const tool = this.app.activeTool;
    if (tool && tool.onPointerUp) {
      tool.onPointerUp(point, e);
    }
  }

  _cancelDrawing() {
    this._touchCount = 0;
    if (!this.isDrawing) return;
    this.isDrawing = false;
    this.activePointerId = null;
    const tool = this.app.activeTool;
    if (tool && tool.onCancel) {
      tool.onCancel();
    }
  }

  // --- Touch gesture handling (pan/zoom, 2-finger tap, 3-finger slide) ---
  _onTouchStart(e) {
    const now = Date.now();
    for (const t of e.changedTouches) {
      this._touches.set(t.identifier, { x: t.clientX, y: t.clientY, startX: t.clientX, startY: t.clientY });
    }

    // Only cancel drawing and prevent default if multiple fingers are touching
    if (this._touches.size > 1) {
      e.preventDefault();
      if (this.isDrawing) {
        this._cancelDrawing();
      }
    }

    if (this._touches.size === 1) {
      this._touchStartTime = now;
      this._maxTouchCount = 1;
      this._gestureTriggered = false;
      this._lastTapCenter = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    } else {
      this._maxTouchCount = Math.max(this._maxTouchCount || 0, this._touches.size);
    }

    if (this._touches.size === 2) {
      this._isPanning = false;
      this._twoFingerMoved = false;
      const [a, b] = [...this._touches.values()];
      this._initialTwoFingerDist = Math.hypot(b.x - a.x, b.y - a.y);
      this._twoFingerStartCenter = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this._lastPinchDist = this._initialTwoFingerDist;
      this._lastPinchCenter = this._twoFingerStartCenter;
      this._lastTapCenter = this._twoFingerStartCenter;
    } else if (this._touches.size === 3) {
      this._isPanning = false;
      const vals = [...this._touches.values()];
      this._threeFingerStartY = (vals[0].startY + vals[1].startY + vals[2].startY) / 3;
      this._threeFingerStartX = (vals[0].startX + vals[1].startX + vals[2].startX) / 3;
    }
  }

  _onTouchMove(e) {
    for (const t of e.changedTouches) {
      const existing = this._touches.get(t.identifier);
      if (existing) {
        existing.x = t.clientX;
        existing.y = t.clientY;
      }
    }

    // 3-finger slide detection & real-time erasing
    if (this._touches.size === 3) {
      e.preventDefault();
      const vals = [...this._touches.values()];
      const avgY = (vals[0].y + vals[1].y + vals[2].y) / 3;
      const avgX = (vals[0].x + vals[1].x + vals[2].x) / 3;
      const dist = Math.hypot(avgX - this._threeFingerStartX, avgY - this._threeFingerStartY);

      if (dist > 30) {
        if (!this._gestureTriggered) {
          this._gestureTriggered = true;
          // Remember previous tool before 3-finger eraser activated
          if (!this._previousToolBeforeGesture) {
            this._previousToolBeforeGesture = this.app.activeTool?.name || 'pen';
          }
          this._handleGesture('threeFingerSlide', avgX, avgY);
        }

        // Erase strokes under 3 fingers
        const rect = this.cm.eventCanvas.getBoundingClientRect();
        const docPt = this.cm.screenToDoc(avgX - rect.left, avgY - rect.top);
        if (this.app.tools.eraser && this.app.activeTool === this.app.tools.eraser) {
          this.app.tools.eraser.onPointerMove([{ x: docPt.x, y: docPt.y, pressure: 1.0 }]);
        }
      }
      return;
    }

    // 2-finger pinch zoom & pan
    if (this._touches.size === 2) {
      e.preventDefault();
      const [a, b] = [...this._touches.values()];
      const dist = Math.hypot(b.x - a.x, b.y - a.y);
      const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

      const moveDist = this._twoFingerStartCenter
        ? Math.hypot(center.x - this._twoFingerStartCenter.x, center.y - this._twoFingerStartCenter.y)
        : 0;
      const pinchDiff = this._initialTwoFingerDist
        ? Math.abs(dist - this._initialTwoFingerDist)
        : 0;

      // Any movement > 5px is classified as panning/zooming, permanently preventing tap popup
      if (moveDist > 5 || pinchDiff > 5) {
        this._twoFingerMoved = true;
        this._isPanning = true;
        this._gestureTriggered = true;
      }

      if (this._isPanning) {
        // Pinch zoom
        if (this._lastPinchDist > 0) {
          const scale = dist / this._lastPinchDist;
          const oldZoom = this.cm.zoom;
          const newZoom = Math.max(0.1, Math.min(10, oldZoom * scale));

          // Zoom toward pinch center
          const rect = this.cm.eventCanvas.getBoundingClientRect();
          const cx = center.x - rect.left;
          const cy = center.y - rect.top;

          this.cm.panX = cx - (cx - this.cm.panX) * (newZoom / oldZoom);
          this.cm.panY = cy - (cy - this.cm.panY) * (newZoom / oldZoom);
          this.cm.zoom = newZoom;
        }

        // Pan
        if (this._lastPinchCenter) {
          const dx = center.x - this._lastPinchCenter.x;
          const dy = center.y - this._lastPinchCenter.y;
          this.cm.panX += dx;
          this.cm.panY += dy;
        }

        this._lastPinchDist = dist;
        this._lastPinchCenter = center;

        // Trigger redraw
        this.app.requestRedraw();
      }
    }
  }

  _onTouchEnd(e) {
    for (const t of e.changedTouches) {
      this._touches.delete(t.identifier);
    }

    // Disable 3-finger eraser and restore previous tool immediately when fingers are let go
    if (this._touches.size < 3 && this._previousToolBeforeGesture) {
      const restoreTool = this._previousToolBeforeGesture;
      this._previousToolBeforeGesture = null;
      if (this.app.tools.eraser?.onPointerUp) {
        this.app.tools.eraser.onPointerUp();
      }
      this.app.toolbar?.setTool(restoreTool);
    }

    if (this._touches.size < 2) {
      this._lastPinchDist = 0;
      this._lastPinchCenter = null;
    }

    // All fingers lifted: check for tap gestures
    if (this._touches.size === 0) {
      this._touchCount = 0;
      const duration = Date.now() - (this._touchStartTime || 0);

      // Only fire tap if the fingers NEVER moved or panned at all
      if (!this._twoFingerMoved && !this._gestureTriggered && duration >= 40 && duration < 240) {
        if (this._maxTouchCount === 2) {
          const pt = this._lastTapCenter || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          this._handleGesture('twoFingerTap', pt.x, pt.y);
        } else if (this._maxTouchCount === 3) {
          const pt = this._lastTapCenter || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          this._handleGesture('threeFingerTap', pt.x, pt.y);
        }
      }

      this._maxTouchCount = 0;
      this._gestureTriggered = false;
      this._twoFingerMoved = false;
      this._isPanning = false;
      this._justPanned = true;
      setTimeout(() => { this._justPanned = false; }, 180);
    }
  }

  _handleGesture(gestureName, screenX, screenY) {
    const gestures = this.app.gestures || {
      twoFingerTap: 'quick-panel',
      threeFingerSlide: 'eraser',
      threeFingerTap: 'undo'
    };
    const action = gestures[gestureName];
    if (!action) return;

    switch (action) {
      case 'quick-panel':
        import('../ui/QuickActionPanel.js').then(m => {
          m.QuickActionPanel.show(this.app, screenX, screenY);
        });
        break;
      case 'eraser':
        this.app.toolbar?.setTool('eraser');
        break;
      case 'tool-move':
        this.app.toolbar?.setTool('move');
        break;
      case 'tool-fill':
        this.app.toolbar?.setTool('fill');
        break;
      case 'tool-pen':
        this.app.toolbar?.setTool('pen');
        break;
      case 'tool-highlighter':
        this.app.toolbar?.setTool('highlighter');
        break;
      case 'zoom-fit':
        this.app.fitToWidth();
        break;
      case 'zoom-reset':
        this.app.resetZoom();
        break;
      case 'toggle-theme':
        this.app.toggleTheme();
        break;
      case 'undo':
        this.app.undo();
        break;
      case 'redo':
        this.app.redo();
        break;
      case 'clear':
        Dialog.confirm({
          title: 'Clear Page',
          description: 'Are you sure you want to clear all ink strokes on this page? You can still undo this action.',
          confirmText: 'Clear Page',
          cancelText: 'Cancel',
          isDestructive: true
        }).then(confirmed => {
          if (confirmed) this.app.clearCurrentPage();
        });
        break;
      default:
        break;
    }
  }

  _onWheel(e) {
    e.preventDefault();
    const rect = this.cm.eventCanvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (e.ctrlKey) {
      // Pinch-zoom via trackpad
      const factor = 1 - e.deltaY * 0.005;
      const oldZoom = this.cm.zoom;
      const newZoom = Math.max(0.1, Math.min(10, oldZoom * factor));

      this.cm.panX = mx - (mx - this.cm.panX) * (newZoom / oldZoom);
      this.cm.panY = my - (my - this.cm.panY) * (newZoom / oldZoom);
      this.cm.zoom = newZoom;
    } else {
      // Scroll = pan
      this.cm.panX -= e.deltaX;
      this.cm.panY -= e.deltaY;
    }

    this.app.requestRedraw();
  }

  destroy() {
    // Event listeners are cleaned up when the canvas is removed
  }
}
