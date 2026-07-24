import React, { useEffect, useRef, useState } from 'react';
import './LandingPage.css';
import LegalModal from './LegalModal';
import SupportWidget from './SupportWidget';
import Jd2JobLogo from './Jd2JobLogo';

const LandingPage = ({ onStart, isAuthenticated, onShowAuth, isAuthLoading, onShowPricing }) => {
  const rootRef = useRef(null);
  const [legalPage, setLegalPage] = useState(null); // 'privacy' | 'terms' | 'about'

  const handleStart = (e) => {
    if (e) e.preventDefault();
    if (isAuthenticated) {
      onStart();
    } else {
      onShowAuth();
    }
  };

  const handlePricing = (e) => {
    if (e) e.preventDefault();
    if (isAuthenticated) {
      if (onShowPricing) onShowPricing();
      else onStart();
    } else {
      onShowAuth();
    }
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const touch = matchMedia('(hover: none)').matches;
    const $ = (s, r = root) => r.querySelector(s);
    const $$ = (s, r = root) => [...r.querySelectorAll(s)];
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    let disposed = false;
    const listeners = [];
    const on = (t, ev, fn, opts) => { t.addEventListener(ev, fn, opts); listeners.push(() => t.removeEventListener(ev, fn, opts)); };
    const intervals = [];
    const timeouts = [];
    const loops = [];
    const startLoop = (fn) => {
      const st = { id: 0, stopped: false };
      const tick = (t) => { if (st.stopped || disposed) return; fn(t); st.id = requestAnimationFrame(tick); };
      st.id = requestAnimationFrame(tick);
      loops.push(st);
      return st;
    };

    /* ---------- WebGL aurora shader ---------- */
    (function () {
      const canvas = $('.lp-gl'), hero = $('.hero');
      if (!canvas || !hero) return;
      const gl = canvas.getContext('webgl', { alpha: true, antialias: false, premultipliedAlpha: false });
      if (!gl) return; // CSS fallback stays visible
      hero.classList.add('gl-ok');
      const vs = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;
      const fs = `precision mediump float;
      uniform vec2 u_res;uniform float u_t;uniform vec2 u_m;
      float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}
      float fb(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p*=2.02;a*=.5;}return v;}
      void main(){
        vec2 uv=gl_FragCoord.xy/u_res.xy;
        vec2 p=uv; p.x*=u_res.x/u_res.y;
        float t=u_t*0.06;
        vec2 q=vec2(fb(p*1.4+vec2(0.,t)),fb(p*1.4+vec2(5.2,1.3)-t));
        float f=fb(p*1.8+q*2.2+t+u_m*0.6);
        float f2=fb(p*3.0-q*1.6-t*1.3);
        vec3 twilight=vec3(0.918,0.949,0.937);
        vec3 mint=vec3(0.624,0.780,0.722);
        vec3 berry=vec3(0.569,0.184,0.337);
        vec3 ink=vec3(0.063,0.047,0.086);
        vec3 col=mix(twilight,mint,smoothstep(0.35,0.75,f));
        float ribbon=smoothstep(0.52,0.82,f2)*smoothstep(0.30,0.62,f);
        col=mix(col,berry,ribbon*0.85);
        col=mix(col,berry*0.7,smoothstep(0.62,0.95,f2)*0.4);
        float vig=smoothstep(1.25,0.25,length(uv-0.5));
        col=mix(col,ink,(1.0-vig)*0.22);
        col+=0.02*(h(gl_FragCoord.xy+u_t)-0.5);
        gl_FragColor=vec4(col,1.0);
      }`;
      const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); return o; };
      const prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const a = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(a);
      gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      const u_res = gl.getUniformLocation(prog, 'u_res'), u_t = gl.getUniformLocation(prog, 'u_t'), u_m = gl.getUniformLocation(prog, 'u_m');
      let mx = 0, my = 0, tmx = 0, tmy = 0;
      const dpr = Math.min(devicePixelRatio || 1, 1.5);
      const size = () => { const r = canvas.getBoundingClientRect(); canvas.width = Math.max(1, r.width * dpr); canvas.height = Math.max(1, r.height * dpr); gl.viewport(0, 0, canvas.width, canvas.height); };
      size();
      on(window, 'resize', size);
      on(window, 'mousemove', (e) => { const r = hero.getBoundingClientRect(); tmx = (e.clientX - r.left) / r.width - 0.5; tmy = ((e.clientY - r.top) / r.height - 0.5) * -1; }, { passive: true });
      const t0 = performance.now();
      const draw = (now) => {
        mx += (tmx - mx) * 0.05; my += (tmy - my) * 0.05;
        gl.uniform2f(u_res, canvas.width, canvas.height);
        gl.uniform1f(u_t, (now - t0) / 1000);
        gl.uniform2f(u_m, mx, my);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      };
      let glLoop = null;
      if (reduce) { draw(t0 + 8000); }
      else { glLoop = startLoop(draw); }
      on(document, 'visibilitychange', () => {
        if (!glLoop) return;
        if (document.hidden) { glLoop.stopped = true; cancelAnimationFrame(glLoop.id); }
        else if (!disposed) { glLoop.stopped = false; glLoop.id = requestAnimationFrame(function tick(t) { if (glLoop.stopped || disposed) return; draw(t); glLoop.id = requestAnimationFrame(tick); }); }
      });
    })();

    /* nav + progress */
    const nav = $('.nav'), bar = $('.progress');
    const onScrollGlobal = () => {
      if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
      if (bar) { const h = document.documentElement.scrollHeight - innerHeight; bar.style.width = (h > 0 ? (window.scrollY / h) * 100 : 0) + '%'; }
    };
    on(window, 'scroll', onScrollGlobal, { passive: true });
    onScrollGlobal();

    /* mobile menu */
    const burger = $('.burger'), links = $('.nav-links');
    if (burger && links) {
      on(burger, 'click', () => {
        const o = links.classList.toggle('open');
        burger.setAttribute('aria-expanded', o);
        const use = burger.querySelector('use');
        if (use) use.setAttribute('href', o ? '#i-x' : '#i-menu');
      });
      $$('.nav-links a').forEach((a) => on(a, 'click', () => {
        links.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
        const use = burger.querySelector('use');
        if (use) use.setAttribute('href', '#i-menu');
      }));
    }

    /* cursor */
    if (!touch && !reduce) {
      root.classList.remove('no-cur');
      const dot = $('.cur-dot'), ring = $('.cur-ring');
      if (dot && ring) {
        const lbl = ring.querySelector('.lbl');
        let mx = innerWidth / 2, my = innerHeight / 2, rx = mx, ry = my;
        on(window, 'mousemove', (e) => { mx = e.clientX; my = e.clientY; dot.style.transform = `translate(${mx}px,${my}px)`; }, { passive: true });
        on(document, 'mouseover', (e) => {
          const t = e.target.closest('[data-cursor],a,button,summary,.tile,.tcard,.plan');
          if (t && root.contains(t)) { ring.classList.add('has-lbl'); lbl.textContent = t.getAttribute('data-cursor') || ''; }
          else ring.classList.remove('has-lbl');
        });
        startLoop(() => { rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18; ring.style.transform = `translate(${rx}px,${ry}px)`; });
      }
    }

    /* word split */
    const splitEl = (el) => {
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      const nodes = [];
      let n;
      while ((n = walker.nextNode())) nodes.push(n);
      const wins = [];
      nodes.forEach((node) => {
        const parts = node.nodeValue.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        parts.forEach((part) => {
          if (/^\s+$/.test(part) || part === '') { frag.appendChild(document.createTextNode(part)); return; }
          const w = document.createElement('span');
          w.className = 'w';
          const win = document.createElement('span');
          win.className = 'w-in';
          win.textContent = part;
          w.appendChild(win);
          frag.appendChild(w);
          wins.push(win);
        });
        node.parentNode.replaceChild(frag, node);
      });
      wins.forEach((win, i) => { win.style.transitionDelay = Math.min(i * 32, 460) + 'ms'; });
    };
    $$('.split').forEach(splitEl);

    /* reveal */
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }), { threshold: 0.15, rootMargin: '0px 0px -7% 0px' });
    $$('.reveal,.split').forEach((el, i) => {
      if (el.classList.contains('reveal')) el.style.transitionDelay = ((i % 3) * 70) + 'ms';
      io.observe(el);
    });

    /* count up */
    const fmt = (n) => (n >= 1000 ? (Math.round(n / 100) / 10) + 'k' : Math.round(n));
    // Initialize with final values so stats never show 0
    $$('[data-count]').forEach(el => {
      const t = +el.dataset.count;
      el.textContent = t >= 1000 ? fmt(t) : t;
    });
    const cio = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const el = e.target, t = +el.dataset.count;
      if (reduce) { el.textContent = t >= 1000 ? fmt(t) : t; cio.unobserve(el); return; }
      let st = null;
      const step = (ts) => {
        if (disposed) return;
        st = st ?? ts;
        const p = Math.min((ts - st) / 1600, 1), v = t * (1 - Math.pow(1 - p, 3));
        el.textContent = t >= 1000 ? fmt(v) : Math.round(v);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      cio.unobserve(el);
    }), { threshold: 0.6 });
    $$('[data-count]').forEach((el) => cio.observe(el));

    /* waves + pace */
    const buildWave = (el, n) => {
      if (!el) return;
      for (let i = 0; i < n; i++) {
        const b = document.createElement('i');
        if (!reduce) {
          b.style.animationDelay = (Math.random() * -1.1) + 's';
          b.style.animationDuration = (0.8 + Math.random() * 0.8) + 's';
        } else {
          b.style.height = (25 + Math.random() * 60) + '%';
          b.style.animation = 'none';
        }
        el.appendChild(b);
      }
    };
    buildWave($('.wave-hero'), 40);
    buildWave($('.wave-bento'), 40);
    $$('.swave').forEach((w) => buildWave(w, 26));
    const pace = $('.pace');
    if (pace) {
      [30, 46, 38, 62, 52, 78, 66, 90, 72, 84, 60, 48].forEach((h, i) => {
        const b = document.createElement('i');
        b.style.height = h + '%';
        if (i >= 7 && i <= 10) b.classList.add('hi');
        pace.appendChild(b);
      });
    }

    /* typing */
    const typing = $('.typing');
    if (typing && !reduce) {
      const lines = ['Submitting application…', 'Résumé tailored — ATS 96.', 'Screening answers drafted.'];
      let li = 0, ci = 0, del = false;
      const tick = () => {
        if (disposed) return;
        const f = lines[li];
        if (!del) {
          ci++;
          typing.innerHTML = f.slice(0, ci) + '<span class="cursor"></span>';
          if (ci >= f.length) { del = true; timeouts.push(setTimeout(tick, 1700)); return; }
        } else {
          ci--;
          typing.innerHTML = f.slice(0, ci) + '<span class="cursor"></span>';
          if (ci <= 0) { del = false; li = (li + 1) % lines.length; }
        }
        timeouts.push(setTimeout(tick, del ? 24 : 42));
      };
      tick();
    }

    /* timer + live count */
    const timer = $('.timer');
    if (timer && !reduce) {
      let s = 12 * 60 + 48;
      intervals.push(setInterval(() => {
        s++;
        timer.textContent = String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
      }, 1000));
    }
    const liveCount = $('.liveCount');
    if (liveCount && !reduce) {
      let v = 1204;
      intervals.push(setInterval(() => {
        v += Math.random() < 0.5 ? -1 : 1;
        v = clamp(v, 1180, 1240);
        liveCount.textContent = v.toLocaleString();
      }, 2600));
    }

    /* TRUE 3D hero: mouse parallax + scroll tumble */
    (function () {
      const group = $('.scene3d__group');
      if (!group || touch || reduce) return;
      let px = 0, py = 0, cpx = 0, cpy = 0;
      on(window, 'mousemove', (e) => { px = (e.clientX / innerWidth - 0.5) * 2; py = (e.clientY / innerHeight - 0.5) * 2; }, { passive: true });
      startLoop(() => {
        cpx += (px - cpx) * 0.07; cpy += (py - cpy) * 0.07;
        const t = clamp(window.scrollY / 600, 0, 1);
        const rx = 4 * (1 - t) + cpy * -4 - t * 16;
        const ry = -8 * (1 - t) + cpx * 7;
        group.style.setProperty('--rx', rx.toFixed(2) + 'deg');
        group.style.setProperty('--ry', ry.toFixed(2) + 'deg');
      });
    })();

    /* 3D spin sections: scroll-driven rotateY */
    $$('.spin-obj').forEach((obj) => {
      const sec = obj.closest('.spin');
      if (!sec || touch || reduce) return;
      const update = () => {
        const r = sec.getBoundingClientRect();
        const p = clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
        const ry = (p - 0.5) * 70;
        const rx = 8 - Math.sin(p * Math.PI) * 10;
        obj.style.setProperty('--sry', ry.toFixed(2) + 'deg');
        obj.style.setProperty('--srx', rx.toFixed(2) + 'deg');
      };
      on(window, 'scroll', update, { passive: true });
      on(window, 'resize', update);
      update();
    });

    /* bento 3d tilt + spotlight */
    $$('.tilt3d').forEach((c) => {
      const inner = c.querySelector('.inner');
      on(c, 'pointermove', (e) => {
        const r = c.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        c.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top) + 'px');
        if (!touch && !reduce && inner) inner.style.transform = `perspective(800px) rotateX(${(py - 0.5) * -8}deg) rotateY(${(px - 0.5) * 9}deg)`;
      });
      on(c, 'pointerleave', () => { if (inner) inner.style.transform = ''; });
    });
    const statsBand = $('.stats');
    if (statsBand && !touch) {
      on(statsBand, 'pointermove', (e) => {
        const r = statsBand.getBoundingClientRect();
        statsBand.style.setProperty('--mx', (e.clientX - r.left) + 'px');
        statsBand.style.setProperty('--my', (e.clientY - r.top) + 'px');
      });
    }

    /* magnetic */
    if (!touch && !reduce) {
      $$('[data-magnetic]').forEach((b) => {
        on(b, 'mousemove', (e) => {
          const r = b.getBoundingClientRect();
          b.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.16}px,${(e.clientY - r.top - r.height / 2) * 0.22}px)`;
        });
        on(b, 'mouseleave', () => { b.style.transform = ''; });
      });
    }

    return () => {
      disposed = true;
      listeners.forEach((f) => f());
      intervals.forEach(clearInterval);
      timeouts.forEach(clearTimeout);
      loops.forEach((l) => { l.stopped = true; cancelAnimationFrame(l.id); });
      io.disconnect();
      cio.disconnect();
    };
  }, []);

  const marqueeWords = ['Auto Apply', 'AI-tailored résumés', 'Voice mock interviews', '1s replies', 'ATS match score', 'Screening answers', 'Private by design', 'LinkedIn Easy Apply'];

  return (
    <div className="lp no-cur" ref={rootRef}>
      <a className="skip" href="#main">Skip to content</a>
      <div className="progress" aria-hidden="true"></div>
      <div className="grain" aria-hidden="true"></div>
      <div className="cur-ring" aria-hidden="true"><span className="lbl"></span></div>
      <div className="cur-dot" aria-hidden="true"></div>

      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true" focusable="false">
        <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 3l1.9 4.6L18.5 9.5 13.9 11.4 12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" /></symbol>
        <symbol id="i-mic" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></symbol>
        <symbol id="i-upload" viewBox="0 0 24 24"><path d="M12 16V4m0 0l-4 4m4-4l4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" /></symbol>
        <symbol id="i-bolt" viewBox="0 0 24 24"><path d="M13 2L4 14h7l-1 8 9-12h-7z" /></symbol>
        <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /></symbol>
        <symbol id="i-doc" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h6" /></symbol>
        <symbol id="i-eye" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></symbol>
        <symbol id="i-wave" viewBox="0 0 24 24"><path d="M3 12h2l2-6 4 14 3-9 2 4h5" /></symbol>
        <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></symbol>
        <symbol id="i-check" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5" /></symbol>
        <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14m-6-6l6 6-6 6" /></symbol>
        <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></symbol>
        <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" /></symbol>
        <symbol id="i-x" viewBox="0 0 24 24"><path d="M5 5l14 14M19 5L5 19" /></symbol>
        <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M9 12l2 2 4-4" /></symbol>
        <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></symbol>
        <symbol id="i-clock" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></symbol>
        <symbol id="i-video" viewBox="0 0 24 24"><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></symbol>
        <symbol id="i-star" viewBox="0 0 24 24"><path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6L12 16.9 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" /></symbol>
        <symbol id="i-play" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></symbol>
        <symbol id="i-mail" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></symbol>
        <symbol id="i-cube" viewBox="0 0 24 24"><path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M3 7l9 5 9-5M12 12v10" /></symbol>
        <symbol id="i-linkedin" viewBox="0 0 24 24"><path d="M4.98 3.5A2.5 2.5 0 1 1 0 3.5a2.5 2.5 0 0 1 4.98 0zM.5 8h4V24h-4zM8 8h3.8v2.2h.05c.53-1 1.83-2.2 3.77-2.2 4 0 4.8 2.6 4.8 6V24h-4v-7c0-1.7 0-3.8-2.3-3.8s-2.7 1.8-2.7 3.7V24H8z" /></symbol>
        <symbol id="i-github" viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.1-1.47-1.1-1.47-.9-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.5 9.5 0 0 1 5 0c1.9-1.29 2.74-1.02 2.74-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.69-4.57 4.94.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2z" /></symbol>
        <symbol id="i-twitter" viewBox="0 0 24 24"><path d="M18.9 2H22l-7.3 8.3L23 22h-6.6l-5.2-6.8L5.3 22H2.2l7.8-8.9L1.5 2h6.8l4.7 6.2zm-1.2 18h1.8L7.4 3.9H5.5z" /></symbol>
      </svg>

      <div className="status">
        <div className="wrap">
          <span className="live"><span className="d"></span> <span className="liveCount">1,204</span> sessions live now</span>
          <span className="sep">·</span>
          <span className="mut">Auto Apply for LinkedIn is live</span>
        </div>
      </div>

      <div className="navwrap">
        <header className="nav">
          <a className="brand" href="#top" aria-label="Jd2Job home"><span className="mark"><Jd2JobLogo width={24} height={24} /></span> Jd2Job</a>
          <nav className="nav-links" aria-label="Primary">
            <a href="#auto-apply">Auto Apply</a>
            <a href="#mock">Mock Interview</a>
            <a href="#how">How it works</a>
            <a href="#pricing">Pricing</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="nav-right">
            <a className="signin" href="#" data-cursor="Sign in" onClick={(e) => { e.preventDefault(); onShowAuth(); }}>Sign in</a>
            <a className="btn btn-primary" href="#" data-magnetic data-cursor="Start" onClick={handleStart}>Start free <svg className="icon arrow"><use href="#i-arrow" /></svg></a>
            <button className="burger" aria-label="Open menu" aria-expanded="false" aria-controls="navLinks"><svg className="icon"><use href="#i-menu" /></svg></button>
          </div>
        </header>
      </div>

      <main id="main"><span id="top"></span>

        {/* HERO */}
        <section className="hero" id="hero">
          <canvas className="lp-gl" aria-hidden="true"></canvas>
          <div className="aurora-fb" aria-hidden="true"></div>
          <div className="vrail" aria-hidden="true">Auto Apply · AI Résumés · Voice Mocks</div>
          <div className="wrap hero-grid">
            <div className="reveal">
              <span className="kicker"><span className="idx">(01)</span> The job-search copilot</span>
              <h1 className="split">Apply on autopilot.<br /><span className="serif">Interview like a natural.</span></h1>
              <p className="lead">Jd2Job applies to LinkedIn jobs for you — with a résumé rewritten by AI for every single job description — then gets you ready with voice mock interviews that reply like a human, in about a second.</p>
              <div className="hero-cta">
                <a className="btn btn-primary" href="#" data-magnetic data-cursor="Start" onClick={handleStart}>Start free <svg className="icon arrow"><use href="#i-arrow" /></svg></a>
                <a className="btn btn-ghost" href="#" data-cursor="Download" onClick={(e) => { e.preventDefault(); window.open('https://api.jd2job.com/api/download', '_blank'); }}><svg className="icon"><use href="#i-cube" /></svg> Download Desktop App</a>
              </div>
              <p className="reassure">No card needed · 2-minute setup · cancel anytime · works on Mac & Windows</p>
              <div className="hero-proof">
                <div className="avatars" aria-hidden="true"><span>SC</span><span>AR</span><span>ER</span><span>+9</span></div>
                <div className="meta"><span className="stars" aria-hidden="true">★★★★★</span> <b>4.9 / 5</b> from 2,400+ job seekers</div>
              </div>
            </div>

            <div className="scene3d reveal" id="scene3d" aria-hidden="true">
              <div className="scene3d__group">
                <div className="plane z0">
                  <div className="device">
                    <div className="win-bar"><span className="tl"><i></i><i></i><i></i></span><span className="win-url"><svg className="icon"><use href="#i-lock" /></svg> app.jd2job.com/auto-apply</span></div>
                    <div className="win-body">
                      <div className="rail"><span className="ri on"><svg className="icon"><use href="#i-bolt" /></svg></span><span className="ri"><svg className="icon"><use href="#i-doc" /></svg></span><span className="ri"><svg className="icon"><use href="#i-mic" /></svg></span><span className="sp"></span><span className="ri"><svg className="icon"><use href="#i-shield" /></svg></span></div>
                      <div className="app">
                        <div className="app-top"><span className="t">Auto Apply · LinkedIn</span><span className="rec"><span className="d"></span> RUNNING</span><span className="timer">12:48</span></div>
                        <div className="qb"><div className="who">Job · Easy Apply</div><p>Senior Frontend Engineer — FinTech Co · Bengaluru · ₹28–36 LPA</p></div>
                        <div className="wave wave-hero"></div>
                        <div className="coach"><div className="coach-h"><svg className="icon"><use href="#i-spark" /></svg> AI tailoring · ATS</div>
                          <div className="sug"><span className="tag s">JD parsed</span><p>14 requirements mapped to your résumé — React, TypeScript, design systems.</p></div>
                          <div className="sug"><span className="tag">Résumé</span><p>Rewritten for this JD — ATS match 96. Screening answers drafted.</p></div>
                          <div className="sug"><span className="tag r">Submit</span><p className="typing">Submitting application…</p></div>
                        </div>
                        <div className="app-foot"><span>Applied <b>38</b></span><span>Replies <b>6</b></span><span>ATS <b>96</b></span></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="hud"><div className="hh"><svg className="icon"><use href="#i-spark" /></svg> Live dashboard</div><div className="gs"><b>38 sent</b> today — 6 recruiter views.</div><div className="gs"><b>Next:</b> Frontend Lead @ Tech Unicorn — tailoring now.</div></div>
                <div className="chip c1"><span className="ring"><span>96</span></span><div>ATS match<small>to this JD</small></div></div>
                <div className="chip c2"><span className="ic m"><svg className="icon"><use href="#i-doc" /></svg></span><div>Screening Qs<small>auto-answered</small></div></div>
                <div className="chip c3"><span className="ic b"><svg className="icon"><use href="#i-check" /></svg></span><div>Interview · Acme<small>scheduled Tue</small></div></div>
              </div>
            </div>
          </div>
          <div className="scroll-cue" aria-hidden="true"><div className="mouse"></div>Scroll</div>
        </section>

        {/* MARQUEE */}
        <div className="marquee" aria-hidden="true">
          <div className="track">
            {[...marqueeWords, ...marqueeWords].map((w, i) => (
              <React.Fragment key={i}><span className="w">{w}</span><svg className="icon-f star"><use href="#i-star" /></svg></React.Fragment>
            ))}
          </div>
        </div>

        {/* AUTO APPLY */}
        <section className="spin" id="auto-apply">
          <div className="wrap spin-grid">
            <div className="reveal">
              <span className="kicker"><span className="idx">(02)</span> Auto Apply</span>
              <h2 className="split">It applies while you <span class="serif">live your life.</span></h2>
              <p className="lead">Point Jd2Job at LinkedIn. It reads each job description, rewrites your résumé to match, answers the screening questions, and submits — you watch it all from the dashboard.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
                <div style={{ display: 'flex', gap: '13px' }}><span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '11px', background: 'var(--berry-50)', color: 'var(--berry)', display: 'grid', placeItems: 'center' }}><svg className="icon"><use href="#i-doc" /></svg></span><div><h4 style={{ fontSize: '1.02rem', fontWeight: 700 }}>A résumé per job description</h4><p style={{ fontSize: '.93rem', color: 'var(--muted)' }}>AI rewrites your résumé for every role and scores the ATS match before submitting.</p></div></div>
                <div style={{ display: 'flex', gap: '13px' }}><span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '11px', background: 'var(--berry-50)', color: 'var(--berry)', display: 'grid', placeItems: 'center' }}><svg className="icon"><use href="#i-bolt" /></svg></span><div><h4 style={{ fontSize: '1.02rem', fontWeight: 700 }}>Screening questions, answered</h4><p style={{ fontSize: '.93rem', color: 'var(--muted)' }}>Experience, notice period, salary — answered from your profile, consistently, every time.</p></div></div>
              </div>
            </div>
            <div className="reveal">
              <div className="spin-stage"><div className="spin-obj">
                <div className="layer glow-l"></div>
                <div className="layer body-l"></div>
                <div className="layer screen-l">
                  <div className="sbar"><span className="d"></span> Auto Apply · running</div>
                  <div className="swave"></div>
                  <div className="sline"><span className="tag">Applied</span>Senior Frontend Engineer @ FinTech Co — résumé v38 tailored · ATS 96</div>
                </div>
                <div className="float-l"><span className="ic"><svg className="icon"><use href="#i-spark" /></svg></span><div>AI tailoring<small>résumé v38 · ATS 96</small></div></div>
                <div className="float-l b2"><span className="ic"><svg className="icon"><use href="#i-check" /></svg></span><div>Dashboard<small>38 sent · 6 replies</small></div></div>
              </div></div>
              <p className="spin-note">↕ scroll to rotate the object in 3D space</p>
            </div>
          </div>
        </section>

        {/* MOCK INTERVIEW */}
        <section className="spin spin-mint" id="mock">
          <div className="wrap spin-grid rev">
            <div className="reveal">
              <div className="spin-stage"><div className="spin-obj">
                <div className="layer glow-l"></div>
                <div className="layer body-l"></div>
                <div className="layer screen-l">
                  <div className="sbar"><span className="d"></span> Mock interview · live</div>
                  <div className="swave"></div>
                  <div className="sline"><span className="tag">AI</span>Good — now tell me about a time you disagreed with your manager.</div>
                </div>
                <div className="float-l"><span className="ic"><svg className="icon"><use href="#i-mic" /></svg></span><div>Listening…<small>your turn</small></div></div>
                <div className="float-l b2"><span className="ic"><svg className="icon"><use href="#i-wave" /></svg></span><div>Speaking coach<small>pace 128 wpm</small></div></div>
              </div></div>
              <p className="spin-note">↕ scroll to rotate the object in 3D space</p>
            </div>
            <div className="reveal">
              <span className="kicker"><span className="idx">(03)</span> Mock Interview</span>
              <h2 className="split">An AI interviewer that <span class="serif">answers like a human.</span></h2>
              <p className="lead">Full speech-to-speech mocks built from your résumé and the job description. It asks, listens, and replies in about a second — interrupt it, push back, and it keeps up, like a real interviewer across the table.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '24px' }}>
                <div style={{ display: 'flex', gap: '13px' }}><span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '11px', background: 'var(--berry-50)', color: 'var(--berry)', display: 'grid', placeItems: 'center' }}><svg className="icon"><use href="#i-bolt" /></svg></span><div><h4 style={{ fontSize: '1.02rem', fontWeight: 700 }}>Speaks in about a second</h4><p style={{ fontSize: '.93rem', color: 'var(--muted)' }}>No dead air, no awkward pauses — the conversation flows like a real call.</p></div></div>
                <div style={{ display: 'flex', gap: '13px' }}><span style={{ flex: 'none', width: '40px', height: '40px', borderRadius: '11px', background: 'var(--berry-50)', color: 'var(--berry)', display: 'grid', placeItems: 'center' }}><svg className="icon"><use href="#i-mic" /></svg></span><div><h4 style={{ fontSize: '1.02rem', fontWeight: 700 }}>Interrupt it anytime</h4><p style={{ fontSize: '.93rem', color: 'var(--muted)' }}>Barge in mid-sentence and it adapts instantly — just like a person would.</p></div></div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW */}
        <section className="how" id="how">
          <div className="wrap">
            <div className="head center reveal"><span className="kicker" style={{ justifyContent: 'center' }}><span className="idx">(04)</span> How it works</span><h2 className="split">From upload to offer in <span className="serif">three steps</span></h2><p className="lead">Configure once. Then let the machine do the grind while you do the talking.</p></div>
            <div className="steps">
              <div className="step reveal"><div className="num"><svg className="icon"><use href="#i-upload" /></svg></div><div className="k">Step 01</div><h3>Upload résumé &amp; pick targets</h3><p>Drop in your résumé, choose roles and locations. Jd2Job maps your profile to what those jobs actually ask for.</p></div>
              <div className="step reveal"><div className="num"><svg className="icon"><use href="#i-bolt" /></svg></div><div className="k">Step 02</div><h3>Turn on Auto Apply</h3><p>It applies on LinkedIn with a JD-tailored résumé and AI screening answers. You track every application live.</p></div>
              <div className="step reveal"><div className="num"><svg className="icon"><use href="#i-mic" /></svg></div><div className="k">Step 03</div><h3>Drill voice mocks</h3><p>When the interviews land, practice speech-to-speech until every answer sounds like second nature.</p></div>
            </div>
          </div>
        </section>

        {/* BENTO */}
        <section className="bento" id="features">
          <div className="wrap">
            <div className="head center reveal"><span className="kicker" style={{ justifyContent: 'center' }}><span className="idx">(05)</span> Everything it does</span><h2 className="split">One tool for the <span className="serif">whole loop.</span></h2><p className="lead">Hover a tile — the content lifts toward you in 3D.</p></div>
            <div className="bgrid">
              <div className="tile t1 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-target" /></svg></span><h3>Auto Apply engine</h3><p>Reads every job description, rewrites your résumé for it, fills the Easy Apply form and submits. You set the filters — it does the grind.</p></div></div>
              <div className="tile t2 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-wave" /></svg></span><h3>Speech-to-speech mocks</h3><p>A voice interviewer built from your résumé and the JD — it hears you, answers naturally, and lets you interrupt like a real conversation.</p></div><div className="wave wave-bento"></div><div className="lat">reply latency<br /><b>~1s</b></div></div>
              <div className="tile t3 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-doc" /></svg></span><h3>ATS match score</h3></div><div className="ring"><span><b>96</b><small>score</small></span></div></div>
              <div className="tile t4 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-bolt" /></svg></span><h3>Speaking coach</h3></div><div className="pace"></div><div className="pm"><span>slow</span><span><b>128 wpm</b> · on target</span><span>fast</span></div></div>
              <div className="tile t5 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-lock" /></svg></span><h3>Zero audio retention</h3><p>Your voice is processed in memory and discarded. Nothing is written to disk or used to train a model.</p></div></div>
              <div className="tile t6 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-globe" /></svg></span><h3>Works where you search</h3><p>Web dashboard, Chrome extension and desktop app — one account, everything in sync.</p></div><div className="plats"><span><svg className="icon"><use href="#i-linkedin" /></svg> LinkedIn</span><span><svg className="icon"><use href="#i-check" /></svg> Easy Apply</span><span><svg className="icon"><use href="#i-globe" /></svg> Chrome extension</span><span><svg className="icon"><use href="#i-cube" /></svg> Desktop app</span><span><svg className="icon"><use href="#i-video" /></svg> Web dashboard</span></div></div>
              <div className="tile t7 reveal tilt3d" data-cursor="View"><div className="spot"></div><div className="inner"><span className="ic"><svg className="icon"><use href="#i-clock" /></svg></span><h3>Long mock sessions</h3></div><div className="big">40<span style={{ fontSize: '1rem', color: 'var(--muted)' }}> min</span></div></div>
            </div>
          </div>
        </section>

        {/* STATS */}
        <section className="stats" id="statsBand">
          <div className="orb"></div>
          <div className="wrap"><div className="sgrid">
            <div className="stat reveal"><div className="n"><span data-count="12000">0</span><span className="u">+</span></div><div className="l">Applications sent and counting</div></div>
            <div className="stat reveal"><div className="n"><span data-count="94">0</span><span className="u">%</span></div><div className="l">Felt more confident in interviews</div></div>
            <div className="stat reveal"><div className="n"><span data-count="3">0</span><span className="u">×</span></div><div className="l">More interview calls landed</div></div>
            <div className="stat reveal"><div className="n"><span data-count="1">0</span><span className="u">s</span></div><div className="l">Median voice reply latency</div></div>
          </div></div>
        </section>

        {/* TESTIMONIALS */}
        <section className="testi">
          <div className="wrap">
            <div className="head center reveal"><span className="kicker" style={{ justifyContent: 'center' }}><span className="idx">(06)</span> In their words</span><h2 className="split">Real people. <span className="serif">Real offers.</span></h2><p className="lead">Thousands job hunt with Jd2Job in their corner. Here's what changed.</p></div>
            <div className="twall">
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>Auto Apply sent 120 tailored applications in two weeks. I stopped doom-scrolling LinkedIn and started interviewing.</q><figcaption className="who"><span className="av">SC</span><div><b>Sarah Chen</b><small>Software Engineer · SaaS Company</small></div></figcaption></figure>
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>Every application went out with a résumé rewritten for that exact JD. Recruiters started quoting it back to me on calls.</q><figcaption className="who"><span className="av">AR</span><div><b>Alex Rivera</b><small>Product Designer · Design Studio</small></div></figcaption></figure>
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>The mock interviewer replies instantly — a few minutes in I genuinely forgot it wasn't a person.</q><figcaption className="who"><span className="av">ER</span><div><b>Emily Rodriguez</b><small>Principal PM · FinTech Firm</small></div></figcaption></figure>
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>Screening questions used to eat my whole evening. Now I review a dashboard over coffee and it's done.</q><figcaption className="who"><span className="av">DO</span><div><b>Daniel Okafor</b><small>Solutions Architect · Cloud Company</small></div></figcaption></figure>
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>I used to freeze on "tell me about yourself". Twenty voice mocks later it comes out like second nature.</q><figcaption className="who"><span className="av">MK</span><div><b>Maya Krishnan</b><small>Data Scientist · Tech Startup</small></div></figcaption></figure>
              <figure className="tcard reveal" data-cursor="Read"><div className="stars" aria-label="5 out of 5">★★★★★</div><q>Zero replies to five interviews in a month. The ATS score told me exactly what was holding my résumé back.</q><figcaption className="who"><span className="av">JT</span><div><b>James Tan</b><small>Account Executive · Enterprise Firm</small></div></figcaption></figure>
            </div>
          </div>
        </section>

        {/* PRICING */}
        <section className="pricing" id="pricing">
          <div className="wrap">
            <div className="head center reveal"><span className="kicker" style={{ justifyContent: 'center' }}><span className="idx">(07)</span> Pricing</span><h2 className="split">Price it against one <span class="serif">salary bump.</span></h2><p className="lead">Start free. Upgrade when the interviews pile up. Leave in two clicks.</p></div>
            <div className="pgrid">
              <div className="plan reveal"><h3>Auto-Apply Plan</h3><p className="desc">Just the auto-apply power.</p><div className="price">₹499<small>/mo</small></div><ul><li><svg className="icon"><use href="#i-check" /></svg> 2,000 credits / month</li><li><svg className="icon"><use href="#i-check" /></svg> AI-tailored résumé per job</li><li><svg className="icon"><use href="#i-check" /></svg> Auto-apply on LinkedIn</li><li><svg className="icon"><use href="#i-check" /></svg> ATS match scoring</li><li><svg className="icon"><use href="#i-check" /></svg> Dashboard tracking</li></ul><a className="btn btn-ghost btn-block" href="#" data-cursor="Choose" onClick={handlePricing}>Get started</a></div>
              <div className="plan reveal"><h3>Base Plan</h3><p className="desc">Auto-apply + voice mocks.</p><div className="price">₹999<small>/mo</small></div><ul><li><svg className="icon"><use href="#i-check" /></svg> 2,000 credits / month</li><li><svg className="icon"><use href="#i-check" /></svg> Auto Apply + AI résumés</li><li><svg className="icon"><use href="#i-check" /></svg> Voice mock interviews</li><li><svg className="icon"><use href="#i-check" /></svg> ATS match scoring</li><li><svg className="icon"><use href="#i-check" /></svg> Top-ups available</li></ul><a className="btn btn-ghost btn-block" href="#" data-cursor="Choose" onClick={handlePricing}>Get started</a></div>
              <div className="plan reveal"><h3>Credit Top-up</h3><p className="desc">Extra credits on demand.</p><div className="price">₹249<small>/credit</small></div><ul><li><svg className="icon"><use href="#i-check" /></svg> 1 credit</li><li><svg className="icon"><use href="#i-check" /></svg> Use for applies or mocks</li><li><svg className="icon"><use href="#i-check" /></svg> Requires active plan</li><li><svg className="icon"><use href="#i-check" /></svg> Instant activation</li></ul><a className="btn btn-ghost btn-block" href="#" data-cursor="Add" onClick={handlePricing}>Add credits</a></div>
              <div className="plan feat reveal"><span className="tag">Most popular</span><h3>Monthly Unlimited</h3><p className="desc">For active interview season.</p><div className="price">₹3,999<small>/mo</small></div><ul><li><svg className="icon"><use href="#i-check" /></svg> 2,000 credits + unlimited voice</li><li><svg className="icon"><use href="#i-check" /></svg> Unlimited mock interviews</li><li><svg className="icon"><use href="#i-check" /></svg> Priority AI tailoring</li><li><svg className="icon"><use href="#i-check" /></svg> Follow-up email generator</li><li><svg className="icon"><use href="#i-check" /></svg> Priority support</li></ul><a className="btn btn-primary btn-block" href="#" data-magnetic data-cursor="Choose" onClick={handlePricing}>Get started</a></div>
              <div className="plan reveal"><h3>Quarterly Unlimited</h3><p className="desc">Best value for long searches.</p><div className="price">₹9,999<small>/3 mo</small></div><ul><li><svg className="icon"><use href="#i-check" /></svg> 2,000 credits + unlimited</li><li><svg className="icon"><use href="#i-check" /></svg> Save 17%+ vs monthly</li><li><svg className="icon"><use href="#i-check" /></svg> Priority AI tailoring</li><li><svg className="icon"><use href="#i-check" /></svg> Follow-up email generator</li><li><svg className="icon"><use href="#i-check" /></svg> Priority support</li></ul><a className="btn btn-ghost btn-block" href="#" data-cursor="Choose" onClick={handlePricing}>Get started</a></div>
            </div>
            <div className="pwrap"><p className="pnote"><svg className="icon"><use href="#i-shield" /></svg> All plans include in-memory processing — your audio is never stored.</p></div>
          </div>
        </section>

        {/* FAQ */}
        <section className="faq" id="faq">
          <div className="wrap faq-grid">
            <div className="faq-left"><span className="kicker reveal"><span className="idx">(08)</span> FAQ</span><h2 className="split reveal">The honest <span className="serif">answers.</span></h2><p className="lead reveal">The questions people actually email us about. Still curious?</p><div className="faq-card reveal"><h4>Talk to a human</h4><p>We reply within a day, usually faster.</p><a className="btn btn-ghost" href="mailto:hello@jd2job.com" style={{ padding: '11px 18px' }} data-cursor="Email"><svg className="icon"><use href="#i-mail" /></svg> hello@jd2job.com</a></div></div>
            <div className="flist">
              <details className="reveal"><summary>How does Auto Apply actually work? <span className="plus"><svg className="icon"><use href="#i-plus" /></svg></span></summary><div className="faq-body"><div><p>Our Chrome extension reads each LinkedIn job description, the AI rewrites your résumé for that exact role, fills the Easy Apply form and answers the screening questions from your profile. You watch every application from the dashboard and can pause or review anytime.</p></div></div></details>
              <details className="reveal"><summary>Is the mock interview really voice? <span className="plus"><svg className="icon"><use href="#i-plus" /></svg></span></summary><div className="faq-body"><div><p>Yes — full speech-to-speech. It greets you, asks questions built from your résumé and the job description, listens, and replies in about a second. Interrupt it mid-sentence and it handles that like a human would.</p></div></div></details>
              <details className="reveal"><summary>Do you keep or train on my audio? <span className="plus"><svg className="icon"><use href="#i-plus" /></svg></span></summary><div className="faq-body"><div><p>Never. Your voice stream is transcribed and processed in memory, then thrown away. No audio files or transcripts are written to our servers or used to train any model.</p></div></div></details>
              <details className="reveal"><summary>Will my tailored résumé sound robotic? <span className="plus"><svg className="icon"><use href="#i-plus" /></svg></span></summary><div className="faq-body"><div><p>No. Every résumé is rewritten from your real experience against the specific JD — same facts, sharper framing — and scored for ATS match before anything is submitted. You can review and edit first.</p></div></div></details>
              <details className="reveal"><summary>Can I cancel anytime? <span className="plus"><svg className="icon"><use href="#i-plus" /></svg></span></summary><div className="faq-body"><div><p>Two clicks, no emails, no retention calls. Credits already in your account stay usable until they run out.</p></div></div></details>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="cta">
          <div className="wrap"><div className="cta-card reveal"><div className="orb"></div><span className="kicker on-dark" style={{ justifyContent: 'center' }}>Your edge starts now</span><h2 className="split" style={{ marginTop: '22px' }}>Your next offer<span className="serif"> is already in the pile.</span></h2><p>Set up in two minutes. Your first tailored applications go out today.</p><div className="cta-actions"><a className="btn btn-light" href="#" data-magnetic data-cursor="Start" onClick={handleStart}>Start free <svg className="icon arrow"><use href="#i-arrow" /></svg></a><a className="btn btn-glass" href="#" data-cursor="Download" onClick={(e) => { e.preventDefault(); window.open('https://api.jd2job.com/api/download', '_blank'); }}><svg className="icon"><use href="#i-cube" /></svg> Get Desktop App</a></div><span className="micro"><svg className="icon"><use href="#i-shield" /></svg> No card · in-memory privacy · cancel anytime</span></div></div>
        </section>
      </main>

      <footer>
        <div className="wrap">
          <div className="foot-top">
            <div className="foot-brand"><a className="brand" href="#top"><span className="mark"><Jd2JobLogo width={24} height={24} /></span> Jd2Job</a><p>The job-search copilot — Auto Apply, AI résumés and voice mock interviews.</p></div>
            <div className="foot-col"><h4>Product</h4><a href="#auto-apply">Auto Apply</a><a href="#mock">Mock Interview</a><a href="#pricing">Pricing</a><a href="#" onClick={(e) => { e.preventDefault(); window.open('https://api.jd2job.com/api/download', '_blank'); }}>Desktop App</a><a href="/blog">Blog</a><a href="#faq">FAQ</a></div>
            <div className="foot-col"><h4>Company</h4><a href="#about" onClick={(e) => { e.preventDefault(); setLegalPage('about'); }}>About</a><a href="#privacy" onClick={(e) => { e.preventDefault(); setLegalPage('privacy'); }}>Privacy</a><a href="#terms" onClick={(e) => { e.preventDefault(); setLegalPage('terms'); }}>Terms</a><a href="mailto:hello@jd2job.com">Contact</a></div>
            <div className="news"><h4>The short list</h4><p>Job-search notes and product changes. A few times a year, never more.</p><form onSubmit={(e) => { e.preventDefault(); window.open('mailto:hello@jd2job.com?subject=Newsletter%20Signup', '_blank'); }}><label htmlFor="lp-email">Email address</label><input id="lp-email" type="email" placeholder="you@email.com" autoComplete="email" required /><button className="btn btn-primary" type="submit" aria-label="Subscribe" style={{ padding: '12px 14px' }}><svg className="icon"><use href="#i-arrow" /></svg></button></form></div>
          </div>
          <div className="foot-mark" aria-hidden="true">Jd2Job</div>
          <div className="foot-bottom"><span>© {new Date().getFullYear()} Jd2Job. Made with care.</span><div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}><a className="lk" href="#top" style={{ fontFamily: 'var(--mono)', fontSize: '.76rem', display: 'inline-flex', gap: '7px', alignItems: 'center' }}><svg className="icon" style={{ width: '14px', height: '14px' }}><use href="#i-arrow" /></svg> Back to top</a><div className="socials"><a href="https://x.com/jd2job" target="_blank" rel="noopener noreferrer" aria-label="X / Twitter"><svg className="icon"><use href="#i-twitter" /></svg></a><a href="https://linkedin.com/company/jd2job" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn"><svg className="icon"><use href="#i-linkedin" /></svg></a><a href="https://github.com/Yadav0896/jd2job-suite" target="_blank" rel="noopener noreferrer" aria-label="GitHub"><svg className="icon"><use href="#i-github" /></svg></a></div></div></div>
        </div>
      </footer>

      {legalPage && <LegalModal page={legalPage} onClose={() => setLegalPage(null)} />}
      <SupportWidget />

      {/* Mobile responsive fixes */}
      <style>{`
        @media (max-width: 768px) {
          .lp .hero-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
          .lp .hero h1 { font-size: 2.2rem !important; }
          .lp .hero .lead { font-size: 0.9rem !important; }
          .lp .scene3d { display: none !important; }
          .lp .vrail { display: none !important; }
          .lp .spin-grid { grid-template-columns: 1fr !important; }
          .lp .spin-grid.rev { display: flex; flex-direction: column-reverse; }
          .lp .steps { grid-template-columns: 1fr !important; }
          .lp .bgrid { grid-template-columns: 1fr !important; }
          .lp .sgrid { grid-template-columns: 1fr 1fr !important; }
          .lp .twall { grid-template-columns: 1fr !important; }
          .lp .pgrid { grid-template-columns: 1fr !important; }
          .lp .faq-grid { grid-template-columns: 1fr !important; }
          .lp .nav-links { display: none !important; }
          .lp .nav-links.open { display: flex !important; flex-direction: column; position: absolute; top: 100%; left: 0; right: 0; background: var(--glass-bg, rgba(11,13,20,0.95)); backdrop-filter: blur(20px); padding: 16px; border-bottom: 1px solid var(--border); }
          .lp .burger { display: block !important; }
          .lp .foot-top { grid-template-columns: 1fr 1fr !important; }
          .lp .hero-cta { flex-direction: column; }
          .lp .cta-card { padding: 32px 20px !important; }
          .lp .cta-card h2 { font-size: 1.6rem !important; }
          .lp .news form { flex-direction: column; }
          .lp .status .wrap { flex-wrap: wrap; justify-content: center; }
          .lp { overflow-x: hidden; }
        }
        @media (max-width: 480px) {
          .lp .hero h1 { font-size: 1.8rem !important; }
          .lp .sgrid { grid-template-columns: 1fr !important; }
          .lp .foot-top { grid-template-columns: 1fr !important; }
          .lp .foot-bottom { flex-direction: column; gap: 12px !important; text-align: center; }
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
