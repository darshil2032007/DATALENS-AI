/* ============================================
   UPLOAD.JS — Drag & drop + file input handler
   ============================================ */
import { parseFile } from './csvParser.js';
import { showToast }  from './main.js';

/**
 * initUpload({ onFile(result), onError(err) })
 * Wires up the upload zone, file input, and drag events.
 */
export function initUpload({ onFile, onError }) {
  const zone  = document.getElementById('uploadZone');
  const input = document.getElementById('fileInput');

  if (!zone || !input) return;

  /* ---- File input change ---- */
  input.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (file) await handleFile(file, onFile, onError);
    input.value = ''; // reset so same file can be re-selected
  });

  /* ---- Drag over ---- */
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.add('drag-over');
  });

  zone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    zone.classList.remove('drag-over');
  });

  /* ---- Drop ---- */
  zone.addEventListener('drop', async (e) => {
    e.preventDefault();
    e.stopPropagation();
    zone.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) await handleFile(file, onFile, onError);
  });

  /* ---- Click on zone (but not on buttons) ---- */
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
    const msg = `File is too large (${(file.size / 1_000_000).toFixed(1)} MB). Max is ${MAX_MB} MB.`;
    showToast(msg, 'error', 5000);
    onError?.(new Error(msg));
    return;
  }

  showToast(`Parsing ${file.name}…`, 'info', 2000);

  try {
    const result = await parseFile(file);
    if (!result.data.length) throw new Error('File is empty or could not be parsed.');
    showToast(`✓ Loaded ${result.data.length.toLocaleString()} rows`, 'success');
    onFile(result);
  } catch (err) {
    showToast(err.message, 'error', 6000);
    onError?.(err);
  }
}