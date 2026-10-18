/**
 * TableTool — Insert, position, and edit responsive data tables on note pages.
 * Supports editable cells, draggable position, dynamic row/col addition, and crisp canvas export.
 */
import { BaseTool } from './BaseTool.js';
import { icons } from '../ui/icons.js';

export class TableTool extends BaseTool {
  constructor(app) {
    super(app);
    this.name = 'table';
    this.cursor = 'cell';
    this.activeEditor = null;
  }

  onPointerDown(point) {
    const page = this.app.currentPage;
    if (!page) return;

    if (this.activeEditor) {
      this.closeEditor();
      return;
    }

    // Check if clicking near an existing table
    const hitIdx = (page.tables || []).findIndex(t => {
      const w = t.cols * 95;
      const h = (t.rows + 1) * 30;
      return point.x >= t.x && point.x <= t.x + w && point.y >= t.y && point.y <= t.y + h;
    });

    if (hitIdx >= 0) {
      this.editTable(page.tables[hitIdx], hitIdx);
    } else {
      this.createTable(point.x, point.y);
    }
  }

  createTable(docX, docY, rows = 3, cols = 3) {
    const page = this.app.currentPage;
    if (!page) return;

    const w = cols * 95;
    const h = (rows + 1) * 30;
    const pageWidth = page.width || 794;
    const pageHeight = page.height || 1123;
    const x = page.isInfinite ? Math.round(docX) : Math.max(10, Math.min(pageWidth - w - 10, Math.round(docX)));
    const y = page.isInfinite ? Math.round(docY) : Math.max(10, Math.min(pageHeight - h - 10, Math.round(docY)));

    const data = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push(r === 0 ? `Col ${c + 1}` : `Data ${r},${c + 1}`);
      }
      data.push(row);
    }

    const tableObj = {
      id: `tbl_${Date.now()}`,
      x,
      y,
      rows,
      cols,
      data
    };

    page.tables = page.tables || [];
    page.tables.push(tableObj);
    page.modifiedAt = Date.now();

    this.app.redrawContent();
    this.app.scheduleSave();
    this.editTable(tableObj, page.tables.length - 1);
  }

  closeEditor() {
    if (this.activeEditor) {
      this.activeEditor.remove();
      this.activeEditor = null;
      this.app.redrawContent();
      this.app.scheduleSave();
    }
  }

  editTable(tableObj, idx) {
    if (this.activeEditor) {
      this.activeEditor.remove();
      this.activeEditor = null;
    }

    const screenPos = this.cm.docToScreen(tableObj.x, tableObj.y);
    const container = this.cm.container;

    const box = document.createElement('div');
    box.className = 'canvas-table-box';
    box.style.left = `${screenPos.x}px`;
    box.style.top = `${screenPos.y}px`;

    let curDocX = tableObj.x;
    let curDocY = tableObj.y;

    const renderDOM = () => {
      box.innerHTML = `
        <div class="canvas-table-drag-handle">
          <span style="display: flex; align-items: center; gap: 5px; font-weight: 600;">
            <span>⠿</span> <span>Table (${tableObj.rows} × ${tableObj.cols})</span>
          </span>
          <div style="display: flex; gap: 4px; align-items: center;">
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="tbl-sub-row" style="height: 22px; font-size: 11px; padding: 0 6px;" title="Remove Row" ${tableObj.rows <= 1 ? 'disabled' : ''}>- Row</button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="tbl-add-row" style="height: 22px; font-size: 11px; padding: 0 6px;" title="Add Row">+ Row</button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="tbl-sub-col" style="height: 22px; font-size: 11px; padding: 0 6px;" title="Remove Column" ${tableObj.cols <= 1 ? 'disabled' : ''}>- Col</button>
            <button class="ui-btn ui-btn-outline ui-btn-sm" id="tbl-add-col" style="height: 22px; font-size: 11px; padding: 0 6px;" title="Add Column">+ Col</button>
            <button class="ui-btn ui-btn-ghost ui-btn-icon-sm" id="tbl-del" style="height: 22px; width: 22px; padding: 0; color: hsl(var(--destructive));" title="Delete Table">${icons.trash}</button>
            <button class="ui-btn ui-btn-default ui-btn-sm" id="tbl-done" style="height: 22px; font-size: 11px; padding: 0 8px;">Done</button>
          </div>
        </div>
        <table>
          <tbody>
            ${tableObj.data.map((row, rIdx) => `
              <tr>
                ${row.map((cell, cIdx) => `
                  <${rIdx === 0 ? 'th' : 'td'} contenteditable="true" data-r="${rIdx}" data-c="${cIdx}">${cell || ''}</${rIdx === 0 ? 'th' : 'td'}>
                `).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      // Draggable logic
      const handle = box.querySelector('.canvas-table-drag-handle');
      let isDragging = false;
      let startX = 0, startY = 0, boxX = screenPos.x, boxY = screenPos.y;

      handle.addEventListener('pointerdown', (e) => {
        if (e.target.tagName === 'BUTTON') return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        boxX = parseFloat(box.style.left) || 0;
        boxY = parseFloat(box.style.top) || 0;
        handle.setPointerCapture(e.pointerId);
        e.stopPropagation();
      });

      handle.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const nx = boxX + (e.clientX - startX);
        const ny = boxY + (e.clientY - startY);
        box.style.left = `${nx}px`;
        box.style.top = `${ny}px`;

        const docPt = this.cm.screenToDoc(nx, ny);
        curDocX = docPt.x;
        curDocY = docPt.y;
        tableObj.x = Math.round(curDocX);
        tableObj.y = Math.round(curDocY);
      });

      const stopDrag = (e) => {
        if (isDragging) {
          isDragging = false;
          try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
          this.app.redrawContent();
          this.app.scheduleSave();
        }
      };
      handle.addEventListener('pointerup', stopDrag);
      handle.addEventListener('pointercancel', stopDrag);

      // Save cell edits
      box.querySelectorAll('[contenteditable]').forEach(cell => {
        cell.addEventListener('input', () => {
          const r = parseInt(cell.getAttribute('data-r'), 10);
          const c = parseInt(cell.getAttribute('data-c'), 10);
          if (tableObj.data[r]) {
            tableObj.data[r][c] = cell.innerText;
            this.app.scheduleSave();
          }
        });
      });

      // Reduce Row
      box.querySelector('#tbl-sub-row')?.addEventListener('click', () => {
        if (tableObj.rows > 1) {
          tableObj.data.pop();
          tableObj.rows--;
          renderDOM();
          this.app.redrawContent();
          this.app.scheduleSave();
        }
      });

      // Add Row
      box.querySelector('#tbl-add-row')?.addEventListener('click', () => {
        const newRow = new Array(tableObj.cols).fill('');
        tableObj.data.push(newRow);
        tableObj.rows++;
        renderDOM();
        this.app.redrawContent();
        this.app.scheduleSave();
      });

      // Reduce Column
      box.querySelector('#tbl-sub-col')?.addEventListener('click', () => {
        if (tableObj.cols > 1) {
          tableObj.data.forEach(row => row.pop());
          tableObj.cols--;
          renderDOM();
          this.app.redrawContent();
          this.app.scheduleSave();
        }
      });

      // Add Column
      box.querySelector('#tbl-add-col')?.addEventListener('click', () => {
        tableObj.cols++;
        tableObj.data.forEach((row, i) => {
          row.push(i === 0 ? `Col ${tableObj.cols}` : '');
        });
        renderDOM();
        this.app.redrawContent();
        this.app.scheduleSave();
      });

      // Delete table
      box.querySelector('#tbl-del')?.addEventListener('click', () => {
        const page = this.app.currentPage;
        if (page && page.tables) {
          page.tables.splice(idx, 1);
          page.modifiedAt = Date.now();
        }
        box.remove();
        this.activeEditor = null;
        this.app.redrawContent();
        this.app.scheduleSave();
      });

      // Done button
      box.querySelector('#tbl-done')?.addEventListener('click', () => {
        box.remove();
        this.activeEditor = null;
        this.app.redrawContent();
        this.app.scheduleSave();
        // Revert to pen tool
        this.app.toolbar?.setTool('pen');
      });
    };

    renderDOM();
    container.appendChild(box);
    this.activeEditor = box;
  }

  /** Render tables directly to canvas (for content & exports) */
  static renderTables(ctx, tables) {
    if (!tables || tables.length === 0) return;

    for (const t of tables) {
      const colW = 95;
      const rowH = 30;
      const totalW = t.cols * colW;
      const totalH = t.rows * rowH;

      ctx.save();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const borderCol = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.2)';
      const textCol = isDark ? '#fafafa' : '#18181b';
      const headerBg = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)';

      // Header row background
      ctx.fillStyle = headerBg;
      ctx.fillRect(t.x, t.y, totalW, rowH);

      // Grid lines
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = 1;

      for (let r = 0; r <= t.rows; r++) {
        const y = t.y + r * rowH;
        ctx.beginPath();
        ctx.moveTo(t.x, Math.floor(y) + 0.5);
        ctx.lineTo(t.x + totalW, Math.floor(y) + 0.5);
        ctx.stroke();
      }

      for (let c = 0; c <= t.cols; c++) {
        const x = t.x + c * colW;
        ctx.beginPath();
        ctx.moveTo(Math.floor(x) + 0.5, t.y);
        ctx.lineTo(Math.floor(x) + 0.5, t.y + totalH);
        ctx.stroke();
      }

      // Cell texts
      ctx.fillStyle = textCol;
      ctx.textBaseline = 'middle';

      for (let r = 0; r < t.rows; r++) {
        for (let c = 0; c < t.cols; c++) {
          const val = t.data?.[r]?.[c] || '';
          if (r === 0) {
            ctx.font = '600 12px Inter, sans-serif';
          } else {
            ctx.font = '400 12px Inter, sans-serif';
          }
          const cx = t.x + c * colW + 8;
          const cy = t.y + r * rowH + rowH / 2;
          ctx.fillText(val, cx, cy, colW - 12);
        }
      }

      ctx.restore();
    }
  }
}
