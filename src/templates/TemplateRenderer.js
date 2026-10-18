/**
 * TemplateRenderer — Renders paper backgrounds and page templates on the background canvas.
 * Highly optimized: only redraws when page size, zoom, or template changes.
 */
import { TEMPLATES } from '../models/Page.js';

export class TemplateRenderer {
  /**
   * Render background page & pattern.
   * @param {CanvasRenderingContext2D} ctx - Background canvas 2D context
   * @param {Object} page - Current Page model
   * @param {number} width - Page width in doc coords
   * @param {number} height - Page height in doc coords
   */
  static render(ctx, page, width, height) {
    const templateKey = page.template || 'blank-white';
    const def = TEMPLATES[templateKey] || TEMPLATES['blank-white'];

    // 1. Draw page base background and drop shadow
    ctx.save();
    
    // Page sheet background color
    let bgColor = page.bgColor || def.bgColor || '#ffffff';
    const isDark = bgColor === '#2a2a3a' || bgColor === '#0f0f1a' || bgColor === '#18181b' || bgColor === '#0f172a';

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    // Subtle page border
    ctx.strokeStyle = isDark ? '#3d3d54' : '#e0e0e8';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, width, height);

    // Line/dot color based on paper brightness
    const lineColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(50, 70, 110, 0.16)';
    const marginColor = isDark ? 'rgba(255, 100, 100, 0.35)' : 'rgba(220, 50, 50, 0.35)';
    const dotColor = isDark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(30, 50, 90, 0.25)';

