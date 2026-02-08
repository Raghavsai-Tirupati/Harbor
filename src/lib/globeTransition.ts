/**
 * GlobeTransitionManager — v3 (starfield iris)
 *
 * Shared-element transition: Home globe → Disaster Map.
 *
 * Instead of a simple crossfade, the page switch is masked by an
 * animated starfield that iris-closes from the screen edges toward
 * the globe, hides the route change, then iris-opens outward on the
 * Map page to reveal the interactive map.
 *
 * The globe overlay (z-index 99999) floats ON TOP of the starfield
 * (z-index 99998) so it's always visible during the morph.
 *
 * Phases:
 *   1. Capture      — toDataURL on the Home globe canvas
 *   2. Overlay      — circular mask + starfield, start iris-close
 *   3. Navigate     — Home calls navigate('/map') ~350ms in
 *   4. Morph        — uniform-scale globe flies to map position (700ms)
 *   5. Iris-open    — starfield expands outward, globe + stars fade (500ms)
 *   6. Cleanup      — remove DOM, reset state
 *
 * Performance:
 *   • rAF-driven, CSS transforms for GPU compositing
 *   • Starfield is a single box-shadow (no per-frame star rendering)
 *   • Falls back to instant nav if canvas capture fails
 */

// ── Internal state ─────────────────────────────────────────────────

interface CapturedSource {
  rect: DOMRect;
  dataUrl: string;
}

let captured: CapturedSource | null = null;
let maskEl: HTMLDivElement | null = null;    // circular globe snapshot
let spaceEl: HTMLDivElement | null = null;   // full-screen starfield
let _active = false;

// ── Easing: approximation of cubic-bezier(0.22, 1, 0.36, 1) ──────

function ease(t: number): number {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
}

// ── Starfield helpers ──────────────────────────────────────────────

/** Generate a box-shadow string of sparse, dim stars. */
function generateStars(count: number): string {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const shadows: string[] = [];

  for (let i = 0; i < count; i++) {
    const x = Math.floor(Math.random() * vw);
    const y = Math.floor(Math.random() * vh);
    const r = +(Math.random() * 1.2 + 0.3).toFixed(1);   // 0.3–1.5 px
    const a = +(Math.random() * 0.45 + 0.08).toFixed(2);  // 0.08–0.53
    const color =
      Math.random() > 0.75
        ? `rgba(150,180,255,${a})`   // soft blue
        : `rgba(255,255,255,${a})`;  // white
    shadows.push(`${x}px ${y}px 0 ${r}px ${color}`);
  }

  return shadows.join(',');
}

/** Build the full-screen starfield overlay (initially invisible). */
function createSpaceOverlay(): HTMLDivElement {
  const el = document.createElement('div');
  Object.assign(el.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '99998',
    pointerEvents: 'none',
    opacity: '0',
    background:
      'radial-gradient(ellipse at center, rgba(8,8,20,0.93) 0%, rgba(0,0,0,0.99) 100%)',
    willChange: 'opacity',
    // Start with stars only at far edges (large transparent center)
    maskImage:
      'radial-gradient(circle at center, transparent 55%, black 75%)',
    WebkitMaskImage:
      'radial-gradient(circle at center, transparent 55%, black 75%)',
  });

  // Star dots — a single 1×1 element whose box-shadow paints 180 stars
  const starsEl = document.createElement('div');
  Object.assign(starsEl.style, {
    position: 'absolute',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    borderRadius: '50%',
    background: 'transparent',
    boxShadow: generateStars(180),
  });

  // Inject a slow-drift keyframe (only once in the document)
  if (!document.getElementById('_star-drift-kf')) {
    const style = document.createElement('style');
    style.id = '_star-drift-kf';
    style.textContent = `@keyframes _starDrift{0%{transform:translate(0,0)}100%{transform:translate(-12px,-6px)}}`;
    document.head.appendChild(style);
  }
  starsEl.style.animation = '_starDrift 40s linear infinite';

  el.appendChild(starsEl);
  return el;
}

// ── Iris-close animation ───────────────────────────────────────────

/** Stars fade in + iris closes inward (900 ms). */
function beginIrisClose() {
  if (!spaceEl) return;

  const CLOSE_MS = 900;
  const t0 = performance.now();

  // Mask stop interpolation ranges (percentage of gradient radius)
  const innerFrom = 55;
  const innerTo = 3;
  const outerFrom = 75;
  const outerTo = 12;

  function frame(now: number) {
    if (!spaceEl) return;

    const raw = Math.min((now - t0) / CLOSE_MS, 1);
    const t = ease(raw);

    // Opacity ramps to 1 in the first half
    spaceEl.style.opacity = String(Math.min(t * 2.2, 1));

    // Shrink the transparent center → stars cover more of the screen
    const inner = innerFrom + (innerTo - innerFrom) * t;
    const outer = outerFrom + (outerTo - outerFrom) * t;
    const grad = `radial-gradient(circle at center, transparent ${inner}%, black ${outer}%)`;
    spaceEl.style.maskImage = grad;
    (spaceEl.style as any).WebkitMaskImage = grad;

    if (raw < 1) requestAnimationFrame(frame);
    // When finished the starfield covers nearly the entire screen.
  }

  requestAnimationFrame(frame);
}

// ── Iris-open animation ────────────────────────────────────────────

/**
 * Stars expand outward + fade out, globe overlay fades out,
 * real map page fades in underneath.
 */
