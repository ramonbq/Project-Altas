export const DAY_MS = 86400000;

export function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `atlas-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function escapeHTML(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function escapeAttr(value = '') {
  return escapeHTML(value).replaceAll('`', '&#096;');
}

export function formatDate(value, options = {}) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value.includes?.('T') ? value : `${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  const { year = 'numeric', ...rest } = options;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    ...(year === false ? {} : { year }),
    ...rest
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
}

export function formatTime(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function toISODate(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(value, days) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function startOfWeek(date = new Date(), weekStartsOn = 1) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (d.getDay() - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  return d;
}

export function endOfWeek(date = new Date(), weekStartsOn = 1) {
  const d = startOfWeek(date, weekStartsOn);
  d.setDate(d.getDate() + 6);
  return d;
}

export function getDateRange(preset, customStart = '', customEnd = '', weekStartsOn = 1) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let start = today;
  let end = today;

  switch (preset) {
    case 'week':
      start = startOfWeek(today, weekStartsOn);
      end = endOfWeek(today, weekStartsOn);
      break;
    case 'month':
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      break;
    case 'quarter': {
      const q = Math.floor(today.getMonth() / 3);
      start = new Date(today.getFullYear(), q * 3, 1);
      end = new Date(today.getFullYear(), q * 3 + 3, 0);
      break;
    }
    case 'year':
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
      break;
    case 'fiscal': {
      const year = today.getMonth() >= 8 ? today.getFullYear() : today.getFullYear() - 1;
      start = new Date(year, 8, 1);
      end = new Date(year + 1, 7, 31);
      break;
    }
    case 'custom':
      start = customStart ? new Date(`${customStart}T00:00:00`) : today;
      end = customEnd ? new Date(`${customEnd}T23:59:59`) : today;
      break;
    default:
      start = new Date(2000, 0, 1);
      end = new Date(2100, 0, 1);
  }

  return { start, end, startISO: toISODate(start), endISO: toISODate(end) };
}

export function isDateInRange(value, start, end) {
  if (!value) return false;
  const d = new Date(value.includes?.('T') ? value : `${value}T12:00:00`);
  return d >= start && d <= end;
}

export function isOverdue(task, now = new Date()) {
  if (!task?.dueDate || task.status === 'completed') return false;
  const due = new Date(`${task.dueDate}T23:59:59`);
  return due < now;
}

export function isDueToday(task) {
  return task?.status !== 'completed' && task?.dueDate === todayISO();
}

export function isDueThisWeek(task, weekStartsOn = 1) {
  if (!task?.dueDate || task.status === 'completed') return false;
  const { start, end } = getDateRange('week', '', '', weekStartsOn);
  return isDateInRange(task.dueDate, start, end);
}

export function daysBetween(startValue, endValue) {
  if (!startValue || !endValue) return null;
  const start = new Date(startValue);
  const end = new Date(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return Math.max(0, Math.round((end - start) / DAY_MS));
}

export function formatFileSize(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

export function debounce(fn, wait = 200) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'atlas-export';
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadText(text, filename, type = 'text/plain;charset=utf-8') {
  downloadBlob(new Blob([text], { type }), filename);
}

export function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Unable to read file.'));
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, maxDimension = 1800, quality = 0.86) {
  if (!file.type.startsWith('image/')) return { dataUrl: await fileToDataURL(file), type: file.type, size: file.size };
  const source = await fileToDataURL(file);
  const image = new Image();
  image.src = source;
  await image.decode();

  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { alpha: false });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const size = Math.round((dataUrl.length - dataUrl.indexOf(',') - 1) * 0.75);
  return { dataUrl, type: 'image/jpeg', size, width, height };
}

export function getInitials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AT';
  return parts.slice(0, 2).map(part => part[0].toUpperCase()).join('');
}

export function parseTags(value = '') {
  return [...new Set(String(value).split(',').map(tag => tag.trim()).filter(Boolean))];
}

export function normalizeURL(value = '') {
  const url = String(value).trim();
  if (!url) return '';
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
  return `https://${url}`;
}

export function humanizeStatus(status = '') {
  const map = { open: 'Open', waiting: 'Waiting On', completed: 'Completed' };
  return map[status] || status;
}

export function safeJSONParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

export function sortByDateDesc(items, key = 'updatedAt') {
  return [...items].sort((a, b) => new Date(b[key] || 0) - new Date(a[key] || 0));
}

export function wordCount(value = '') {
  return String(value).trim() ? String(value).trim().split(/\s+/).length : 0;
}

export function truncate(value = '', length = 120) {
  const text = String(value).replace(/\s+/g, ' ').trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function taskImpactSuggestion(task) {
  const base = task?.title?.trim() || 'Completed assigned work';
  const workstream = task?.workstreamName ? ` for ${task.workstreamName}` : '';
  return `${base}${workstream}, supporting timely follow-through and organized delivery of work.`;
}

export function printDocument(title, bodyHTML) {
  const popup = window.open('', '_blank', 'noopener,noreferrer');
  if (!popup) throw new Error('Your browser blocked the print window. Allow pop-ups and try again.');
  popup.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>
    body{font-family:Arial,Helvetica,sans-serif;color:#172033;max-width:850px;margin:48px auto;padding:0 28px;line-height:1.55}
    h1,h2,h3{line-height:1.2} h1{font-size:28px} h2{margin-top:28px;border-bottom:1px solid #ddd;padding-bottom:8px}
    .meta{color:#5d6678;font-size:14px}.pill{display:inline-block;padding:3px 8px;border:1px solid #bbb;border-radius:999px;margin-right:5px;font-size:12px}
    table{border-collapse:collapse;width:100%;margin:16px 0}th,td{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f3f5f8}
    ul{padding-left:22px} .pre{white-space:pre-wrap} .no-print{display:none!important}
    @media print{body{margin:0;max-width:none}.page-break{break-before:page}}
  </style></head><body>${bodyHTML}</body></html>`);
  popup.document.close();
  popup.focus();
  setTimeout(() => popup.print(), 300);
}

export function wordCompatibleHTML(title, bodyHTML) {
  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${escapeHTML(title)}</title><style>body{font-family:Calibri,Arial,sans-serif;font-size:11pt;line-height:1.45;color:#111827}h1{font-size:20pt}h2{font-size:15pt;margin-top:20pt}table{border-collapse:collapse;width:100%}th,td{border:1px solid #b8bec8;padding:6pt;text-align:left}.pre{white-space:pre-wrap}</style></head><body>${bodyHTML}</body></html>`;
}
