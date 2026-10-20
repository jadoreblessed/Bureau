// Inertial smooth scrolling (Lenis-style) for mouse wheels and trackpads.
// Touch devices keep native scrolling. Also drives the home hero parallax by
// writing transform/opacity on .hero-grid directly: a CSS variable would
// restyle every element under it (the split headline included) each frame.

let target = 0;
let current = 0;
let running = false;
let raf = 0;
let last = 0;

const root = document.documentElement;
const maxY = () => Math.max(0, root.scrollHeight - window.innerHeight);
let hero: HTMLElement | null = null;
let published = -1;
const publish = (y: number) => {
  if (y > 1200 && published > 1200) return; // parallax has fully faded out
  if (!hero?.isConnected) hero = document.querySelector<HTMLElement>(".hero .hero-grid");
  if (!hero) return;
  hero.style.transform = `translate3d(0, ${(y * 0.28).toFixed(1)}px, 0)`;
  hero.style.opacity = String(Math.max(0, 1 - y / 900));
  published = y;
};

function canScrollInside(el: Element | null, dy: number): boolean {
  while (el && el !== document.body && el !== root) {
    const st = getComputedStyle(el);
    if (/(auto|scroll)/.test(st.overflowY) && el.scrollHeight > el.clientHeight + 1) {
      if (dy > 0 && el.scrollTop + el.clientHeight < el.scrollHeight - 1) return true;
      if (dy < 0 && el.scrollTop > 0) return true;
    }
    el = el.parentElement;
  }
  return false;
}

function frame(t: number) {
  const dt = Math.min(64, t - (last || t));
  last = t;
  const k = 1 - Math.pow(1 - 0.085, dt / (1000 / 60)); // frame-rate independent lerp
  current += (target - current) * k;
  if (Math.abs(target - current) < 0.4) {
    current = target;
    running = false;
  }
  window.scrollTo(0, current);
  publish(current);
  if (running) raf = requestAnimationFrame(frame);
}

function start() {
  if (running) return;
  running = true;
  last = 0;
  raf = requestAnimationFrame(frame);
}

export function stopSmooth() {
  running = false;
  cancelAnimationFrame(raf);
  target = current = window.scrollY;
}

export function initSmoothScroll() {
  target = current = window.scrollY;
  publish(current);
  window.addEventListener("scroll", () => {
    if (!running) { target = current = window.scrollY; publish(current); }
  }, { passive: true });
  window.addEventListener("hashchange", stopSmooth);
  window.addEventListener("resize", () => { target = Math.min(target, maxY()); });

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  if (reduce || coarse) return;

  window.addEventListener("wheel", (e: WheelEvent) => {
    if (e.ctrlKey || e.defaultPrevented) return;
    if (document.body.style.overflow === "hidden") return;
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    if (canScrollInside(e.target as Element, e.deltaY)) return;
    e.preventDefault();
    let d = e.deltaY;
    if (e.deltaMode === 1) d *= 36;
    else if (e.deltaMode === 2) d *= window.innerHeight;
    if (!running) target = current = window.scrollY;
    target = Math.max(0, Math.min(maxY(), target + d));
    start();
  }, { passive: false });
}
