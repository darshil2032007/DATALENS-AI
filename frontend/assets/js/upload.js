/* ============================================
   UPLOAD.JS — Drag & drop file handler
   Parses locally (for Chart.js) and passes the
   raw File object through so dashboard.js can
   send it to the backend for pandas profiling.
   Single source of truth — no duplicate uploads.
   ============================================ */
import { parseFile }    from './csvParser.js';
import { Notification } from './notifications.js';

/**
 * initUpload({ onFile(result), onError(err) })
 * result = { data, columns, filename, _isFile }
 */
export function initUpload({ onFile, onError }) {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  if (!zone || !input) return;

  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file, onFile, onError);
    input.value = '';
  });

  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
  });

  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file, onFile, onError);
  });

  zone.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    if (e.target === input) return;
    e.stopPropagation();
    input.click();
  });
}

async function handleFile(file, onFile, onError) {
  const MAX_MB = 25;
  if (file.size > MAX_MB * 1024 * 1024) {
    const msg = `File exceeds the ${MAX_MB} MB limit (${(file.size / 1_000_000).toFixed(1)} MB).`;
    Notification.show({ type: 'error', title: 'File too large', description: file.name, subtitle: msg, autoDismiss: 6000 });
    onError?.(new Error(msg));
    return;
  }

  Notification.show({ type: 'loading', title: 'Reading file…', description: file.name });

  try {
    const result = await parseFile(file);
    if (!result.data.length) throw new Error('File is empty or could not be parsed.');

    Notification.dismiss();

    // Pass the original File object through — dashboard.js sends it to the
    // backend as-is for accurate pandas parsing (preserves original
    // encoding/format rather than re-serializing from parsed JS data).
    result._isFile = file;
    onFile(result);
  } catch (err) {
    Notification.update({
      type: 'error', title: 'Upload failed',
      description: file.name, subtitle: err.message, autoDismiss: 6000,
    });
    onError?.(err);
  }
}