function beginIrisOpen(
  onRevealMap: () => void,
  onComplete: () => void,
) {
  // Tell the Map page to start fading in
  onRevealMap();

  const OPEN_MS = 800;
  const t0 = performance.now();

  const innerFrom = 3;
  const innerTo = 65;
  const outerFrom = 12;
  const outerTo = 85;

  function frame(now: number) {
    const raw = Math.min((now - t0) / OPEN_MS, 1);
    const t = ease(raw);

    // Expand starfield mask outward (reveal center)
    if (spaceEl) {
      const inner = innerFrom + (innerTo - innerFrom) * t;
      const outer = outerFrom + (outerTo - outerFrom) * t;
      const grad = `radial-gradient(circle at center, transparent ${inner}%, black ${outer}%)`;
      spaceEl.style.maskImage = grad;
      (spaceEl.style as any).WebkitMaskImage = grad;

      // Fade out starfield in the last 40 %
      if (t > 0.6) {
        spaceEl.style.opacity = String(1 - (t - 0.6) / 0.4);
      }
    }

    // Fade out globe snapshot overlay
    if (maskEl) {
      maskEl.style.opacity = String(1 - t);
    }

    if (raw < 1) {
      requestAnimationFrame(frame);
    } else {
      cleanup();
      onComplete();
    }
  }

  requestAnimationFrame(frame);
}

// ── Public API ─────────────────────────────────────────────────────

/** Is a globe transition currently in progress? */
export function isActive(): boolean {
  return _active;
}

/**
 * Phase 1 + 2: Capture canvas, build overlays, begin iris-close.
 *
 * Call in the Home globe's click handler **before** navigating.
 * The caller should wait ~350 ms before calling navigate('/map') so the
 * iris has mostly closed by the time the route switches.
 *
 * @param globeContainer — outermost wrapper of the Home globe
 * @returns `true` if capture succeeded; `false` → fall back to normal nav
 */
export function captureGlobe(globeContainer: HTMLElement): boolean {
  try {
    const canvas = globeContainer.querySelector(
      'canvas',
    ) as HTMLCanvasElement | null;
    if (!canvas) return false;

    const rect = globeContainer.getBoundingClientRect();
    const dataUrl = canvas.toDataURL('image/png');
    if (!dataUrl || dataUrl.length < 1000) return false;

    captured = { rect, dataUrl };
    const size = rect.width; // Home globe is a square

    // ── Globe circular mask (z-index 99999 — on top of starfield) ──
    const mask = document.createElement('div');
    Object.assign(mask.style, {
      position: 'fixed',
      top: `${rect.top}px`,
      left: `${rect.left}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      overflow: 'hidden',
      zIndex: '99999',
      pointerEvents: 'none',
      willChange: 'transform, opacity',
      transformOrigin: 'center center',
      boxShadow: '0 0 30px 8px rgba(59,130,246,0.10)', // subtle glow
    });

    const img = document.createElement('img');
    img.src = dataUrl;
    Object.assign(img.style, {
      display: 'block',
      width: '100%',
      height: '100%',
      objectFit: 'cover',
    });

    mask.appendChild(img);
    document.body.appendChild(mask);
    maskEl = mask;

    // ── Starfield overlay (z-index 99998 — behind globe) ───────────
    spaceEl = createSpaceOverlay();
    document.body.appendChild(spaceEl);

    _active = true;
    (window as any).__globeTransition = true;

    // Kick off the iris-close immediately
    beginIrisClose();

    return true;
  } catch (err) {
    console.warn('[GlobeTransition] capture failed, falling back:', err);
    cleanup();
    return false;
  }
}

/**
 * Phase 4 + 5: Globe morph (700 ms), then iris-open (500 ms).
 *
 * Called by the Map page once its layout is measured.
 */
export function morphToTarget(
  targetRect: DOMRect,
  onRevealMap: () => void,
  onComplete: () => void,
): void {
  if (!maskEl || !captured || !_active) {
    onRevealMap();
    onComplete();
    return;
  }

  const src = captured.rect;
  const startDiameter = Math.min(src.width, src.height);
  const targetDiameter = Math.min(targetRect.width, targetRect.height);

  // Center-to-center translation
  const srcCX = src.left + src.width / 2;
  const srcCY = src.top + src.height / 2;
  const tgtCX = targetRect.left + targetRect.width / 2;
  const tgtCY = targetRect.top + targetRect.height / 2;

  const fullDX = tgtCX - srcCX;
  const fullDY = tgtCY - srcCY;

  // Uniform scale — targetRect should already be the measured globe circle,
  // so no correction factor is needed.
  const fullScale = targetDiameter / startDiameter;

  // ── Phase 4: Morph (700 ms) ─────────────────────────────────────

  const MORPH_MS = 700;
  const morphT0 = performance.now();

  function morphFrame(now: number) {
    if (!maskEl) return;

    const raw = Math.min((now - morphT0) / MORPH_MS, 1);
    const t = ease(raw);

    const dx = fullDX * t;
    const dy = fullDY * t;
    const s = 1 + (fullScale - 1) * t;

    maskEl.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;

    if (raw < 1) {
      requestAnimationFrame(morphFrame);
    } else {
      // Globe has landed — open the iris to reveal the real map
      beginIrisOpen(onRevealMap, onComplete);
    }
  }

  requestAnimationFrame(morphFrame);
}

// ── Phase 6: Cleanup ───────────────────────────────────────────────

/** Remove all transition DOM elements and reset internal state. */
export function cleanup(): void {
  if (maskEl) {
    maskEl.remove();
    maskEl = null;
  }
  if (spaceEl) {
    spaceEl.remove();
    spaceEl = null;
  }
  captured = null;
  _active = false;
  delete (window as any).__globeTransition;
}
