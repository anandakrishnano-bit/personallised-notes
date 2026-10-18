/**
 * PdfHandler — Exporting pages to PNG / Print-to-PDF / JSON, and importing images/PDFs.
 */
import { TemplateRenderer } from '../templates/TemplateRenderer.js';
import { StrokeRenderer } from '../engine/StrokeRenderer.js';
import { TextTool } from '../tools/TextTool.js';
import { TableTool } from '../tools/TableTool.js';
import { Dialog } from '../ui/Dialog.js';

export class PdfHandler {
  /**
   * Calculate bounding box of all content on a page (for infinite canvas crop export)
   */
  static getContentBounds(page, padding = 40) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    if (page.strokes && page.strokes.length > 0) {
      for (const s of page.strokes) {
        hasContent = true;
        if (s.isShape && s.start && s.end) {
          minX = Math.min(minX, s.start.x, s.end.x);
          maxX = Math.max(maxX, s.start.x, s.end.x);
          minY = Math.min(minY, s.start.y, s.end.y);
          maxY = Math.max(maxY, s.start.y, s.end.y);
        } else if (s.points) {
          for (const p of s.points) {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.y < minY) minY = p.y;
            if (p.y > maxY) maxY = p.y;
          }
        }
      }
    }

    if (page.textBoxes && page.textBoxes.length > 0) {
      for (const t of page.textBoxes) {
        hasContent = true;
        minX = Math.min(minX, t.x);
        minY = Math.min(minY, t.y);
        maxX = Math.max(maxX, t.x + (t.width || 180));
        maxY = Math.max(maxY, t.y + (t.height || 60));
      }
    }

    if (page.images && page.images.length > 0) {
      for (const img of page.images) {
        hasContent = true;
        minX = Math.min(minX, img.x);
        minY = Math.min(minY, img.y);
        maxX = Math.max(maxX, img.x + img.width);
        maxY = Math.max(maxY, img.y + img.height);
      }
    }

    if (page.tables && page.tables.length > 0) {
      for (const tbl of page.tables) {
        hasContent = true;
        minX = Math.min(minX, tbl.x);
        minY = Math.min(minY, tbl.y);
        maxX = Math.max(maxX, tbl.x + tbl.cols * 95);
        maxY = Math.max(maxY, tbl.y + (tbl.rows + 1) * 30);
      }
    }

    if (!hasContent) {
      return { x: 0, y: 0, width: 800, height: 1100 };
    }

    const x = Math.max(0, Math.floor(minX - padding));
    const y = Math.max(0, Math.floor(minY - padding));
    const w = Math.ceil(maxX - x + padding);
    const h = Math.ceil(maxY - y + padding);

    return { x, y, width: Math.max(200, w), height: Math.max(200, h) };
  }

  /**
   * Export the current page as a high-resolution PNG image.
   * If infinite canvas, exports exactly the drawn portion!
   */
  static exportPageAsPNG(page, fileName = 'note.png') {
    if (!page) return;

    const isInf = page.isInfinite;
    const bounds = isInf ? this.getContentBounds(page) : { x: 0, y: 0, width: page.width || 794, height: page.height || 1123 };
    const width = bounds.width;
    const height = bounds.height;
    const dpr = 2; // 2x for sharp export

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(width * dpr);
    offscreen.height = Math.round(height * dpr);
    const ctx = offscreen.getContext('2d');
    ctx.scale(dpr, dpr);

    if (isInf) {
      ctx.translate(-bounds.x, -bounds.y);
    }

    // 1. Draw template background
    TemplateRenderer.render(ctx, page, isInf ? bounds.x + bounds.width : width, isInf ? bounds.y + bounds.height : height);

    // 2. Draw all strokes
    if (page.strokes) {
      for (const stroke of page.strokes) {
        StrokeRenderer.renderStroke(ctx, stroke);
      }
    }

    // 3. Draw text boxes
    if (page.textBoxes) {
      TextTool.renderTextBoxes(ctx, page.textBoxes);
    }

    // 4. Draw tables
    if (page.tables) {
      TableTool.renderTables(ctx, page.tables);
    }

    // Trigger download
    offscreen.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  }

  /**
   * Export page via Native Print (Chrome OS built-in "Save as PDF").
   * Highest fidelity, crisp vector printing on Chromebooks.
   */
  static printPageAsPdf(page, title = 'Personalized Note') {
    if (!page) return;

    const isInf = page.isInfinite;
    const bounds = isInf ? this.getContentBounds(page) : { x: 0, y: 0, width: page.width || 794, height: page.height || 1123 };
    const width = bounds.width;
    const height = bounds.height;
    const dpr = 2;

    const offscreen = document.createElement('canvas');
    offscreen.width = Math.round(width * dpr);
    offscreen.height = Math.round(height * dpr);
    const ctx = offscreen.getContext('2d');
    ctx.scale(dpr, dpr);

    if (isInf) {
      ctx.translate(-bounds.x, -bounds.y);
    }

    TemplateRenderer.render(ctx, page, isInf ? bounds.x + bounds.width : width, isInf ? bounds.y + bounds.height : height);
    if (page.strokes) {
      for (const stroke of page.strokes) {
        StrokeRenderer.renderStroke(ctx, stroke);
      }
    }
    if (page.textBoxes) {
      TextTool.renderTextBoxes(ctx, page.textBoxes);
    }
    if (page.tables) {
      TableTool.renderTables(ctx, page.tables);
    }

    const dataUrl = offscreen.toDataURL('image/png');
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      Dialog.alert({
        title: 'Pop-up Window Blocked',
        message: 'Please allow pop-ups for this site so your browser can open the print and export window.'
      });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${title}</title>
        <style>
          @page { size: auto; margin: 0; }
          body { margin: 0; padding: 0; display: flex; justify-content: center; background: white; }
          img { max-width: 100%; height: auto; display: block; }
        </style>
      </head>
      <body>
        <img src="${dataUrl}" onload="window.print(); window.close();" />
      </body>
      </html>
    `);
    printWindow.document.close();
  }

  /**
   * Export complete notebook as .pnotes JSON file.
   */
  static exportNotebookAsJSON(notebook, pages) {
    const data = {
      format: 'personalized-notes',
      version: 1,
      exportedAt: new Date().toISOString(),
      notebook: notebook.toJSON ? notebook.toJSON() : notebook,
      pages: pages.map(p => (p.toJSON ? p.toJSON() : p))
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(notebook.name || 'notebook').replace(/[^a-z0-9_-]/gi, '_')}.pnotes`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /**
   * Import image file from user's disk onto current page.
   */
  static async importImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          resolve({
            image: img,
            dataUrl: e.target.result,
            width: img.width,
            height: img.height
          });
        };
        img.onerror = reject;
        img.src = e.target.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}
