import {animate} from '../vendor/motion-dom.js';
import {gsap} from '../vendor/gsap.min.js';

export const motionLibraries = Object.freeze({framerMotion: '14.1.0', gsap: gsap.version, renderer: 'native DOM + SVG + Canvas'});
const mounted = new WeakMap();
const FOCUSABLE = '.galaxy-node, .intelligence-device, .pulse-cell, [data-motion-hover]';
const ease = [0.2, 0.72, 0.24, 1];

/** Native DOM Framer Motion, finite GSAP SVG sequences and a quiet Canvas lightfield.
 * All motion is decorative: no animation alters business values, requests or selection.
 */
export function mountMotion(root, {reduced} = {}) {
  if (!root || !gsap) return {refresh() {}, dispose() {}, playLogin() {}};
  mounted.get(root)?.dispose();
  const abort = new AbortController();
  const media = matchMedia('(prefers-reduced-motion: reduce)');
  const seen = new WeakSet();
  const controls = new Set();
  const tweens = new Set();
  const hoverControl = new WeakMap();
  const counts = new WeakMap();
  const previousCounts = new Map();
  const fields = new Map();
  const tideFlows = new Map();
  const tideShapes = new WeakMap();
  let disposed = false;
  const quiet = () => reduced === true || media.matches || document.hidden;
  root.dataset.motionLibraries = 'framer-motion-dom-14.1.0 gsap-3.15.0 svg canvas';

  function tween(target, vars) {
    const item = gsap.to(target, {...vars, overwrite: 'auto', onComplete() {tweens.delete(item); vars.onComplete?.();}});
    tweens.add(item);
    return item;
  }
  function waapi(element, properties, options = {}) {
    hoverControl.get(element)?.stop();
    const control = animate(element, properties, {duration: 0.22, ease, ...options});
    controls.add(control);
    hoverControl.set(element, control);
    control.finished.then(() => controls.delete(control), () => controls.delete(control));
    return control;
  }
  function networkHighlight(id) {
    for (const edge of root.querySelectorAll('[data-network-source][data-network-target]')) {
      const connected = edge.dataset.networkSource === id || edge.dataset.networkTarget === id;
      edge.classList.toggle('network-highlight', Boolean(id) && connected);
      edge.classList.toggle('network-muted', Boolean(id) && !connected);
    }
  }
  function highlight(event, entering) {
    const networkNode = event.target.closest?.('[data-node-id]');
    if (networkNode && root.contains(networkNode) && !(event.relatedTarget && networkNode.contains(event.relatedTarget))) {
      const focused = document.activeElement?.closest?.('[data-node-id]');
      networkHighlight(entering ? networkNode.dataset.nodeId : focused && root.contains(focused) ? focused.dataset.nodeId : null);
    }
    const element = event.target.closest?.(FOCUSABLE);
    if (!element || !root.contains(element) || (event.relatedTarget && element.contains(event.relatedTarget))) return;
    if (quiet()) return;
    // A pixel of elevation keeps nodes fixed within their data space.
    waapi(element, {translate: entering ? '0 -2px' : '0 0', filter: entering ? 'brightness(1.09)' : 'brightness(1)'});
  }
  function pointer(event) {
    const element = event.target.closest?.('.intelligence-device, .command-access-card, [data-motion-hover]');
    if (!element || !root.contains(element) || quiet()) return;
    const box = element.getBoundingClientRect();
    element.style.setProperty('--pointer-x', `${Math.round(event.clientX - box.left)}px`);
    element.style.setProperty('--pointer-y', `${Math.round(event.clientY - box.top)}px`);
    for (const field of fields.values()) field.wake();
  }
  root.addEventListener('pointerover', event => highlight(event, true), {signal: abort.signal});
  root.addEventListener('pointerout', event => highlight(event, false), {signal: abort.signal});
  root.addEventListener('focusin', event => highlight(event, true), {signal: abort.signal});
  root.addEventListener('focusout', event => highlight(event, false), {signal: abort.signal});
  root.addEventListener('pointermove', pointer, {passive: true, signal: abort.signal});

  function decoratePaths() {
    let index = 0;
    for (const path of root.querySelectorAll('[data-light-track]')) {
      if (seen.has(path)) continue;
      seen.add(path);
      if (quiet() || !path.getTotalLength) continue;
      const length = path.getTotalLength();
      if (!Number.isFinite(length) || length <= 0) continue;
      const originalDash = path.style.strokeDasharray;
      path.style.strokeDasharray = `${length}`;
      path.style.strokeDashoffset = `${length}`;
      tween(path, {strokeDashoffset: 0, duration: 0.8, delay: Math.min(index++ * 0.045, 0.5), ease: 'power2.out',
        onComplete() {path.style.strokeDasharray = originalDash; path.style.strokeDashoffset = '';}});
    }
  }

  function refresh() {
    if (disposed) return;
    for (const element of root.querySelectorAll('[data-motion]')) {
      if (seen.has(element)) continue;
      seen.add(element);
      if (quiet() || element.dataset.motion === 'pulse') continue;
      // Finite entrance only. Polling never replays animation on retained elements.
      waapi(element, {opacity: [0.68, 1], translate: ['0 8px', '0 0']}, {duration: 0.32});
    }
    let countIndex = 0;
    for (const element of root.querySelectorAll('[data-count-value]')) {
      const target = Number(element.dataset.countValue);
      const key = `${location.hash}:${element.id || element.dataset.countKey || countIndex++}`;
      const previous = counts.get(element) ?? previousCounts.get(key) ?? 0;
      counts.set(element, target);
      previousCounts.set(key, target);
      if (!Number.isFinite(target) || previous === target || quiet()) continue;
      const decimals = element.dataset.countDecimals === undefined ? (Number.isInteger(target) ? 0 : 1) : Number(element.dataset.countDecimals);
      const suffix = element.dataset.countSuffix || '';
      const value = {number: previous};
      element.setAttribute('aria-label', `${target}${suffix}`);
      tween(value, {number: target, duration: 0.42, ease: 'power2.out', onUpdate() {element.textContent = `${value.number.toFixed(decimals)}${suffix}`;},
        onComplete() {element.textContent = `${target.toFixed(decimals)}${suffix}`;}});
    }
    decoratePaths();
    syncTides();
    // A data patch may update edge classes while a retained keyboard target is
    // still focused. Reapply its actual relations, never invent new edges.
    const focusedNode = document.activeElement?.closest?.('[data-node-id]');
    const hoveredNode = [...root.querySelectorAll('[data-node-id]')].find(node => node.matches(':hover'));
    networkHighlight(hoveredNode?.dataset.nodeId || (focusedNode && root.contains(focusedNode) ? focusedNode.dataset.nodeId : null));
    for (const [canvas, field] of fields) if (!root.contains(canvas)) {field.dispose(); fields.delete(canvas);}
    for (const canvas of root.querySelectorAll('[data-light-canvas]')) if (!fields.has(canvas)) fields.set(canvas, lightfield(canvas, quiet));
  }

  function syncTides() {
    for (const [path,animation] of tideFlows) if (!root.contains(path)) {animation.cancel();tideFlows.delete(path);}
    for (const chart of root.querySelectorAll('.tide-chart')) {
      chart.dataset.tideMotion=quiet()?'paused':'running';
      for(const path of chart.querySelectorAll('.tide-line,.tide-area,.tide-flow')){
        const target=path.getAttribute('d'),previous=tideShapes.get(path);tideShapes.set(path,target);
        if(previous&&previous!==target&&!quiet()){
          gsap.killTweensOf(path,'attr');path.setAttribute('d',previous);
          tween(path,{attr:{d:target},duration:.35,ease:'power2.out'});
        }
      }
      let index=0;
      for(const path of chart.querySelectorAll('[data-tide-flow]')){
        let animation=tideFlows.get(path);
        if(!animation){animation=path.animate([{strokeDashoffset:100},{strokeDashoffset:0}],{duration:16000+index*400,iterations:Infinity});tideFlows.set(path,animation);}
        quiet()?animation.pause():animation.play();index++;
      }
    }
    const rings=[...root.querySelectorAll('.insight-booking-map .pulse-cell')].filter(cell=>Number(cell.style.getPropertyValue('--pulse-strength'))>=.9).slice(0,3).map(cell=>cell.querySelector('.pulse-rings'));
    for(const ring of rings){
      let animation=tideFlows.get(ring);
      if(!animation){animation=ring.animate([{opacity:.64},{opacity:1},{opacity:.64}],{duration:4800,iterations:Infinity});tideFlows.set(ring,animation);}
      quiet()?animation.pause():animation.play();
    }
    for(const [element,animation]of tideFlows)if(element.classList.contains('pulse-rings')&&!rings.includes(element)){animation.cancel();tideFlows.delete(element);}
  }

  function playLogin({success = false} = {}) {
    if (disposed || quiet()) return;
    const button = root.querySelector('[data-login-submit], #admin-login-form button[type="submit"], button[type="submit"]');
    if (!button) return;
    const host = root.querySelector('.command-access-card') || button.parentElement;
    const rect = button.getBoundingClientRect(), parent = host.getBoundingClientRect();
    const ring = document.createElement('span');
    ring.setAttribute('aria-hidden', 'true');
    Object.assign(ring.style, {position: 'absolute', pointerEvents: 'none', zIndex: '3', width: '18px', height: '18px', borderRadius: '50%',
      left: `${rect.left - parent.left + rect.width / 2 - 9}px`, top: `${rect.top - parent.top + rect.height / 2 - 9}px`,
      border: `1px solid ${success ? 'rgba(101,233,204,.72)' : 'rgba(160,150,255,.65)'}`, opacity: '0.7'});
    host.append(ring);
    const control = waapi(ring, {scale: [1, 8], opacity: [0.7, 0]}, {duration: 0.5});
    control.finished.then(() => ring.remove(), () => ring.remove());
    for (const field of fields.values()) field.wake();
  }

  function quietChanged() {
    if (quiet()) {
      for (const control of controls) control.complete?.();
      for (const item of tweens) item.progress(1);
    }
    for (const field of fields.values()) field.sync();
    syncTides();
  }
  document.addEventListener('visibilitychange', quietChanged, {signal: abort.signal});
  media.addEventListener('change', quietChanged, {signal: abort.signal});
  const api = {refresh, playLogin, dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    for (const control of controls) control.stop();
    for (const item of tweens) item.kill();
    for (const field of fields.values()) field.dispose();
    for (const animation of tideFlows.values()) animation.cancel();
    tideFlows.clear();
    controls.clear(); tweens.clear(); fields.clear();
    mounted.delete(root);
  }};
  mounted.set(root, api);
  refresh();
  return api;
}

