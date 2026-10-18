/**
 * Notebook model — a collection of pages with metadata.
 */
let _nbId = 0;

export const PASTEL_PALETTE = [
  { id: 'sage', name: 'Sage Mist', hex: '#8FA89B', lightBg: '#F0F5F2', darkBg: '#1C2621', border: '#789987', shadow: 'rgba(143, 168, 155, 0.28)' },
  { id: 'lavender', name: 'Dusty Lavender', hex: '#A89FCA', lightBg: '#F4F2F9', darkBg: '#23202E', border: '#9285BA', shadow: 'rgba(168, 159, 202, 0.28)' },
  { id: 'blush', name: 'Blush Rose', hex: '#D99B9B', lightBg: '#FBF2F2', darkBg: '#2D1F1F', border: '#C88383', shadow: 'rgba(217, 155, 155, 0.28)' },
  { id: 'slate', name: 'Slate Blue', hex: '#8FAEC8', lightBg: '#F0F4F9', darkBg: '#1B242D', border: '#7397B6', shadow: 'rgba(143, 174, 200, 0.28)' },
  { id: 'apricot', name: 'Warm Apricot', hex: '#E5A882', lightBg: '#FAF3ED', darkBg: '#2E2018', border: '#D49064', shadow: 'rgba(229, 168, 130, 0.28)' },
  { id: 'seafoam', name: 'Seafoam Mint', hex: '#8EC3B0', lightBg: '#EEF7F4', darkBg: '#1B2925', border: '#70AE9B', shadow: 'rgba(142, 195, 176, 0.28)' },
  { id: 'oatmeal', name: 'Warm Oatmeal', hex: '#C9B9A6', lightBg: '#F7F4F0', darkBg: '#28241F', border: '#B4A089', shadow: 'rgba(201, 185, 166, 0.28)' },
  { id: 'chamomile', name: 'Chamomile', hex: '#DBC888', lightBg: '#FAF8EE', darkBg: '#2A2617', border: '#C7B167', shadow: 'rgba(219, 200, 136, 0.28)' },
  { id: 'mauve', name: 'Lilac Mauve', hex: '#B99AC9', lightBg: '#F8F3FA', darkBg: '#271D2B', border: '#A682B9', shadow: 'rgba(185, 154, 201, 0.28)' },
  { id: 'clay', name: 'Artisan Clay', hex: '#C88D7E', lightBg: '#F9F2F0', darkBg: '#2B1C19', border: '#B47262', shadow: 'rgba(200, 141, 126, 0.28)' },
];

export const COLORS = PASTEL_PALETTE.map(p => p.hex);

export function getPastelTheme(hexOrColor) {
  if (!hexOrColor) return PASTEL_PALETTE[0];
  const found = PASTEL_PALETTE.find(p => p.hex.toLowerCase() === hexOrColor.toLowerCase() || p.id === hexOrColor);
  if (found) return found;
  return {
    id: 'custom',
    name: 'Custom',
    hex: hexOrColor,
    lightBg: `${hexOrColor}18`,
    darkBg: `${hexOrColor}28`,
    border: hexOrColor,
    shadow: `${hexOrColor}35`
  };
}

export class Notebook {
  constructor(opts = {}) {
    this.id = opts.id || `nb_${Date.now()}_${_nbId++}`;
    this.name = opts.name || 'Untitled Notebook';
    this.color = opts.color || COLORS[Math.floor(Math.random() * COLORS.length)];
    this.pageIds = [];     // Ordered page IDs
    this.currentPageIndex = 0;
    this.isPinned = false;
    this.folder = opts.folder || null;
    this.createdAt = Date.now();
    this.modifiedAt = Date.now();
    this.pageSize = opts.pageSize || 'a4-portrait';
    this.template = opts.template || 'blank-white';
    this.thumbnailDataUrl = null;
    this.isPdf = opts.isPdf || false;
    this.pdfData = null;  // ArrayBuffer of original PDF (stored in IDB separately)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      color: this.color,
      pageIds: this.pageIds,
      currentPageIndex: this.currentPageIndex,
      isPinned: this.isPinned,
      folder: this.folder,
      createdAt: this.createdAt,
      modifiedAt: this.modifiedAt,
      pageSize: this.pageSize,
      template: this.template,
      thumbnailDataUrl: this.thumbnailDataUrl,
      isPdf: this.isPdf,
    };
  }

  static fromJSON(data) {
    const nb = new Notebook({
      id: data.id,
      name: data.name,
      color: data.color,
      folder: data.folder,
      pageSize: data.pageSize,
      template: data.template,
      isPdf: data.isPdf,
    });
    nb.pageIds = data.pageIds || [];
    nb.currentPageIndex = data.currentPageIndex || 0;
    nb.isPinned = data.isPinned || false;
    nb.createdAt = data.createdAt || Date.now();
    nb.modifiedAt = data.modifiedAt || Date.now();
    nb.thumbnailDataUrl = data.thumbnailDataUrl || null;
    return nb;
  }
}
