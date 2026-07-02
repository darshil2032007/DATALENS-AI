/* ============================================
   STEPPER.JS — URL hash sync, keyboard nav,
   scroll active tab into view
   Import this in dashboard.html after dashboard.js
   ============================================ */

/* ---- Sync step to URL hash ---- */
export function syncHashToStep() {
  const hash = window.location.hash; // e.g. "#step=3"
  const match = hash.match(/step=(\d)/);
  if (match) {
    const n = parseInt(match[1]);
    if (n >= 1 && n <= 6) return n;
  }
  return null;
}

export function updateHash(step) {
  history.replaceState(null, '', `#step=${step}`);
}

/* ---- Scroll active tab into view (mobile) ---- */
export function scrollTabIntoView(step) {
  const tab = document.querySelector(`.step-tab[data-step="${step}"]`);
  if (!tab) return;
  tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}

/* ---- Keyboard shortcut: Left/Right arrow between steps ---- */
export function initKeyboardNav(goToStepFn, getStepFn) {
  document.addEventListener('keydown', (e) => {
    // Don't intercept when typing in an input/textarea/select
    const tag = document.activeElement?.tagName?.toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;

    if (e.key === 'ArrowRight' || e.key === ']') {
      const next = Math.min(getStepFn() + 1, 6);
      goToStepFn(next);
    }
    if (e.key === 'ArrowLeft' || e.key === '[') {
      const prev = Math.max(getStepFn() - 1, 1);
      goToStepFn(prev);
    }
  });
}

/* ---- Browser back/forward button support ---- */
export function initHistoryNav(goToStepFn) {
  window.addEventListener('popstate', () => {
    const step = syncHashToStep();
    if (step) goToStepFn(step, false); // false = don't push hash again
  });
}

/* ---- Progress: mark step complete ---- */
export function markComplete(step) {
  const tab = document.querySelector(`.step-tab[data-step="${step}"]`);
  if (tab) tab.classList.add('completed');
}

/* ---- Show/hide step wizard ---- */
export function showWizard() {
  document.getElementById('stepWizard')?.classList.add('visible');
}

export function hideWizard() {
  document.getElementById('stepWizard')?.classList.remove('visible');
}