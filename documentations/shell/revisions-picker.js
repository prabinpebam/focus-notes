// Devtools-style element picker for reader revisions. Hit testing, unique selectors and optional
// React source context come from React Grab's framework-agnostic primitives, vendored in
// shell/vendor and loaded only when picking starts. Outlines are drawn in a separate fixed layer
// and a transparent glass takes the pointer, so the document's markup, classes, styles, hover and
// click behavior are never changed. React Grab's freeze is deliberately not used: it marks
// document elements and switches page-wide pointer events.

const VENDOR_URL = new URL('./vendor/react-grab-primitives.min.js', import.meta.url);
let loading = null;
export function loadPrimitives() {
  loading ||= import(VENDOR_URL.href).catch(error => { loading = null; throw error; });
  return loading;
}

const IMPLICIT_ROLES = {
  a: element => element.hasAttribute('href') ? 'link' : '', article: 'article', aside: 'complementary',
  blockquote: 'blockquote', button: 'button', code: 'code', dd: 'definition', details: 'group', dl: 'list',
  dt: 'term', figcaption: 'caption', figure: 'figure', h1: 'heading', h2: 'heading', h3: 'heading',
  h4: 'heading', h5: 'heading', h6: 'heading', hr: 'separator', img: element => element.getAttribute('alt') === '' ? 'presentation' : 'img',
  li: 'listitem', nav: 'navigation', ol: 'list', p: 'paragraph', pre: '', section: 'region', summary: '',
  svg: 'graphics-document', table: 'table', tbody: 'rowgroup', td: 'cell', th: 'columnheader', thead: 'rowgroup', tr: 'row', ul: 'list',
};

function normalize(value) { return (value || '').replace(/\s+/g, ' ').trim(); }

export function roleOf(element) {
  const explicit = normalize(element.getAttribute('role')).split(' ')[0];
  if (explicit) return explicit.slice(0, 100);
  const implicit = IMPLICIT_ROLES[element.localName];
  return (typeof implicit === 'function' ? implicit(element) : implicit) || '';
}

export function nameOf(element) {
  const labelled = normalize(element.getAttribute('aria-labelledby')).split(' ').filter(Boolean)
    .map(id => element.ownerDocument.getElementById(id)?.textContent).filter(Boolean).join(' ');
  const svgTitle = element.localName === 'svg' ? element.querySelector(':scope > title')?.textContent : '';
  const named = normalize(element.getAttribute('aria-label')) || normalize(labelled) || normalize(element.getAttribute('alt'))
    || normalize(svgTitle) || normalize(element.getAttribute('title'));
  if (named) return named.slice(0, 1000);
  return ['link', 'button', 'heading', 'cell', 'columnheader', 'term', 'listitem', 'caption'].includes(roleOf(element))
    ? normalize(element.textContent).slice(0, 1000) : '';
}

function describeNode(element) {
  const classes = [...element.classList].filter(name => !name.startsWith('revision-')).slice(0, 3);
  return `${element.localName}${element.id ? `#${element.id}` : ''}${classes.map(name => `.${name}`).join('')}`.slice(0, 300);
}

function hasReactFiber(element) {
  return Object.keys(element).some(key => key.startsWith('__reactFiber$') || key.startsWith('__reactInternalInstance$'));
}

function uniqueSelector(element, primitives) {
  try {
    const selector = primitives.getElementSelector(element);
    if (selector && selector.length <= 4096 && !selector.includes('>>')) {
      const matches = element.ownerDocument.querySelectorAll(selector);
      if (matches.length === 1 && matches[0] === element) return selector;
    }
  } catch { /* fall back to a structural path */ }
  const parts = [];
  for (let current = element; current && current.parentElement; current = current.parentElement) {
    if (current.id && element.ownerDocument.querySelectorAll(`#${CSS.escape(current.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(current.id)}`);
      return parts.join(' > ');
    }
    const siblings = [...current.parentElement.children].filter(sibling => sibling.localName === current.localName);
    parts.unshift(`${CSS.escape(current.localName)}:nth-of-type(${siblings.indexOf(current) + 1})`);
  }
  return `:root > ${parts.join(' > ')}`.slice(0, 4096);
}

