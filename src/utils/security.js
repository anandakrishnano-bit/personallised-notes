/**
 * Security utilities — input sanitization, safe deserialization, and validation.
 * Operates silently without displaying security jargon to the user.
 */

export function sanitizeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function sanitizeTextContent(str) {
  if (typeof str !== 'string') return '';
  // Strip control chars except newline and tab
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
}

export function validateSafeJson(jsonStr) {
  try {
    const parsed = JSON.parse(jsonStr);
    // Guard against prototype pollution
    if (parsed && typeof parsed === 'object') {
      delete parsed.__proto__;
      delete parsed.constructor;
      delete parsed.prototype;
    }
    return parsed;
  } catch (e) {
    return null;
  }
}

export function isSafeDataUrl(url) {
  if (typeof url !== 'string') return false;
  return url.startsWith('data:image/') || url.startsWith('blob:');
}
