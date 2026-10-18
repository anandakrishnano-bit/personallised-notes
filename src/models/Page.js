/**
 * Page model — represents a single page in a notebook.
 */
import { Stroke } from './Stroke.js';

let _pageId = 0;

export const PAGE_SIZES = {
  'a4-portrait':  { width: 794, height: 1123, label: 'A4 Portrait' },
  'a4-landscape': { width: 1123, height: 794, label: 'A4 Landscape' },
  'a5-portrait':  { width: 559, height: 794, label: 'A5 Portrait' },
  'a5-landscape': { width: 794, height: 559, label: 'A5 Landscape' },
  'letter':       { width: 816, height: 1056, label: 'US Letter' },
  'infinite':     { width: 4000, height: 4000, label: 'Infinite Canvas' },
};

export const PAGE_BACKGROUNDS = [
  { id: 'white', name: 'Studio White', color: '#ffffff', isDark: false },
  { id: 'cream', name: 'Warm Cream', color: '#faf6ed', isDark: false },
  { id: 'ivory', name: 'Vintage Ivory', color: '#f5efe0', isDark: false },
  { id: 'sage', name: 'Soft Sage', color: '#f0f5f2', isDark: false },
  { id: 'lavender', name: 'Soft Lavender', color: '#f4f2f9', isDark: false },
  { id: 'rose', name: 'Soft Rose', color: '#fbf2f2', isDark: false },
  { id: 'slate', name: 'Soft Slate', color: '#f0f4f9', isDark: false },
  { id: 'eng-green', name: 'Engineering Buff (Green)', color: '#f2f8f0', isDark: false },
  { id: 'eng-sepia', name: 'Engineering Sepia', color: '#faf4e8', isDark: false },
  { id: 'gray', name: 'Muted Gray', color: '#f3f4f6', isDark: false },
  { id: 'charcoal', name: 'Dark Charcoal', color: '#18181b', isDark: true },
  { id: 'midnight', name: 'Midnight Navy', color: '#0f172a', isDark: true },
];

export const TEMPLATES = {
  blank:          { label: 'Blank', category: 'Basic' },
  'blank-white':  { label: 'White Paper', category: 'Basic', bgColor: '#ffffff' },
  'blank-cream':  { label: 'Cream Paper', category: 'Basic', bgColor: '#faf6ed' },
  'blank-gray':   { label: 'Light Gray', category: 'Basic', bgColor: '#f0f0f0' },
  'blank-dark':   { label: 'Dark Paper', category: 'Basic', bgColor: '#2a2a3a' },
  'ruled-narrow': { label: 'Narrow Ruled', category: 'Ruled', lineSpacing: 20 },
  'ruled-std':    { label: 'Standard Ruled', category: 'Ruled', lineSpacing: 28 },
  'ruled-wide':   { label: 'Wide Ruled', category: 'Ruled', lineSpacing: 36 },
  'grid-small':   { label: 'Small Grid', category: 'Grid', gridSize: 16 },
  'grid-medium':  { label: 'Medium Grid', category: 'Grid', gridSize: 24 },
  'grid-large':   { label: 'Large Grid', category: 'Grid', gridSize: 36 },
  'grid-eng':     { label: 'Engineering Pad (Green)', category: 'Engineering', bgColor: '#f2f8f0', gridSize: 16 },
  'eng-sepia':    { label: 'Engineering Pad (Buff/Sepia)', category: 'Engineering', bgColor: '#faf4e8', gridSize: 16 },
  'dot-fine':     { label: 'Fine Dots', category: 'Dotted', dotSpacing: 16, dotSize: 1 },
  'dot-medium':   { label: 'Medium Dots', category: 'Dotted', dotSpacing: 24, dotSize: 1.5 },
  'dot-large':    { label: 'Large Dots', category: 'Dotted', dotSpacing: 32, dotSize: 2 },
  'cornell':      { label: 'Cornell Notes', category: 'Academic' },
  'todo':         { label: 'To-Do List', category: 'Planning' },
  'weekly':       { label: 'Weekly Planner', category: 'Planning' },
  'daily':        { label: 'Daily Planner', category: 'Planning' },
  'meeting':      { label: 'Meeting Notes', category: 'Academic' },
  'isometric':    { label: 'Isometric Grid', category: 'Engineering' },
  'music':        { label: 'Music Staff', category: 'Special' },
};

export class Page {
  constructor(opts = {}) {
    this.id = opts.id || `p_${Date.now()}_${_pageId++}`;
    this.template = opts.template || 'blank-white';
    this.pageSize = opts.pageSize || 'a4-portrait';
    this.bgColor = opts.bgColor || TEMPLATES[opts.template]?.bgColor || '#ffffff';
    this.strokes = [];     // Array of Stroke objects
    this.shapes = [];      // Array of Shape objects (future)
    this.textBoxes = [];   // Array of TextBox objects (future)
    this.images = [];      // Array of image objects (future)
    this.tables = opts.tables || [];
    this.pdfPageIndex = opts.pdfPageIndex ?? null; // For PDF notebooks
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
  }

  get isInfinite() {
    return this.pageSize === 'infinite';
  }

  get width() {
    return PAGE_SIZES[this.pageSize]?.width || 794;
  }

  get height() {
    return PAGE_SIZES[this.pageSize]?.height || 1123;
  }

  addStroke(stroke) {
    this.strokes.push(stroke);
    this.modifiedAt = Date.now();
  }

  removeStroke(strokeId) {
    const idx = this.strokes.findIndex(s => s.id === strokeId);
    if (idx >= 0) {
      const removed = this.strokes.splice(idx, 1)[0];
      this.modifiedAt = Date.now();
      return removed;
    }
    return null;
  }

  removeStrokes(strokeIds) {
    const idSet = new Set(strokeIds);
    const removed = [];
    this.strokes = this.strokes.filter(s => {
      if (idSet.has(s.id)) {
        removed.push(s);
        return false;
      }
      return true;
    });
    if (removed.length > 0) this.modifiedAt = Date.now();
    return removed;
  }

  toJSON() {
    return {
      id: this.id,
      template: this.template,
      pageSize: this.pageSize,
      bgColor: this.bgColor,
      strokes: this.strokes.map(s => s.toJSON ? s.toJSON() : s),
      shapes: this.shapes,
      textBoxes: this.textBoxes,
      images: this.images,
      pdfPageIndex: this.pdfPageIndex,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt
    };
  }

  static fromJSON(data) {
    const page = new Page({
      id: data.id,
      template: data.template,
      pageSize: data.pageSize,
      bgColor: data.bgColor,
      pdfPageIndex: data.pdfPageIndex
    });
    page.strokes = (data.strokes || []).map(s => Stroke.fromJSON ? Stroke.fromJSON(s) : s);
    page.shapes = data.shapes || [];
    page.textBoxes = data.textBoxes || [];
    page.images = data.images || [];
    page.createdAt = data.createdAt || Date.now();
    page.modifiedAt = data.modifiedAt || Date.now();
    return page;
  }
}