async function componentOf(element, primitives) {
  if (!hasReactFiber(element)) return null;
  try {
    const context = await Promise.race([
      primitives.getElementContext(element),
      new Promise((resolve, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
    ]);
    const stack = (context.stack || []).slice(0, 20).map(frame => ({
      name: frame.functionName ? String(frame.functionName).slice(0, 500) : null,
      file: frame.fileName ? String(frame.fileName).slice(0, 2048) : null,
      line: Number.isSafeInteger(frame.lineNumber) && frame.lineNumber >= 0 ? frame.lineNumber : null,
      column: Number.isSafeInteger(frame.columnNumber) && frame.columnNumber >= 0 ? frame.columnNumber : null,
    }));
    return context.componentName || stack.length ? { name: context.componentName ? String(context.componentName).slice(0, 500) : null, stack } : null;
  } catch { return null; }
  finally { try { primitives.disposeBaselineStyles(); } catch { /* nothing to release */ } }
}

// Element-level grounding for one picked element. `path` locates it inside the block snapshot,
// whose exact HTML provides the element snapshot; everything rendered is recorded as a hint.
export async function describeElement(element, { root, blockHtml, path }) {
  const primitives = await loadPrimitives();
  const template = document.createElement('template');
  template.innerHTML = blockHtml;
  const snapshotRoot = template.content.firstElementChild;
  const snapshot = path ? snapshotRoot?.querySelector(`:scope > ${path}`) : snapshotRoot;
  const html = snapshot?.outerHTML;
  if (!html || !blockHtml.includes(html)) throw new Error('This element could not be matched exactly to the saved block snapshot');
  const ancestors = [];
  for (let current = element.parentElement; current && current !== root && root.contains(current); current = current.parentElement) {
    ancestors.unshift(describeNode(current));
  }
  const bounds = element.getBoundingClientRect();
  return {
    path, tag: snapshot.localName, role: roleOf(element), name: nameOf(element),
    text: normalize(snapshot.textContent).slice(0, 10000),
    html: html.slice(0, 20000), htmlTruncated: html.length > 20000,
    selector: uniqueSelector(element, primitives),
    ancestors: ancestors.slice(-32),
    bounds: {
      x: Math.round(bounds.left), y: Math.round(bounds.top), width: Math.round(bounds.width), height: Math.round(bounds.height),
      viewportWidth: document.documentElement.clientWidth, viewportHeight: innerHeight,
    },
    component: await componentOf(element, primitives),
  };
}

export function createPicker({ host, before, scroller, root, eligible, blocks, label, announce: describe, onPick, onStop }) {
  const layer = document.createElement('div');
  layer.className = 'revision-pick-layer';
  layer.setAttribute('data-react-grab-ignore', '');
  layer.hidden = true;
  const frame = document.createElement('div');
  frame.className = 'revision-pick-frame';
  const glass = document.createElement('div');
  glass.className = 'revision-pick-glass';
  glass.tabIndex = 0;
  glass.hidden = true;
  glass.setAttribute('role', 'application');
  glass.setAttribute('aria-roledescription', 'element picker');
  glass.setAttribute('aria-label', 'Select elements on this page');
  glass.setAttribute('aria-describedby', 'revision-pick-keys');
  const keys = document.createElement('p');
  keys.id = 'revision-pick-keys';
  keys.className = 'sr-only';
  keys.textContent = 'Arrow keys move between elements: up for the parent, down for the first child, left and right for siblings. Enter selects and stops; Shift+Enter adds or removes and keeps selecting. Escape stops.';
  const status = document.createElement('p');
  status.className = 'sr-only revision-pick-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  frame.append(glass);
  layer.append(frame, keys, status);
  host.insertBefore(layer, before);

  let primitives = null;
  let picking = false;
  let candidate = null;
  let selected = [];
  let reading = false;
  let raf = 0;
  let timer = 0;
  let pointer = null;
  const boxes = [];

  function say(text) {
    status.textContent = '';
    setTimeout(() => { status.textContent = text; }, 50);
  }
  function frameBounds() {
    const area = scroller();
    const bounds = area.getBoundingClientRect();
    const top = Math.max(bounds.top, 0);
    return { left: bounds.left, top, width: area.clientWidth, height: Math.max(0, Math.min(bounds.top + area.clientHeight, innerHeight) - top) };
  }
  function box(index, element, kind) {
    let node = boxes[index];
    if (!node) {
      node = document.createElement('span');
      node.setAttribute('aria-hidden', 'true');
      boxes[index] = node;
      frame.append(node);
    }
    node.className = `revision-pick-box revision-pick-box--${kind}`;
    const area = frame.getBoundingClientRect();
    const bounds = element.getBoundingClientRect();
    node.style.transform = `translate(${bounds.left - area.left}px, ${bounds.top - area.top}px)`;
    node.style.width = `${bounds.width}px`;
    node.style.height = `${bounds.height}px`;
    node.hidden = false;
    return { node, bounds, area };
  }
  function draw() {
    raf = 0;
    const visible = picking || selected.some(element => element.isConnected);
    layer.hidden = !visible;
    if (!visible) return;
    const area = frameBounds();
    Object.assign(frame.style, { left: `${area.left}px`, top: `${area.top}px`, width: `${area.width}px`, height: `${area.height}px` });
    let index = 0;
    for (const element of selected) if (element.isConnected && root().contains(element)) box(index++, element, 'selected');
    const tag = frame.querySelector('.revision-pick-label') || frame.appendChild(Object.assign(document.createElement('span'), { className: 'revision-pick-label' }));
    tag.setAttribute('aria-hidden', 'true');
    if (picking && candidate?.isConnected) {
      const { bounds, area: inner } = box(index++, candidate, 'candidate');
      tag.textContent = `${label(candidate)} · ${Math.round(bounds.width)}×${Math.round(bounds.height)}`;
      tag.hidden = false;
      const above = bounds.top - inner.top >= 26;
      tag.style.transform = `translate(${Math.max(0, bounds.left - inner.left)}px, ${above ? bounds.top - inner.top - 24 : Math.max(0, bounds.top - inner.top) + 2}px)`;
    } else tag.hidden = true;
    boxes.slice(index).forEach(node => { node.hidden = true; });
  }
  // Once per frame, with a timer fallback for pages that are not currently painting frames.
  function redraw() {
    if (raf) return;
    const run = () => { cancelAnimationFrame(raf); clearTimeout(timer); draw(); };
    raf = requestAnimationFrame(run);
    timer = setTimeout(run, 100);
  }
  const observer = new MutationObserver(redraw);
  observer.observe(scroller(), { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'hidden', 'style'] });
  addEventListener('scroll', redraw, true);
  addEventListener('resize', redraw);

  function at(x, y) {
    if (!primitives) return null;
    const container = root();
    const hit = primitives.getElementAtPoint(x, y, { container, filter: element => eligible(element) && primitives.isElementGrabbable(element) });
    return hit && eligible(hit) ? hit : null;
  }
  function usable(element) { return !!element && eligible(element) && (!primitives || primitives.isElementGrabbable(element)); }
  function show(element, fromKeys) {
    candidate = element;
    redraw();
    if (element && fromKeys) {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      say(describe(element));
    }
  }
  function step(direction) {
    const list = blocks().filter(usable);
    if (!candidate || !candidate.isConnected) {
      const area = frameBounds();
      show(list.find(element => element.getBoundingClientRect().bottom > area.top) || list[0] || null, true);
      return;
    }
    let next = null;
    if (direction === 'up') {
      for (let parent = candidate.parentElement; parent && root().contains(parent); parent = parent.parentElement) if (usable(parent)) { next = parent; break; }
    } else if (direction === 'down') {
      const walker = document.createTreeWalker(candidate, NodeFilter.SHOW_ELEMENT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (usable(node)) { next = node; break; }
    } else if (list.includes(candidate)) {
      next = list[list.indexOf(candidate) + (direction === 'next' ? 1 : -1)] || null;
    } else {
      const move = element => direction === 'next' ? element.nextElementSibling : element.previousElementSibling;
      for (let sibling = move(candidate); sibling; sibling = move(sibling)) if (usable(sibling)) { next = sibling; break; }
    }
    if (next) show(next, true);
    else say(`No ${direction === 'up' ? 'parent' : direction === 'down' ? 'child' : direction === 'next' ? 'next' : 'previous'} element to select.`);
  }
  async function pick(element, add) {
    if (!element || reading) return;
    reading = true;
    glass.setAttribute('aria-busy', 'true');
    try {
      say(await onPick(element, add));
      if (!add) stop('picked');
    } catch (error) {
      say(`That element could not be selected: ${error.message}. Try its parent.`);
    } finally {
      reading = false;
      glass.removeAttribute('aria-busy');
    }
  }

  glass.addEventListener('pointerdown', event => {
    event.preventDefault();
    glass.focus({ preventScroll: true });
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, top: scroller().scrollTop, moved: false, touch: event.pointerType !== 'mouse' };
    glass.setPointerCapture?.(event.pointerId);
  });
  glass.addEventListener('pointermove', event => {
    if (pointer?.touch && pointer.id === event.pointerId) {
      if (Math.abs(event.clientY - pointer.y) > 8) pointer.moved = true;
      if (pointer.moved) { scroller().scrollTop = pointer.top - (event.clientY - pointer.y); return; }
    }
    show(at(event.clientX, event.clientY), false);
  });
  glass.addEventListener('pointerup', event => {
    const press = pointer;
    pointer = null;
    if (!press || press.id !== event.pointerId || press.moved || event.button > 0) return;
    pick(at(event.clientX, event.clientY), event.shiftKey);
  });
  glass.addEventListener('pointercancel', () => { pointer = null; });
  glass.addEventListener('pointerleave', () => { if (!pointer) show(null, false); });
  glass.addEventListener('wheel', event => {
    event.preventDefault();
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scroller().clientHeight : 1;
    scroller().scrollBy({ left: event.deltaX * scale, top: event.deltaY * scale, behavior: 'instant' });
  }, { passive: false });
  glass.addEventListener('keydown', event => {
    const rtl = getComputedStyle(root()).direction === 'rtl';
    const actions = {
      ArrowUp: () => step('up'), ArrowDown: () => step('down'),
      ArrowLeft: () => step(rtl ? 'next' : 'previous'), ArrowRight: () => step(rtl ? 'previous' : 'next'),
      Enter: () => candidate ? pick(candidate, event.shiftKey) : step('down'),
      ' ': () => candidate ? pick(candidate, event.shiftKey) : step('down'),
      Escape: () => stop('escape'),
    };
    const action = actions[event.key];
    if (!action || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    event.stopPropagation();
    action();
  });

  async function start({ focus = true } = {}) {
    primitives = await loadPrimitives();
    if (picking) return;
    picking = true;
    glass.hidden = false;
    draw();
    if (focus) {
      glass.focus({ preventScroll: true });
      say('Selecting elements. Point at one, or use the arrow keys.');
    }
  }
  function stop(reason = 'stop') {
    if (!picking) return;
    picking = false;
    candidate = null;
    pointer = null;
    glass.hidden = true;
    redraw();
    onStop(reason);
  }
  return {
    start, stop, redraw,
    get picking() { return picking; },
    setSelected(elements) {
      selected = elements;
      redraw();
    },
  };
}
