import { useRef, useCallback } from 'react';

/**
 * Tilt3D — wraps children in a perspective container that reacts to mouse
 * movement with a 3D tilt + glare + shadow effect.
 *
 * Props:
 *  tiltMax      – max rotation in degrees (default 15)
 *  glare        – show glare overlay (default true)
 *  scale        – hover scale (default 1.04)
 *  perspective  – CSS perspective px (default 600)
 *  className    – extra class on wrapper
 */
export default function Tilt3D({
  children,
  tiltMax = 15,
  glare = true,
  scale = 1.04,
  perspective = 600,
  className = '',
  ...rest
}) {
  const ref = useRef(null);

  const handleMove = useCallback((e) => {
    const el = ref.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -tiltMax;
    const rotateY = ((x - centerX) / centerX) * tiltMax;

    el.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale},${scale},${scale}) translateZ(10px)`;
    el.style.boxShadow = `${-rotateY * 0.5}px ${rotateX * 0.5}px 40px rgba(0,0,0,0.3), 0 20px 60px rgba(129,140,248,0.08)`;

    if (glare) {
      const glareEl = el.querySelector('.tilt-3d-glare');
      if (glareEl) {
        const pctX = (x / rect.width) * 100;
        const pctY = (y / rect.height) * 100;
        glareEl.style.background = `radial-gradient(circle at ${pctX}% ${pctY}%, rgba(255,255,255,0.25) 0%, rgba(129,140,248,0.06) 30%, transparent 60%)`;
        glareEl.style.opacity = '1';
      }
    }
  }, [tiltMax, perspective, scale, glare]);

  const handleLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = `perspective(${perspective}px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1) translateZ(0px)`;
    el.style.boxShadow = '';
    const glareEl = el.querySelector('.tilt-3d-glare');
    if (glareEl) glareEl.style.opacity = '0';
  }, [perspective]);

  return (
    <div
      ref={ref}
      className={`tilt-3d ${className}`}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      {...rest}
    >
      {children}
      {glare && <div className="tilt-3d-glare" />}
    </div>
  );
}
