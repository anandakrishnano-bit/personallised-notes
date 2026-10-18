/**
 * HistoryManager — Command-pattern undo/redo system.
 * 
 * Stores lightweight action descriptors instead of full document copies.
 * Memory-efficient: limited stack size, no duplication of stroke arrays.
 */
const MAX_HISTORY = 200;

export class HistoryManager {
  constructor(app = null) {
    this.app = app;
    this.undoStack = [];
    this.redoStack = [];
    this._onChange = null;
  }

  /** Register a change listener */
  onChange(cb) { this._onChange = cb; }

  /** Push a new action */
  push(action) {
    this.undoStack.push(action);
    this.redoStack = []; // Clear redo on new action

    // Trim if too large
    if (this.undoStack.length > MAX_HISTORY) {
      this.undoStack.shift();
    }

    this._notify();
  }

  /** Undo the last action */
  undo(page) {
    if (this.undoStack.length === 0) return false;
    const action = this.undoStack.pop();
    this._reverse(action, page);
    this.redoStack.push(action);
    this._notify();
    return true;
  }

  /** Redo the last undone action */
  redo(page) {
    if (this.redoStack.length === 0) return false;
    const action = this.redoStack.pop();
    this._apply(action, page);
    this.undoStack.push(action);
    this._notify();
    return true;
  }

  /** Can undo? */
  get canUndo() { return this.undoStack.length > 0; }
  /** Can redo? */
  get canRedo() { return this.redoStack.length > 0; }

  /** Apply an action (for redo) */
  _apply(action, page) {
    switch (action.type) {
      case 'addStroke':
        page.strokes.push(action.stroke);
        break;
      case 'convertShape':
        page.strokes.push(action.convertedStroke || action.stroke);
        break;
      case 'removeStroke':
        page.strokes = page.strokes.filter(s => s.id !== action.stroke.id);
        break;
      case 'removeStrokes': {
        const removeIds = new Set(action.strokes.map(s => s.id));
        page.strokes = page.strokes.filter(s => !removeIds.has(s.id));
        break;
      }
      case 'clearPage':
        action._backup = [...page.strokes];
        page.strokes = [];
        break;
      case 'fillShape': {
        const stroke = page.strokes.find(s => s.id === action.strokeId);
        if (stroke) stroke.fillColor = action.newFill;
        break;
      }
      case 'pageBg':
        page.bgColor = action.newBg;
        if (this.app?.redrawBackground) this.app.redrawBackground();
        break;
      case 'moveElement':
        if (action.apply) action.apply(page);
        break;
    }
    page.modifiedAt = Date.now();
  }

  /** Reverse an action (for undo) */
  _reverse(action, page) {
    switch (action.type) {
      case 'addStroke':
        page.strokes = page.strokes.filter(s => s.id !== action.stroke.id);
        break;
      case 'convertShape': {
        const idToRemove = (action.convertedStroke || action.stroke || action.originalStroke)?.id;
        page.strokes = page.strokes.filter(s => s.id !== idToRemove && s.id !== action.originalStroke?.id);
        break;
      }
      case 'removeStroke':
        page.strokes.push(action.stroke);
        break;
      case 'removeStrokes':
        page.strokes.push(...action.strokes);
        break;
      case 'clearPage':
        if (action._backup) {
          page.strokes = action._backup;
        }
        break;
      case 'fillShape': {
        const stroke = page.strokes.find(s => s.id === action.strokeId);
        if (stroke) stroke.fillColor = action.oldFill;
        break;
      }
      case 'pageBg':
        page.bgColor = action.oldBg;
        if (this.app?.redrawBackground) this.app.redrawBackground();
        break;
      case 'moveElement':
        if (action.revert) action.revert(page);
        break;
    }
    page.modifiedAt = Date.now();
  }

  /** Clear all history */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._notify();
  }

  /** Clear history for a specific page */
  clearForPage(pageId) {
    this.undoStack = this.undoStack.filter(a => a.pageId !== pageId);
    this.redoStack = this.redoStack.filter(a => a.pageId !== pageId);
    this._notify();
  }

  _notify() {
    if (this._onChange) this._onChange(this.canUndo, this.canRedo);
  }
}
