/* ============================================
   LANDING.JS — Hero sparkles, landing interactions
   ============================================ */
import { showToast } from './main.js';

document.addEventListener('DOMContentLoaded', () => {

  /* ---- Sparkles ---- */
  const sparkleContainer = document.getElementById('sparkles');
  const SPARKLE_CHARS = ['✦', '✧', '◆', '◇', '⬡', '★', '✶'];

  function createSparkle() {
    if (!sparkleContainer) return;
    const el = document.createElement('span');
    el.className = 'sparkle';
    el.textContent = SPARKLE_CHARS[Math.floor(Math.random() * SPARKLE_CHARS.length)];
    el.style.left   = `${Math.random() * 100}%`;
    el.style.top    = `${60 + Math.random() * 35}%`;
    el.style.fontSize = `${10 + Math.random() * 14}px`;
    el.style.color  = ['#F9C79A', '#F59E0B', '#F97316', '#EF4444', '#d1d1d1'][Math.floor(Math.random() * 5)];
    el.style.animationDuration = `${2 + Math.random() * 2}s`;
    el.style.animationDelay   = `${Math.random() * 1.5}s`;
    el.style.animationName    = 'sparkleDrift';
    el.style.animationTimingFunction = 'ease-out';
    el.style.animationFillMode = 'forwards';
    sparkleContainer.appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  // Spawn sparkles periodically
  setInterval(createSparkle, 500);
  // Initial burst
  for (let i = 0; i < 6; i++) setTimeout(createSparkle, i * 150);

  /* ---- Active nav link on scroll ---- */
  const sections = document.querySelectorAll('section[id]');
  const navLinks  = document.querySelectorAll('.navbar__link[href^="#"]');

  const sectionObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        navLinks.forEach(link => {
          link.style.fontWeight = link.getAttribute('href') === `#${id}` ? '700' : '500';
          link.style.color = link.getAttribute('href') === `#${id}` ? 'var(--color-text-primary)' : '';
        });
      }
    });
  }, { threshold: 0.4 });

  sections.forEach(s => sectionObserver.observe(s));

  /* ---- Sample dataset buttons on landing page (if present) ---- */
  document.querySelectorAll('[data-sample]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('loadSample', btn.dataset.sample);
      window.location.href = 'dashboard.html';
    });
  });

  /* ---- CTA button hover glow ---- */
  document.querySelectorAll('.btn-primary').forEach(btn => {
    btn.addEventListener('mouseenter', () => {
      btn.style.boxShadow = '5px 5px 0px #000, 0 0 20px rgba(249,199,154,0.4)';
    });
    btn.addEventListener('mouseleave', () => {
      btn.style.boxShadow = '';
    });
  });

});