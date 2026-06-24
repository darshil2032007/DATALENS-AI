/* ============================================
   MAIN.JS — Shared: navbar, scroll-reveal, toasts
   ============================================ */

/* ---- Navbar scroll shadow ---- */
const navbar = document.getElementById('navbar');
if (navbar) {
  window.addEventListener('scroll', () => {
    navbar.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
}

/* ---- Mobile hamburger ---- */
const hamburger  = document.getElementById('hamburger');
const mobileNav  = document.getElementById('mobileNav');

if (hamburger && mobileNav) {
  hamburger.addEventListener('click', () => {
    const open = mobileNav.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', open);
  });

  // Close when a link inside is clicked
  mobileNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => mobileNav.classList.remove('open'));
  });
}

/* ---- Smooth scroll for anchor links ---- */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', (e) => {
    const target = document.querySelector(anchor.getAttribute('href'));
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      mobileNav?.classList.remove('open');
    }
  });
});

/* ---- Scroll-reveal (IntersectionObserver) ---- */
const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
);

function initScrollReveal() {
  document.querySelectorAll('.fade-up, .fade-in, .scale-in').forEach(el => {
    revealObserver.observe(el);
  });
}

// Run on DOM ready and also export for dashboard to call after dynamic content
document.addEventListener('DOMContentLoaded', initScrollReveal);
export { initScrollReveal };

/* ============================================
   TOAST NOTIFICATION SYSTEM
   ============================================ */
const toastContainer = document.getElementById('toastContainer');

/**
 * showToast(message, type='info', duration=3500)
 * types: 'info' | 'success' | 'error'
 */
export function showToast(message, type = 'info', duration = 3500) {
  if (!toastContainer) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:16px;line-height:1;">${icons[type]}</span><span>${message}</span>`;
  toast.style.animation = 'slideInToast 0.3s ease';

  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease forwards';
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// Make globally available for non-module scripts
window.showToast = showToast;