    // 2. Render specific template patterns
    switch (templateKey) {
      case 'ruled-narrow':
      case 'ruled-std':
      case 'ruled-wide': {
        const spacing = def.lineSpacing || 28;
        const topMargin = 60;
        const leftMargin = 60;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;

        ctx.beginPath();
        for (let y = topMargin; y < height - 20; y += spacing) {
          ctx.moveTo(leftMargin / 2, Math.floor(y) + 0.5);
          ctx.lineTo(width - leftMargin / 2, Math.floor(y) + 0.5);
        }
        ctx.stroke();

        // Red margin line
        ctx.strokeStyle = marginColor;
        ctx.beginPath();
        ctx.moveTo(leftMargin + 0.5, 0);
        ctx.lineTo(leftMargin + 0.5, height);
        ctx.stroke();
        break;
      }

      case 'grid-small':
      case 'grid-medium':
      case 'grid-large': {
        const size = def.gridSize || 24;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 0.8;

        ctx.beginPath();
        // Vertical lines
        for (let x = size; x < width; x += size) {
          ctx.moveTo(Math.floor(x) + 0.5, 0);
          ctx.lineTo(Math.floor(x) + 0.5, height);
        }
        // Horizontal lines
        for (let y = size; y < height; y += size) {
          ctx.moveTo(0, Math.floor(y) + 0.5);
          ctx.lineTo(width, Math.floor(y) + 0.5);
        }
        ctx.stroke();
        break;
      }

      case 'grid-eng':
      case 'eng-sepia': {
        const isSepia = templateKey === 'eng-sepia';
        const size = 16;
        const headerH = 46;
        const leftMargin = 52;

        const minorColor = isSepia
          ? (isDark ? 'rgba(210, 170, 110, 0.15)' : 'rgba(160, 115, 60, 0.17)')
          : (isDark ? 'rgba(80, 200, 110, 0.15)' : 'rgba(35, 140, 75, 0.17)');
        const majorColor = isSepia
          ? (isDark ? 'rgba(210, 170, 110, 0.38)' : 'rgba(150, 100, 45, 0.40)')
          : (isDark ? 'rgba(80, 200, 110, 0.38)' : 'rgba(30, 130, 65, 0.42)');
        const borderCol = isSepia
          ? (isDark ? 'rgba(230, 180, 120, 0.55)' : 'rgba(140, 90, 40, 0.60)')
          : (isDark ? 'rgba(100, 220, 130, 0.55)' : 'rgba(25, 120, 60, 0.60)');

        // 1. Grid Lines
        ctx.lineWidth = 0.5;
        for (let x = leftMargin; x < width - 10; x += size) {
          const isMajor = Math.round((x - leftMargin) / size) % 5 === 0;
          ctx.strokeStyle = isMajor ? majorColor : minorColor;
          ctx.beginPath();
          ctx.moveTo(Math.floor(x) + 0.5, headerH);
          ctx.lineTo(Math.floor(x) + 0.5, height);
          ctx.stroke();
        }
        for (let y = headerH; y < height; y += size) {
          const isMajor = Math.round((y - headerH) / size) % 5 === 0;
          ctx.strokeStyle = isMajor ? majorColor : minorColor;
          ctx.beginPath();
          ctx.moveTo(leftMargin, Math.floor(y) + 0.5);
          ctx.lineTo(width, Math.floor(y) + 0.5);
          ctx.stroke();
        }

        // 2. Left Margin Line
        ctx.strokeStyle = borderCol;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(leftMargin + 0.5, 0);
        ctx.lineTo(leftMargin + 0.5, height);
        ctx.stroke();

        // 3. Header Title Block
        ctx.beginPath();
        ctx.moveTo(0, headerH + 0.5);
        ctx.lineTo(width, headerH + 0.5);
        ctx.stroke();

        // Vertical dividers in header
        const col1 = width * 0.45;
        const col2 = width * 0.65;
        const col3 = width * 0.82;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(col1 + 0.5, 0); ctx.lineTo(col1 + 0.5, headerH);
        ctx.moveTo(col2 + 0.5, 0); ctx.lineTo(col2 + 0.5, headerH);
        ctx.moveTo(col3 + 0.5, 0); ctx.lineTo(col3 + 0.5, headerH);
        ctx.stroke();

        // Header field labels
        ctx.fillStyle = borderCol;
        ctx.font = '600 9px monospace, sans-serif';
        ctx.fillText('PROJECT / SUBJECT', 10, 16);
        ctx.fillText('DATE', col1 + 8, 16);
        ctx.fillText('PAGE', col2 + 8, 16);
        ctx.fillText('ENGINEER / BY', col3 + 8, 16);
        break;
      }

      case 'dot-fine':
      case 'dot-medium':
      case 'dot-large': {
        const spacing = def.dotSpacing || 24;
        const r = def.dotSize || 1.2;
        ctx.fillStyle = dotColor;

        for (let x = spacing; x < width; x += spacing) {
          for (let y = spacing; y < height; y += spacing) {
            ctx.beginPath();
            ctx.arc(x, y, r, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;
      }

      case 'cornell': {
        const cueWidth = width * 0.3;
        const summaryHeight = height * 0.2;
        const topHeaderHeight = 50;
        const spacing = 28;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;

        // Header line
        ctx.beginPath();
        ctx.moveTo(0, topHeaderHeight + 0.5);
        ctx.lineTo(width, topHeaderHeight + 0.5);
        ctx.stroke();

        // Vertical dividing line
        ctx.beginPath();
        ctx.moveTo(cueWidth + 0.5, topHeaderHeight);
        ctx.lineTo(cueWidth + 0.5, height - summaryHeight);
        ctx.stroke();

        // Summary bottom line
        ctx.beginPath();
        ctx.moveTo(0, height - summaryHeight + 0.5);
        ctx.lineTo(width, height - summaryHeight + 0.5);
        ctx.stroke();

        // Ruled lines in note area
        ctx.beginPath();
        for (let y = topHeaderHeight + spacing; y < height - summaryHeight; y += spacing) {
          ctx.moveTo(cueWidth, Math.floor(y) + 0.5);
          ctx.lineTo(width, Math.floor(y) + 0.5);
        }
        ctx.stroke();

        // Labels
        ctx.fillStyle = isDark ? '#707090' : '#808098';
        ctx.font = '600 12px sans-serif';
        ctx.fillText('TITLE / TOPIC:', 20, 30);
        ctx.fillText('CUES / QUESTIONS', 20, topHeaderHeight + 25);
        ctx.fillText('NOTES', cueWidth + 20, topHeaderHeight + 25);
        ctx.fillText('SUMMARY', 20, height - summaryHeight + 25);
        break;
      }

      case 'todo': {
        const spacing = 36;
        const top = 60;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;

        ctx.fillStyle = isDark ? '#a0a0c0' : '#505070';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText('TO-DO LIST', 40, 36);

        for (let y = top; y < height - 30; y += spacing) {
          // Checkbox circle
          ctx.strokeStyle = isDark ? '#606080' : '#a0a0b8';
          ctx.beginPath();
          ctx.arc(50, y - 5, 8, 0, Math.PI * 2);
          ctx.stroke();

          // Underline
          ctx.strokeStyle = lineColor;
          ctx.beginPath();
          ctx.moveTo(70, Math.floor(y) + 0.5);
          ctx.lineTo(width - 40, Math.floor(y) + 0.5);
          ctx.stroke();
        }
        break;
      }

      case 'weekly': {
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        const colW = (width - 40) / 2;
        const rowH = (height - 60) / 4;

        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;
        ctx.fillStyle = isDark ? '#a0a0c0' : '#505070';
        ctx.font = '600 12px sans-serif';

        days.forEach((day, i) => {
          const col = i < 4 ? 0 : 1;
          const row = i < 4 ? i : i - 4;
          const x = 20 + col * colW;
          const y = 40 + row * rowH;

          ctx.strokeRect(x, y, colW - 10, rowH - 10);
          ctx.fillText(day.toUpperCase(), x + 10, y + 20);
        });
        break;
      }

      case 'isometric': {
        const a = 24;
        const hStep = a * Math.sqrt(3);
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 0.6;
        ctx.beginPath();

        for (let x = -width; x < width * 2; x += a * 1.5) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x + height / Math.sqrt(3), height);

          ctx.moveTo(x, 0);
          ctx.lineTo(x - height / Math.sqrt(3), height);
        }
        for (let y = 0; y < height; y += hStep / 2) {
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
        }
        ctx.stroke();
        break;
      }

      case 'music': {
        const staffSpacing = 8;
        const groupSpacing = 70;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1;

        for (let top = 60; top < height - 60; top += groupSpacing) {
          ctx.beginPath();
          for (let line = 0; line < 5; line++) {
            const y = top + line * staffSpacing;
            ctx.moveTo(40, Math.floor(y) + 0.5);
            ctx.lineTo(width - 40, Math.floor(y) + 0.5);
          }
          ctx.stroke();
        }
        break;
      }

      default:
        // Plain blank background already rendered above
        break;
    }

    ctx.restore();
  }
}
