/**
 * BaseTool — abstract drawing tool.
 * All tools extend this and implement onPointerDown/Move/Up.
 */
export class BaseTool {
  constructor(app) {
    this.app = app;
    this.name = 'base';
    this.cursor = 'crosshair';
  }

  /** Called when pointer goes down */
  onPointerDown(point, event) {}

  /** Called on pointer move with array of coalesced points */
  onPointerMove(points, event) {}

  /** Called when pointer is released */
  onPointerUp(point, event) {}

  /** Called if gesture cancels drawing */
  onCancel() {}

  /** Get the active canvas context */
  get activeCtx() {
    return this.app.canvasManager.getCtx('active');
  }

  /** Get the content canvas context */
  get contentCtx() {
    return this.app.canvasManager.getCtx('content');
  }

  /** Canvas manager shortcut */
  get cm() {
    return this.app.canvasManager;
  }

  /** Apply document transform to a context */
  applyTransform(ctx) {
    this.cm.applyTransform(ctx);
  }

  /** Get current tool options from app state */
  getToolOptions() {
    return this.app.getToolOptions(this.name);
  }
}
