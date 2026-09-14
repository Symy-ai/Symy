// Symy Pitch Deck — Main Application Logic
// This file is loaded via <script> and provides the initApp() function
// that is called after all slide HTML fragments are dynamically loaded.

function initApp() {
  const S = document.querySelectorAll('.sl'), T = S.length;
  let c = 0, tr = false;
  const nd = document.getElementById('nds');

  // Create navigation dots
  for (let i = 0; i < T; i++) {
    const d = document.createElement('button');
    d.className = 'nd';
    d.onclick = () => go(i);
    nd.appendChild(d);
  }

  function go(i) {
    if (tr || i === c || i < 0 || i >= T) return;
    tr = true;
    const dir = i > c ? 1 : -1, o = S[c], n = S[i];
    o.classList.remove('on');
    o.classList.add(dir > 0 ? 'el' : 'er');
    n.style.transform = dir > 0 ? 'translateX(60px)' : 'translateX(-60px)';
    n.style.opacity = '0';
    void n.offsetWidth;
    requestAnimationFrame(() => {
      n.classList.add('on');
      n.classList.remove('el', 'er');
      n.style.transform = '';
      n.style.opacity = '';
    });
    c = i;
    up();

    setTimeout(() => { o.classList.remove('el', 'er'); tr = false; }, 600);
  }

  function next() { go(c + 1); }
  function prev() { go(c - 1); }

  // Make next/prev globally accessible for onclick handlers in HTML
  window.next = next;
  window.prev = prev;

  function up() {
    const ds = nd.querySelectorAll('.nd');
    ds.forEach((d, i) => d.classList.toggle('on', i === c));
    document.getElementById('ncnt').textContent = `${c + 1} / ${T}`;
    document.getElementById('pbtn').disabled = c === 0;
    document.getElementById('nbtn').disabled = c === T - 1;
    document.getElementById('pb').style.width = `${((c + 1) / T) * 100}%`;
  }

  function playDemo() {
    document.getElementById('dov').classList.add('hid');
    window.focus();
  }
  window.playDemo = playDemo;



  // Keyboard navigation
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'Enter') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  });

  // Touch/swipe navigation
  let tx = 0;
  document.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, { passive: true });
  document.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - tx;
    if (Math.abs(dx) > 50) { dx < 0 ? next() : prev(); }
  }, { passive: true });

  // Initial state update
  up();

  // Particle system for finale slide
  (function () {
    const cv = document.getElementById('pcv');
    if (!cv) return;
    const ctx = cv.getContext('2d');
    let W, H, particles = [];
    function resize() {
      const r = cv.parentElement.getBoundingClientRect();
      W = cv.width = r.width;
      H = cv.height = r.height;
    }
    resize();
    window.addEventListener('resize', resize);
    function Particle() { this.reset(); }
    Particle.prototype.reset = function () {
      this.x = Math.random() * W; this.y = Math.random() * H;
      this.vx = (Math.random() - .5) * .3; this.vy = (Math.random() - .5) - .2;
      this.r = Math.random() * 2 + .5; this.life = Math.random() * 200 + 100; this.age = 0;
      this.color = Math.random() > .5 ? '16,185,129' : '251,191,36';
    };
    Particle.prototype.update = function () {
      this.x += this.vx; this.y += this.vy; this.age++;
      if (this.age > this.life || this.x < 0 || this.x > W || this.y < 0 || this.y > H) this.reset();
    };
    Particle.prototype.draw = function () {
      const a = 1 - this.age / this.life;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color},${a * .6})`; ctx.fill();
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color},${a * .1})`; ctx.fill();
    };
    for (let i = 0; i < 60; i++) particles.push(new Particle());
    function animate() {
      if (!document.querySelector('[data-slide="6"]').classList.contains('on')) { requestAnimationFrame(animate); return; }
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => { p.update(); p.draw(); });
      requestAnimationFrame(animate);
    }
    animate();
  })();
}