export function updateMotion(root) {mounted.get(root)?.refresh();}
export function animateLoginSubmit(root, options) {mounted.get(root)?.playLogin(options);}

function lightfield(canvas, quiet) {
  const context = canvas.getContext('2d', {alpha: true});
  if (!context) return {sync() {}, wake() {}, dispose() {}};
  let width = 1, height = 1, raf = 0, disposed = false, visible = true, last = 0, drawn = 0, slow = 0, limited = false;
  let awakeUntil = performance.now() + 45000;
  const start = performance.now();
  // Fixed particle phase and position: not a force/random simulation and not business data.
  const particles = Array.from({length: 16}, (_, index) => ({phase: (index * 0.61803398875) % 1, lane: index % 2, size: index % 5 ? 1.5 : 2.4}));
  const curve = (p, lane, time) => ({x: width * (0.04 + p * 0.92), y: height * (0.49 + lane * 0.17 + Math.sin(p * Math.PI * 1.8 + lane * 1.4) * 0.14 + Math.sin(time * 0.22) * 0.02)});
  function resize() {
    const box = canvas.getBoundingClientRect();
    width = Math.max(1, box.width); height = Math.max(1, box.height);
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1400 / width, 1000 / height);
    canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    draw(performance.now());
  }
  function draw(now) {
    const began = performance.now(), time = (now - start) / 1000;
    context.clearRect(0, 0, width, height);
    if (quiet()) return;
    for (let lane = 0; lane < 2; lane++) {
      context.beginPath();
      for (let step = 0; step <= 42; step++) {
        const point = curve(step / 42, lane, time);
        if (!step) context.moveTo(point.x, point.y); else context.lineTo(point.x, point.y);
      }
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, 'rgba(92,111,246,0)'); gradient.addColorStop(0.5, 'rgba(131,122,246,.18)'); gradient.addColorStop(1, 'rgba(92,111,246,0)');
      context.strokeStyle = gradient; context.lineWidth = 1; context.stroke();
    }
    for (const particle of particles) {
      const point = curve((particle.phase + time * 0.037) % 1, particle.lane, time);
      context.beginPath(); context.arc(point.x, point.y, particle.size, 0, Math.PI * 2);
      context.fillStyle = particle.lane ? 'rgba(117,189,222,.40)' : 'rgba(170,151,253,.47)'; context.fill();
    }
    const cost = performance.now() - began;
    slow = cost > 10 ? slow + 1 : Math.max(0, slow - 1);
    if (slow >= 6) limited = true;
    canvas.dataset.motionFrames = `${++drawn}`;
  }
  function allowed() {return !disposed && !quiet() && visible && !limited && performance.now() < awakeUntil;}
  function tick(now) {
    raf = 0;
    if (!allowed()) return;
    // Canvas is an ambient accent capped to 24fps; browser can idle between frames.
    if (now - last >= 1000 / 24) {last = now; draw(now);}
    if (allowed()) raf = requestAnimationFrame(tick);
  }
  function sync() {if (!allowed() && raf) {cancelAnimationFrame(raf); raf = 0;} if (allowed() && !raf) raf = requestAnimationFrame(tick); if (quiet()) context.clearRect(0, 0, width, height);}
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(canvas);
  const observer = new IntersectionObserver(entries => {visible = entries[0]?.isIntersecting ?? true; sync();});
  observer.observe(canvas);
  resize(); sync();
  return {sync, wake() {awakeUntil = performance.now() + 30000; sync();}, dispose() {disposed = true; if (raf) cancelAnimationFrame(raf); resizeObserver.disconnect(); observer.disconnect(); context.clearRect(0, 0, width, height);}};
}
