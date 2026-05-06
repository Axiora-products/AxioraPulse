import { useEffect } from 'react';

/**
 * CustomCursor
 * ─────────────────────────────────────────────────────────────
 * Singleton guard at module level ensures the RAF loop and all
 * event listeners are attached exactly once, even under React
 * StrictMode (which double-fires effects in development).
 */
let _attached = false;

export default function CustomCursor() {
  useEffect(() => {
    // Already running — bail immediately (StrictMode double-invoke guard)
    if (_attached) return;
    _attached = true;

    const dot  = document.getElementById('np-cur-dot');
    const ring = document.getElementById('np-cur-ring');
    if (!dot || !ring) { _attached = false; return; }

    let mx = 0, my = 0, rx = 0, ry = 0;
    let raf;

    const onMove = e => {
      mx = e.clientX;
      my = e.clientY;
      dot.style.left = mx + 'px';
      dot.style.top  = my + 'px';
    };

    const loopRing = () => {
      rx += (mx - rx) * 0.07;
      ry += (my - ry) * 0.07;
      ring.style.left = rx + 'px';
      ring.style.top  = ry + 'px';
      raf = requestAnimationFrame(loopRing);
    };

    const onEnter = () => document.documentElement.classList.add('np-hovering');
    const onLeave = () => document.documentElement.classList.remove('np-hovering');
    const onDown  = () => document.documentElement.classList.add('np-clicking');
    const onUp    = () => document.documentElement.classList.remove('np-clicking');
    const onOut   = () => { dot.style.opacity = '0'; ring.style.opacity = '0'; };
    const onIn    = () => { dot.style.opacity = '1'; ring.style.opacity = ''; };

    function bindHovers() {
      document.querySelectorAll('a, button, [role="button"], input, textarea, select, label, [tabindex]')
        .forEach(el => {
          if (el._npHover) return;
          el._npHover = true;
          el.addEventListener('mouseenter', onEnter);
          el.addEventListener('mouseleave', onLeave);
        });
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('mouseup',   onUp);
    document.addEventListener('mouseleave', onOut);
    document.addEventListener('mouseenter', onIn);
    loopRing();
    bindHovers();

    const obs = new MutationObserver(bindHovers);
    obs.observe(document.body, { childList: true, subtree: true });

    return () => {
      _attached = false;
      cancelAnimationFrame(raf);
      obs.disconnect();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('mouseup',   onUp);
      document.removeEventListener('mouseleave', onOut);
      document.removeEventListener('mouseenter', onIn);
    };
  }, []);

  return null;
}
