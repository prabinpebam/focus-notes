import {
  archiveRevision, createRevision, formatRevisionPrompt, newId, normalizeText, reopenRevision,
  revise, safeContentPath, safeHostPath, sha256, validateRevision, verifyRevision, MAX_REVISION_BYTES, SCHEMA_VERSION,
} from './revisions-core.js';
import { createPicker, describeElement } from './revisions-picker.js';

const COMPONENTS = '.slate-card,.slate-callout,.slate-metric,.slate-step,.slate-tldr';
const BLOCKS = `h1,h2,h3,h4,h5,h6,p,li,table,dl,figure,img,svg,pre,blockquote,${COMPONENTS}`;
const ATOMIC = `li,table,dl,figure,pre,blockquote,svg,p,h1,h2,h3,h4,h5,h6,${COMPONENTS}`;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function button(text, action, className) {
  const element = node('button', text, className);
  element.type = 'button';
  if (action) element.addEventListener('click', action);
  return element;
}

function icon(name) {
  const element = node('span', name, 'material-symbols-outlined');
  element.setAttribute('aria-hidden', 'true');
  return element;
}

function actionButton(label, symbol, action, className = '') {
  const element = button('', action, className);
  element.append(icon(symbol), node('span', label, 'revision-button-label'));
  return element;
}

// Icon-only controls carry their label as the accessible name and as a tooltip shown on hover and keyboard focus.
function iconButton(label, symbol, action, className = '') {
  const element = button('', action, `revision-icon-button ${className}`.trim());
  element.append(icon(symbol));
  element.setAttribute('aria-label', label);
  element.dataset.tooltip = label;
  return element;
}

const HANDOFF = revision => `Act on Slate revision ${revision.id} (${revision.name}), version ${revision.version}. Read .slate/revisions/${revision.id}.json in the parent project; its host is ${revision.host}. Follow the Slate revision agent procedure: read every comment, act on open comments and use addressed comments as context, inspect exact source snapshots, resolve stale targets without guessing, change canonical sources, verify the requested outcome, then archive with the version read before acting and a completion summary. Leave unresolved work active.`;

function selectorFor(element, root) {
  const parts = [];
  for (let current = element; current !== root; current = current.parentElement) {
    const tag = current.localName;
    const siblings = Array.from(current.parentElement.children).filter(sibling => sibling.localName === tag);
    parts.unshift(`${tag}:nth-of-type(${siblings.indexOf(current) + 1})`);
  }
  return parts.join(' > ');
}

export function captureBlocks(root, page) {
  const all = Array.from(root.querySelectorAll(BLOCKS)).filter(element =>
    !element.closest('.slate-history,.slate-xref,script,style')
    && !element.parentElement.closest(ATOMIC));
  const headings = [];
  const records = all.map((element, ordinal) => {
    if (/^h[1-6]$/.test(element.localName)) {
      const level = Number(element.localName[1]);
      while (headings.length && headings.at(-1).level >= level) headings.pop();
      headings.push({ level, text: normalizeText(element.textContent), id: element.id });
    }
    return {
      element, page,
      target: {
        selector: selectorFor(element, root), ordinal, tag: element.localName, elementId: element.id,
        text: normalizeText(element.textContent), html: element.outerHTML,
        headings: structuredClone(headings),
      },
    };
  });
  const duplicates = new Map();
  for (const record of records) {
    const group = duplicates.get(record.target.html) || [];
    group.push(record);
    duplicates.set(record.target.html, group);
  }
  records.forEach((record, index) => {
    const matches = duplicates.get(record.target.html);
    Object.assign(record.target, {
      occurrence: matches.indexOf(record) + 1, matches: matches.length,
      before: records[index - 1]?.target.text.slice(-1000) || '',
      after: records[index + 1]?.target.text.slice(0, 1000) || '',
    });
  });
  return records;
}

// Maps each unenhanced element to its block and its child path inside that block's snapshot.
// Nodes Slate injects later (controls, highlighting, wrappers) have no origin and are not pickable.
export function mapOrigins(records) {
  const origins = new WeakMap();
  for (const record of records) {
    origins.set(record.element, { record, path: '' });
    for (const element of record.element.querySelectorAll('*')) origins.set(element, { record, path: selectorFor(element, record.element) });
  }
  return origins;
}

export function attach({ navigate, reveal, hasPage }) {
  const app = document.querySelector('.app');
  const header = document.querySelector('.header');
  const cacheKey = `slate-revisions-v1:${location.pathname.replace(/index\.html$/, '')}`;
  const endpoint = new URL('__slate/revisions', document.baseURI);
  const revisions = new Map();
  const selection = new Map();
  let records = [];
  let selectedId = null;
  let pending = {};
  let drafts = {};
  let mode = 'unknown';
  let serverHost = null;
  let open = false;
  let selecting = false;
  let busy = false;
  let preparing = false;
  let jump = null;
  let errorText = '';
  let storageError = '';
  let notice = '';
  let removeId = null;
  // The comment being edited in place: { id, text }. Edits never go through the new-comment composer.
  let editing = null;
  let refreshing;
  let externalConflict = false;
  let cacheBlocked = false;
  let menuId = 0;
  let cancelTargetScroll = () => {};

  const toggle = button('', () => setOpen(!open), 'revision-toggle');
  toggle.append(node('span', 'rate_review', 'material-symbols-outlined'));
  toggle.firstChild.setAttribute('aria-hidden', 'true');
  toggle.setAttribute('aria-label', 'Open revisions');
  toggle.title = 'Revision';
  toggle.setAttribute('aria-controls', 'slate-revision-panel');
  toggle.setAttribute('aria-expanded', 'false');
  header.insertBefore(toggle, header.querySelector('.theme-toggle'));

  const panel = node('aside', undefined, 'revision-panel');
  panel.id = 'slate-revision-panel';
  panel.hidden = true;
  panel.setAttribute('aria-labelledby', 'slate-revision-heading');
  panel.innerHTML = `
    <div class="revision-panel-header">
      <h2 id="slate-revision-heading">Revision</h2>
      <div class="revision-header-actions"></div>
    </div>
    <div class="revision-list"></div>
    <div class="revision-panel-scroll">
      <p class="revision-error" role="alert" hidden></p>
      <div class="revision-recovery"></div>
      <div class="revision-editor"></div>
    </div>
    <div class="revision-storage" role="status" aria-live="polite"></div>`;
  const close = iconButton('Close revisions', 'close', () => setOpen(false));
  panel.querySelector('.revision-panel-header').append(close);
  app.append(panel);
  const status = panel.querySelector('.revision-storage');
  const error = panel.querySelector('.revision-error');
  const actions = panel.querySelector('.revision-header-actions');
  const recovery = panel.querySelector('.revision-recovery');
  const list = panel.querySelector('.revision-list');
  const editor = panel.querySelector('.revision-editor');
  const dialog = node('dialog', undefined, 'revision-dialog');
  dialog.setAttribute('aria-labelledby', 'revision-dialog-heading');
  let dialogReturn = null;
  dialog.addEventListener('close', () => {
    hideTooltip();
    if (!open) return;
    const target = dialogReturn?.isConnected && !dialogReturn.disabled ? dialogReturn : panel.querySelector('.revision-options');
    dialogReturn = null;
    target?.focus();
  });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),input,textarea,select,[tabindex="0"]')].filter(item => item.offsetParent);
      const edge = event.shiftKey ? focusable[0] : focusable.at(-1);
      if (focusable.length && document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? focusable.at(-1) : focusable[0]).focus();
      }
      return;
    }
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    dialog.close();
  });
  panel.append(dialog);
  function showDialog(content, className = '') {
    dialogReturn = document.activeElement;
    dialog.className = `revision-dialog ${className}`.trim();
    dialog.replaceChildren(content);
    dialog.showModal();
  }
  // One shared tooltip in the top layer, so scroll regions never clip it.
  const tooltip = node('div', undefined, 'revision-tooltip');
  tooltip.popover = 'manual';
  tooltip.setAttribute('aria-hidden', 'true');
  panel.append(tooltip);
  let tooltipOwner = null;
  let tooltipTimer = 0;
  function hideTooltip() {
    clearTimeout(tooltipTimer);
    tooltipOwner = null;
    if (tooltip.matches(':popover-open')) tooltip.hidePopover();
  }
  function showTooltip(owner, delay) {
    clearTimeout(tooltipTimer);
    tooltipOwner = owner;
    const place = () => {
      if (tooltipOwner !== owner || !owner.isConnected || !owner.dataset.tooltip) return;
      tooltip.textContent = owner.dataset.tooltip;
      try { if (!tooltip.matches(':popover-open')) tooltip.showPopover(); } catch { return; }
      const bounds = owner.getBoundingClientRect();
      const width = tooltip.offsetWidth;
      const height = tooltip.offsetHeight;
      const above = bounds.top - height - 6;
      tooltip.style.left = `${Math.max(8, Math.min(innerWidth - width - 8, bounds.left + (bounds.width - width) / 2))}px`;
      tooltip.style.top = `${above >= 8 ? above : Math.min(innerHeight - height - 8, bounds.bottom + 6)}px`;
    };
    // Deferred even on focus: focus can move during another popover's show, which forbids a nested show.
    tooltipTimer = setTimeout(place, delay);
  }
  for (const surface of [panel, dialog]) {
    surface.addEventListener('pointerover', event => {
      const owner = event.target.closest?.('[data-tooltip]');
      if (owner && owner !== tooltipOwner) showTooltip(owner, 400);
    });
    surface.addEventListener('pointerout', event => {
      const owner = event.target.closest?.('[data-tooltip]');
      if (owner && !owner.contains(event.relatedTarget) && document.activeElement !== owner) hideTooltip();
    });
    surface.addEventListener('focusin', event => {
      const owner = event.target.closest?.('[data-tooltip]');
      if (owner?.matches(':focus-visible')) showTooltip(owner, 0);
      else hideTooltip();
    });
    surface.addEventListener('focusout', hideTooltip);
    surface.addEventListener('click', hideTooltip);
  }
  const importInput = node('input');
  importInput.type = 'file';
  importInput.accept = '.json,application/json';
  importInput.hidden = true;
  panel.append(importInput);
  let origins = new WeakMap();
  const picker = createPicker({
    host: app, before: panel,
    scroller: () => document.querySelector('#content'),
    root: () => document.querySelector('#document .page-body') || document.querySelector('#document'),
    eligible: element => origins.has(element) && element.closest('#document .page-body') !== null,
    blocks: () => records.map(record => record.element),
    label: element => {
      const origin = origins.get(element);
      return `${element.localName}${element.id ? `#${element.id}` : ''} · block ${origin.record.target.ordinal + 1}`;
    },
    announce: element => {
      const origin = origins.get(element);
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      let authored = '';
      for (let text = walker.nextNode(); text && authored.length < 200; text = walker.nextNode()) {
        if (origins.has(text.parentElement)) authored += text.textContent;
      }
      const text = normalizeText(authored || (origin.path ? element.textContent : origin.record.target.text)).slice(0, 80);
      return `${element.localName} in block ${origin.record.target.ordinal + 1} of ${records.length}${text ? `: ${text}` : ''}${selection.has(selectionKey(origin.record, origin.path)) ? ' (selected)' : ''}`;
    },
    onPick: pickElement,
    onStop: reason => {
      setSelecting(false);
      if (reason === 'picked') editor.querySelector('#revision-comment-text')?.focus();
      else if (reason === 'escape') editor.querySelector('.revision-select-action')?.focus();
    },
  });

  function report(problem) {
    errorText = problem instanceof Error ? problem.message : String(problem);
    renderStatus();
  }
  function current() { return revisions.get(selectedId); }
  function hasPending() { return Object.keys(pending).length > 0; }
  function draft() {
    const value = drafts[selectedId] ||= { text: '', editId: null };
    // Drafts saved before in-place editing could hold an edit; drop it rather than load it into the composer.
    if (value.editId) Object.assign(value, { text: '', editId: null });
    return value;
  }
  function persist() {
    if (cacheBlocked) return false;
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ revisions: [...revisions.values()], pending, selectedId, drafts }));
      storageError = '';
      return true;
    } catch (problem) {
      storageError = `Browser recovery could not be saved (${problem.message}). Workspace saves report their own result; if a save fails, keep this tab open and retry.`;
      renderStatus();
      return false;
    }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (saved) {
      if (!Array.isArray(saved.revisions) || !saved.pending || !saved.drafts) throw new Error('Invalid browser revision cache; export or clear this site data deliberately.');
      saved.revisions.forEach(revision => { validateRevision(revision); revisions.set(revision.id, revision); });
      for (const [id, version] of Object.entries(saved.pending)) {
        if (!revisions.has(id) || !Number.isSafeInteger(version) || version < 0) throw new Error('Invalid pending revision cache.');
      }
      pending = saved.pending;
      drafts = saved.drafts;
      selectedId = revisions.get(saved.selectedId)?.status === 'active' ? saved.selectedId : null;
    }
  } catch (problem) {
    cacheBlocked = true;
    storageError = 'Existing browser data was not overwritten. Back it up before deliberately clearing this site data.';
    report(problem);
  }

  function renderStatus() {
    const state = busy || preparing ? 'saving' : hasPending() ? 'pending'
      : mode === 'workspace' ? 'saved' : mode === 'static' ? 'static' : 'unknown';
    const messages = {
      saving: ['sync', 'Saving changes...'],
      pending: ['cloud_off', 'Changes not saved. Retry saving.'],
      saved: ['check_circle', 'All changes saved'],
      static: ['info', 'Read-only. Start the Slate local server to add revisions.'],
      unknown: ['sync', 'Checking revision storage...'],
    };
    status.dataset.state = state;
    status.replaceChildren(icon(notice ? 'check_circle' : messages[state][0]), node('span', notice || messages[state][1]));
    status.title = state === 'saved' ? 'Automatically saved to the parent project at .slate/revisions/.'
      : state === 'static' ? 'Run serve-revisions.mjs for this project. No manual JSON saving is needed.'
      : state === 'pending' ? 'Unsynced edits remain in browser recovery. Retry saving or reload the workspace version.' : '';
    error.textContent = [errorText, storageError].filter(Boolean).join(' ');
    error.hidden = !error.textContent;
  }

  async function request(url, options) {
    const response = await fetch(url, { cache: 'no-store', ...options });
    if (!response.ok) {
      let message = `Revision storage returned HTTP ${response.status}.`;
      if (response.headers.get('content-type')?.includes('application/json')) message = (await response.json()).error || message;
      throw new Error(message);
    }
    return response.json();
  }

  async function refresh() {
    if (busy || preparing || refreshing) return refreshing;
    refreshing = (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (response.status === 404 || response.status === 405 || response.status === 501) {
          mode = 'static';
          setSelecting(false);
          render();
          return;
        }
        if (!response.ok) throw new Error(`Cannot load workspace revisions: HTTP ${response.status}.`);
        const data = await response.json();
        if (data.kind !== 'slate-revision-store' || !Array.isArray(data.revisions)) throw new Error('This address is not a Slate revision store.');
        if (!safeHostPath(data.host) || data.storagePath !== '.slate/revisions') throw new Error('The revision server did not declare the fixed parent-project store.');
        for (const revision of data.revisions) await verifyRevision(revision);
        mode = 'workspace';
        serverHost = data.host;
        if (!hasPending()) {
          const previous = current();
          revisions.clear();
          data.revisions.forEach(revision => revisions.set(revision.id, revision));
          if (!revisions.has(selectedId) || (previous?.status === 'active' && current()?.status === 'archived')) {
            selectedId = data.revisions.find(revision => revision.status === 'active')?.id || null;
            selection.clear();
            setSelecting(false);
          }
          errorText = '';
          persist();
        }
      } catch (problem) { report(problem); }
      finally { refreshing = null; render(); }
    })();
    return refreshing;
  }

  async function sendPending() {
    for (const [id, version] of Object.entries(pending)) {
      const revision = revisions.get(id);
      await request(new URL(`${endpoint.pathname}/${id}`, endpoint), {
        method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': String(version) },
        body: JSON.stringify(revision),
      });
      delete pending[id];
      persist();
    }
  }

  async function commit(revision, expectedVersion) {
    if (busy || hasPending()) throw new Error('Resolve unsynced workspace edits before making further changes.');
    if (externalConflict || cacheBlocked) throw new Error('Reload this page after preserving local data before editing.');
    if (mode !== 'workspace') throw new Error('Start the Slate local server to save revisions automatically in the parent project.');
    if (revision.host !== serverHost) throw new Error('This revision belongs to a different documentation host.');
    busy = true;
    try {
      await verifyRevision(revision);
      revisions.set(revision.id, revision);
      selectedId = revision.status === 'archived'
        ? [...revisions.values()].find(item => item.status === 'active')?.id || null : revision.id;
      errorText = '';
      notice = '';
      if (mode === 'workspace') pending[revision.id] = expectedVersion;
      persist();
      render();
      if (mode === 'workspace') await sendPending();
    } catch (problem) { report(problem); }
    finally { busy = false; persist(); render(); }
  }

  function run(action) {
    return async (...args) => {
      try { await action(...args); }
      catch (problem) { report(problem); }
    };
  }

  function setOpen(value) {
    const mobile = matchMedia('(max-width: 768px)').matches;
    const content = document.querySelector('#content');
    const scrollTop = value ? window.scrollY : content.scrollTop;
    open = value;
    panel.hidden = !value;
    app.classList.toggle('revision-open', value);
    if (mobile) {
      window.scrollTo({ top: value ? 0 : scrollTop, behavior: 'instant' });
      content.scrollTop = value ? scrollTop : 0;
    }
    toggle.setAttribute('aria-expanded', String(value));
    toggle.setAttribute('aria-label', value ? 'Close revisions' : 'Open revisions');
    if (!value) {
      cancelTargetScroll();
      panel.querySelectorAll('.revision-menu-popover:popover-open').forEach(menu => menu.hidePopover());
      if (dialog.open) dialog.close();
      setSelecting(false);
      document.querySelectorAll('.revision-target-focus').forEach(element => element.classList.remove('revision-target-focus'));
      toggle.focus();
    } else {
      render();
      refresh();
      close.focus();
    }
  }

  function setSelecting(value, { focus = true } = {}) {
    selecting = value && open && mode === 'workspace' && current()?.status === 'active' && !busy && !preparing && !hasPending() && !externalConflict && !cacheBlocked;
    if (selecting && !picker.picking) {
      picker.start({ focus }).catch(problem => {
        selecting = false;
        report(`The element picker could not load (${problem.message}). Check that the complete Slate runtime, including shell/vendor, is synchronized.`);
        renderSelection();
      });
    } else if (!selecting && picker.picking) picker.stop();
    renderSelection();
  }
  function selectionKey(record, path) { return `${record.page.path}:${record.target.selector}:${record.target.html}:${path}`; }
  function renderSelection() {
    picker.setSelected(open ? [...selection.values()].map(item => item.node).filter(Boolean) : []);
    const count = editor.querySelector('.revision-selection-count');
    if (count) {
      const pages = new Set([...selection.values()].map(item => item.page.path)).size;
      count.textContent = selection.size ? `${selection.size} element${selection.size === 1 ? '' : 's'} selected${pages > 1 ? ` across ${pages} pages` : ''}` : 'No elements selected';
    }
    const select = editor.querySelector('.revision-select-action');
    if (select) select.setAttribute('aria-pressed', String(selecting));
    const clear = editor.querySelector('.revision-clear-selection');
    if (clear) clear.hidden = !selection.size;
    const help = editor.querySelector('.revision-help');
    if (help) help.hidden = !selecting;
    const submit = editor.querySelector('.revision-add-comment');
    if (submit) submit.disabled = busy || preparing || hasPending() || mode !== 'workspace' || externalConflict || cacheBlocked
      || !editor.querySelector('#revision-comment-text').value.trim() || !selection.size;
  }

  // Adds or removes one picked element; resolves to the message the picker announces.
  async function pickElement(element, add) {
    if (!selecting || busy || preparing || hasPending() || externalConflict) throw new Error('selection is unavailable while revisions are saving');
    const origin = origins.get(element);
    if (!origin) throw new Error('it is not part of the authored page');
    const { record, path } = origin;
    const key = selectionKey(record, path);
    if (selection.has(key)) {
      selection.delete(key);
      renderSelection();
      return `${element.localName} removed. ${selection.size} selected.`;
    }
    if (selection.size >= 100) {
      report('A comment supports up to 100 elements. Add the current comment before selecting more.');
      throw new Error('a comment supports up to 100 elements');
    }
    const detail = await describeElement(element, { root: document.querySelector('#document .page-body'), blockHtml: record.target.html, path });
    selection.set(key, { page: record.page, target: record.target, element: detail, node: element });
    errorText = '';
    renderStatus();
    renderSelection();
    return `${element.localName} in block ${record.target.ordinal + 1} ${add ? 'added' : 'selected'}. ${selection.size} selected.`;
  }

  function targetLabel(source, target) {
    const element = target.element?.path ? ` / ${target.element.tag}${target.element.name ? ` "${target.element.name.slice(0, 40)}"` : ''}` : '';
    return `${source.title} / block ${target.ordinal + 1}${element}`;
  }

  function targetButton(revision, target, index) {
    const source = revision.sources.find(item => item.id === target.sourceId);
    const link = actionButton(targetLabel(source, target), 'arrow_outward', run(async () => {
      if (!hasPage(source.route)) throw new Error('This target page is no longer registered. Compare the saved source before retargeting.');
      const response = await fetch(new URL(source.path, document.baseURI), { cache: 'no-store' });
      if (!response.ok || await response.text() !== source.content) {
        throw new Error('This target is stale or missing. Compare its saved source and block snapshots before retargeting; Slate will not guess.');
      }
      jump = { source, target };
      navigate(source.route);
    }), 'revision-target-link');
    link.setAttribute('aria-label', `View target ${index + 1}: ${targetLabel(source, target)}`);
    link.dataset.tooltip = `Go to: ${(target.element?.path ? target.element.text : target.text).slice(0, 160) || `[${target.element?.tag || target.tag}]`}`;
    return link;
  }

  function focusTarget(element) {
    cancelTargetScroll();
    reveal(element);
    element.setAttribute('tabindex', '-1');
    element.classList.add('revision-target-focus');
    // Unsized lazy images above the target can change its position after the first scroll.
    const images = new Set([...document.querySelectorAll('.page-body img')].filter(image =>
      !image.complete && !image.closest('details:not([open]),.doc-section.collapsed')
      && (element.contains(image) || (image.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))));
    const content = document.querySelector('#content');
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 200;
    let frame;
    let startedAt = null;
    let startTop;
    const interactions = ['wheel', 'touchstart', 'pointerdown', 'keydown'];
    function stop() {
      cancelAnimationFrame(frame);
      images.forEach(image => {
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', loaded);
      });
      interactions.forEach(type => document.removeEventListener(type, stop, true));
      cancelTargetScroll = () => {};
    }
    function position(timestamp) {
      frame = null;
      if (!element.isConnected) { stop(); return; }
      if (startedAt === null) {
        startedAt = timestamp;
        startTop = content.scrollTop;
      }
      const bounds = element.getBoundingClientRect();
      const viewport = content.getBoundingClientRect();
      const destination = Math.max(0, Math.min(content.scrollHeight - content.clientHeight,
        content.scrollTop + bounds.top - viewport.top - (content.clientHeight - bounds.height) / 2));
      const progress = duration ? Math.min((timestamp - startedAt) / duration, 1) : 1;
      const eased = 1 - (1 - progress) ** 3;
      content.scrollTo({ top: startTop + (destination - startTop) * eased, behavior: 'instant' });
      if (progress < 1) frame = requestAnimationFrame(position);
      else {
        startedAt = null;
        element.focus({ preventScroll: true });
        if (!images.size) stop();
      }
    }
    function loaded(event) {
      const image = event.currentTarget;
      image.removeEventListener('load', loaded);
      image.removeEventListener('error', loaded);
      images.delete(image);
      if (!frame) frame = requestAnimationFrame(position);
    }
    images.forEach(image => {
      image.addEventListener('load', loaded);
      image.addEventListener('error', loaded);
    });
    interactions.forEach(type => document.addEventListener(type, stop, { capture: true, passive: true }));
    cancelTargetScroll = stop;
    frame = requestAnimationFrame(position);
  }

  function actionMenu(label, groups, className = '') {
    const container = node('div', undefined, 'revision-menu');
    const trigger = iconButton(label, 'more_horiz', undefined, className);
    const menu = node('div', undefined, 'revision-menu-popover');
    menu.id = `revision-menu-${++menuId}`;
    menu.popover = 'auto';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', label);
    trigger.popoverTargetElement = menu;
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-controls', menu.id);
    trigger.setAttribute('aria-expanded', 'false');
    groups.filter(group => group.length).forEach((group, index) => {
      if (index) {
        const separator = node('hr');
        separator.setAttribute('role', 'separator');
        menu.append(separator);
      }
      group.forEach(item => {
        const entry = actionButton(item.label, item.icon, run(async event => {
          menu.hidePopover();
          trigger.focus();
          await item.action(event);
        }), `revision-menu-item${item.danger ? ' revision-danger' : ''}`);
        entry.setAttribute('role', 'menuitem');
        entry.disabled = Boolean(item.disabled);
        menu.append(entry);
      });
    });
    menu.addEventListener('toggle', event => {
      const expanded = event.newState === 'open';
      trigger.setAttribute('aria-expanded', String(expanded));
      if (!expanded) return;
      const bounds = trigger.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(innerWidth - menu.offsetWidth - 8, bounds.right - menu.offsetWidth))}px`;
      menu.style.top = `${Math.max(8, Math.min(bounds.bottom + 4, innerHeight - menu.offsetHeight - 8))}px`;
      menu.querySelector('button:not(:disabled)')?.focus();
    });
    menu.addEventListener('keydown', event => {
      const entries = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = entries.indexOf(document.activeElement);
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? entries.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + entries.length) % entries.length;
        entries[next]?.focus();
      } else if (event.key === 'Escape' || event.key === 'Tab') {
        event.stopPropagation();
        if (event.key === 'Escape') event.preventDefault();
        menu.hidePopover();
        trigger.focus();
      }
    });
    container.append(trigger, menu);
    return container;
  }

  async function startRevision() {
    selection.clear();
    await commit(createRevision(new Date(), serverHost), 0);
    setSelecting(true, { focus: false });
    editor.querySelector('#revision-comment-text')?.focus();
  }

  function revisionDialog(kind, revision) {
    if (kind === 'archive' && (draft().text.trim() || selection.size)) {
      throw new Error('Save or clear the current comment and block selection before archiving.');
    }
    const renaming = kind === 'rename';
    const form = node('form');
    const heading = node('h2', renaming ? 'Rename revision' : 'Archive revision');
    heading.id = 'revision-dialog-heading';
    const help = node('p', renaming ? 'Give this round of feedback a recognizable name.'
      : 'Record what changed. Archived feedback stays available and can be reopened.');
    const label = node('label', renaming ? 'Revision name' : 'Completion summary');
    const input = node(renaming ? 'input' : 'textarea');
    input.id = renaming ? 'revision-name' : 'revision-completion-summary';
    input.maxLength = renaming ? 200 : 20000;
    input.required = true;
    input.value = renaming ? revision.name : '';
    if (!renaming) input.rows = 4;
    label.htmlFor = input.id;
    const footer = node('div', undefined, 'revision-dialog-actions');
    const cancel = button('Cancel', () => dialog.close());
    const submit = actionButton(renaming ? 'Save name' : 'Archive revision', renaming ? 'check' : 'archive', undefined, 'revision-primary');
    submit.type = 'submit';
    footer.append(cancel, submit);
    form.append(heading, help, label, input, footer);
    form.addEventListener('submit', run(async event => {
      event.preventDefault();
      if (!input.value.trim()) {
        input.setCustomValidity('Enter a value before continuing.');
        input.reportValidity();
        return;
      }
      const next = renaming ? revise(revision, item => { item.name = input.value.trim(); }) : archiveRevision(revision, input.value);
      dialog.close();
      await commit(next, revision.version);
      if (!renaming) setSelecting(false);
      panel.querySelector('.revision-options')?.focus();
    }));
    input.addEventListener('input', () => input.setCustomValidity(''));
    showDialog(form);
    input.focus();
    if (renaming) input.select();
  }

  // The exact text Copy prompt copies: the handoff instruction, then the grounded revision with
  // each source checked against the served file, as `revisions.mjs show --format prompt` does.
  async function promptText(revision) {
    const checks = new Map();
    await Promise.all(revision.sources.map(async source => {
      try {
        const response = await fetch(new URL(source.path, document.baseURI), { cache: 'no-store' });
        checks.set(source.path, { path: source.path, status: !response.ok ? 'missing'
          : await sha256(await response.text()) === source.sha256 ? 'current' : 'stale' });
      } catch { /* An unreachable source is reported without a status rather than guessed. */ }
    }));
    return `${HANDOFF(revision)}\n\n${formatRevisionPrompt(revision, checks)}`;
  }

  let noticeTimer = 0;
  function announce(text) {
    notice = text;
    renderStatus();
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => { notice = ''; renderStatus(); }, 4000);
  }

  async function copyPrompt(revision, trigger) {
    await navigator.clipboard.writeText(await promptText(revision));
    announce('Prompt copied');
    const glyph = trigger?.querySelector('.material-symbols-outlined');
    if (glyph) {
      glyph.textContent = 'check';
      setTimeout(() => { glyph.textContent = 'content_copy'; }, 2000);
    }
  }

  async function previewPrompt(revision) {
    const text = await promptText(revision);
    const content = node('div', undefined, 'revision-prompt');
    const head = node('div', undefined, 'revision-dialog-header');
    const heading = node('h2', 'Prompt preview');
    heading.id = 'revision-dialog-heading';
    head.append(heading, iconButton('Close preview', 'close', () => dialog.close()));
    const body = node('pre', text, 'revision-prompt-text');
    body.tabIndex = 0;
    body.setAttribute('aria-label', 'Prompt text');
    const footer = node('div', undefined, 'revision-dialog-actions');
    const lines = text.split('\n').length;
    footer.append(node('p', `${lines.toLocaleString()} lines, ${text.length.toLocaleString()} characters`, 'revision-prompt-size'));
    const copy = actionButton('Copy prompt', 'content_copy', undefined, 'revision-primary');
    copy.addEventListener('click', run(() => copyPrompt(revision, copy)));
    footer.append(copy);
    content.append(head, node('p', 'Copy prompt copies exactly this text: the agent instruction, then every comment with its targets, element snapshots and source checks.', 'revision-dialog-help'), body, footer);
    showDialog(content, 'revision-dialog--wide');
    copy.focus();
  }

  function commentDetails(revision, comment, index) {
    const content = node('div', undefined, 'revision-prompt');
    const head = node('div', undefined, 'revision-dialog-header');
    const heading = node('h2', `Comment ${index + 1}`);
    heading.id = 'revision-dialog-heading';
    const close = iconButton('Close details', 'close', () => dialog.close());
    head.append(heading, close);
    const body = node('div', undefined, 'revision-details');
    body.append(node('p', comment.text, 'revision-details-text'));
    comment.targets.forEach(target => {
      const source = revision.sources.find(item => item.id === target.sourceId);
      const element = target.element?.path ? target.element : null;
      const item = node('section', undefined, 'revision-context-item');
      item.append(node('h3', `${targetLabel(source, target)} · ${source.path}`, 'revision-quote-label'));
      const trail = /^h[1-6]$/.test(target.tag) ? target.headings.slice(0, -1) : target.headings;
      if (trail.length) item.append(node('p', `Under ${trail.map(heading => heading.text).join(' › ')}`, 'revision-context-meta'));
      if (element?.selector) item.append(node('p', element.selector, 'revision-context-meta revision-context-selector'));
      const snapshot = node('pre', element?.html || target.html, 'revision-snapshot');
      snapshot.tabIndex = 0;
      snapshot.setAttribute('aria-label', `${element ? 'Element' : 'Block'} snapshot`);
      item.append(snapshot);
      body.append(item);
    });
    content.append(head, body);
    showDialog(content, 'revision-dialog--wide');
    close.focus();
  }

  function render() {
    renderStatus();
    if (!open) return;
    if (tooltipOwner) hideTooltip();
    const disabled = busy || preparing || hasPending() || mode !== 'workspace' || externalConflict || cacheBlocked;
    const revision = current();
    const create = iconButton('New revision', 'add', run(startRevision));
    create.disabled = disabled;
    create.hidden = !revision;
    const management = revision?.status === 'active' ? [
      { label: 'Rename revision', icon: 'edit', action: () => revisionDialog('rename', revision), disabled },
      { label: 'Archive revision', icon: 'archive', action: () => revisionDialog('archive', revision), disabled },
    ] : [];
    const sharing = revision ? [
      { label: 'Export JSON', icon: 'download', action: async () => {
        await verifyRevision(revision);
        const url = URL.createObjectURL(new Blob([`${JSON.stringify(revision, null, 2)}\n`], { type: 'application/json' }));
        const link = node('a');
        link.href = url;
        link.download = `${revision.id}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } },
    ] : [];
    const tools = [
      { label: 'Refresh', icon: 'refresh', action: refresh, disabled: busy || preparing },
      { label: 'Import JSON', icon: 'upload_file', action: () => importInput.click(), disabled },
    ];
    actions.replaceChildren(create, actionMenu('Revision actions', [management, sharing, tools], 'revision-options'));
    recovery.replaceChildren();
    if (hasPending()) {
      recovery.append(actionButton('Retry save', 'sync', run(async () => {
        if (mode !== 'workspace') throw new Error('Reconnect to the workspace revision server before retrying.');
        busy = true;
        render();
        try { await sendPending(); errorText = ''; }
        finally { busy = false; render(); }
      }), 'revision-primary'));
      recovery.append(button('Reload workspace', () => {
        if (!confirm('Discard unsynced revision edits and reload workspace files? Export JSON first if you need to keep them.')) return;
        pending = {};
        revisions.clear();
        selectedId = null;
        persist();
        refresh();
      }));
    }
    list.replaceChildren();
    const ordered = [...revisions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    function revisionChoice(revision, parent) {
      const choice = button(`${revision.name} (${revision.comments.length})`, () => {
        selectedId = revision.id;
        selection.clear();
        setSelecting(false);
        removeId = null;
        editing = null;
        persist();
        render();
      }, 'revision-choice');
      choice.setAttribute('aria-pressed', String(revision.id === selectedId));
      choice.disabled = disabled;
      parent.append(choice);
    }
    const active = ordered.filter(item => item.status === 'active');
    if (active.length || revision) {
      const row = node('div', undefined, 'revision-context-row');
      const pickerLabel = node('label', 'Current revision', 'sr-only');
      pickerLabel.htmlFor = 'revision-picker';
      const picker = node('select');
      picker.id = 'revision-picker';
      picker.disabled = disabled;
      if (!revision || revision.status === 'archived') {
        const placeholder = node('option', revision ? `${revision.name} (archived)` : 'Choose a revision');
        placeholder.value = revision?.id || '';
        picker.append(placeholder);
      }
      active.forEach(item => {
        const option = node('option', item.name);
        option.value = item.id;
        picker.append(option);
      });
      picker.value = selectedId || '';
      picker.title = revision?.name || '';
      picker.addEventListener('change', () => {
        selectedId = picker.value;
        selection.clear();
        setSelecting(false);
        removeId = null;
        editing = null;
        persist();
        render();
      });
      row.append(pickerLabel, picker);
      if (revision) {
        const copy = actionButton('Copy prompt', 'content_copy', undefined, 'revision-primary revision-copy-prompt');
        copy.addEventListener('click', run(() => copyPrompt(revision, copy)));
        row.append(copy, iconButton('Preview prompt', 'visibility', run(() => previewPrompt(revision)), 'revision-preview-prompt'));
      }
      list.append(row);
    }
    const archived = ordered.filter(item => item.status === 'archived');
    if (archived.length) {
      const group = node('details', undefined, 'revision-archived');
      group.open = current()?.status === 'archived';
      group.append(node('summary', `Archived (${archived.length})`));
      archived.forEach(item => revisionChoice(item, group));
      list.append(group);
    }
    editor.replaceChildren();
    if (!revision) {
      setSelecting(false);
      const empty = node('div', undefined, 'revision-empty');
      empty.append(icon('rate_review'), node('h3', 'A place for your next changes'),
        node('p', 'Select passages as you read and collect feedback across pages in one revision.'));
      const start = actionButton('New revision', 'add', run(startRevision), 'revision-primary');
      start.disabled = disabled;
      empty.append(start);
      editor.append(empty);
      return;
    }
    const meta = node('span', revision.status === 'archived' ? 'Archived' : 'Active', 'revision-meta');
    meta.title = `Version ${revision.version}`;
    if (revision.status === 'archived') {
      const archive = node('div', undefined, 'revision-archive-summary');
      const reopen = actionButton('Reopen revision', 'undo', run(async () => {
        await commit(reopenRevision(revision), revision.version);
      }));
      reopen.disabled = disabled;
      archive.append(node('p', revision.resolution, 'revision-resolution'), reopen);
      editor.append(archive);
    }
    const comments = node('div', undefined, 'revision-comments');
    const commentsHead = node('div', undefined, 'revision-comments-header');
    commentsHead.append(node('h3', `Comments (${revision.comments.length})`), meta);
    comments.append(commentsHead);
    revision.comments.forEach((comment, index) => {
      const card = node('section', undefined, 'revision-comment');
      card.setAttribute('aria-labelledby', `revision-comment-${comment.id}`);
      const head = node('div', undefined, 'revision-comment-header');
      const title = node('h4', `Comment ${index + 1}`);
      title.id = `revision-comment-${comment.id}`;
      head.append(title);
      if (comment.status === 'addressed') head.append(node('span', 'Addressed', 'revision-comment-status'));
      // Actions sit in one group that appears on hover or keyboard focus, so a resting comment is only its words and targets.
      const tools = node('div', undefined, 'revision-comment-actions');
      tools.append(iconButton(`View details for comment ${index + 1}`, 'info', () => commentDetails(revision, comment, index), 'revision-view-details'));
      head.append(tools);
      const isEditing = revision.status === 'active' && editing?.id === comment.id;
      card.classList.toggle('revision-comment--editing', isEditing);
      card.append(head);
      if (isEditing) {
        const form = node('form', undefined, 'revision-inline-edit');
        const label = node('label', `Edit comment ${index + 1}`, 'sr-only');
        const field = node('textarea');
        field.id = `revision-edit-${comment.id}`;
        label.htmlFor = field.id;
        field.value = editing.text;
        field.rows = Math.min(8, Math.max(2, editing.text.split('\n').length));
        field.maxLength = 20000;
        field.required = true;
        field.disabled = disabled;
        const save = button('Save', undefined, 'revision-primary revision-save-edit');
        save.type = 'submit';
        const sync = () => { save.disabled = disabled || !field.value.trim() || field.value.trim() === comment.text; };
        field.addEventListener('input', () => { editing.text = field.value; sync(); });
        const cancelEdit = () => { editing = null; render(); panel.querySelector(`#revision-comment-${comment.id}`)?.closest('.revision-comment')?.querySelector('.revision-edit-comment')?.focus(); };
        field.addEventListener('keydown', event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancelEdit(); }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !save.disabled) { event.preventDefault(); form.requestSubmit(); }
        });
        const cancel = button('Cancel', cancelEdit, 'revision-cancel-edit');
        const row = node('div', undefined, 'revision-inline-edit-actions');
        row.append(cancel, save);
        form.append(label, field, row);
        form.addEventListener('submit', run(async event => {
          event.preventDefault();
          const text = field.value.trim();
          if (!text) throw new Error('Enter a comment before saving.');
          const now = new Date();
          const next = revise(revision, value => {
            const target = value.comments.find(item => item.id === comment.id);
            if (!target) throw new Error('This comment no longer exists. Reload the revision.');
            target.text = text;
            target.status = 'open';
            target.updatedAt = now.toISOString();
          }, now);
          await verifyRevision(next);
          editing = null;
          await commit(next, revision.version);
          announce('Comment saved');
        }));
        card.append(form);
        sync();
        requestAnimationFrame(() => { if (field.isConnected && document.activeElement !== field) { field.focus(); field.setSelectionRange(field.value.length, field.value.length); } });
      } else card.append(node('p', comment.text, 'revision-comment-text'));
      const targets = node('div', undefined, 'revision-targets');
      comment.targets.forEach((target, targetIndex) => targets.append(targetButton(revision, target, targetIndex)));
      card.append(targets);
      if (revision.status === 'active') {
        const edit = iconButton(`Edit comment ${index + 1}`, 'edit', () => {
          editing = { id: comment.id, text: comment.text };
          removeId = null;
          render();
        }, 'revision-edit-comment');
        edit.disabled = disabled || isEditing;
        const removal = iconButton(`Remove comment ${index + 1}`, 'delete', () => {
          removeId = comment.id;
          render();
          editor.querySelector('.revision-confirm-removal')?.focus();
        });
        removal.disabled = disabled;
        tools.append(edit, removal);
        if (removeId === comment.id) {
          const confirmation = node('div', undefined, 'revision-remove-confirmation');
          const remove = button('Remove', run(async () => {
            await commit(revise(revision, next => {
              next.comments = next.comments.filter(item => item.id !== comment.id);
              const referenced = new Set(next.comments.flatMap(item => item.targets.map(target => target.sourceId)));
              next.sources = next.sources.filter(source => referenced.has(source.id));
            }), revision.version);
            removeId = null;
          }), 'revision-confirm-removal revision-danger');
          remove.disabled = disabled;
          confirmation.append(node('p', 'Remove this comment?'), remove,
            button('Cancel', () => { removeId = null; render(); }));
          card.append(confirmation);
        }
      }
      comments.append(card);
    });
    if (revision.status === 'archived') {
      editor.append(comments);
      setSelecting(false);
      return;
    }
    const composer = node('section', undefined, 'revision-composer');
    composer.setAttribute('aria-label', 'Add feedback');
    const select = iconButton('Select elements', 'arrow_selector_tool', () => setSelecting(!selecting), 'revision-select-action');
    select.disabled = disabled;
    const clear = iconButton('Clear selection', 'close', () => { selection.clear(); renderSelection(); }, 'revision-clear-selection');
    clear.disabled = disabled;
    const count = node('p', '', 'revision-selection-count');
    count.setAttribute('aria-live', 'polite');
    const form = node('form');
    const label = node('label', 'Comment on selected elements', 'sr-only');
    const textarea = node('textarea');
    textarea.id = 'revision-comment-text';
    textarea.value = draft().text;
    textarea.rows = 2;
    textarea.placeholder = "Describe the change you'd like...";
    textarea.maxLength = 20000;
    textarea.required = true;
    textarea.disabled = disabled;
    label.htmlFor = textarea.id;
    textarea.addEventListener('input', () => { draft().text = textarea.value; persist(); renderSelection(); });
    const submit = iconButton('Add comment', 'send', undefined, 'revision-add-comment');
    submit.type = 'submit';
    textarea.addEventListener('keydown', event => {
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !submit.disabled) {
        event.preventDefault();
        form.requestSubmit();
      }
    });
    const formActions = node('div', undefined, 'revision-composer-actions');
    formActions.append(select, count, clear);
    formActions.append(submit);
    form.append(label, textarea, formActions);
    form.append(node('p', 'Point at any element, or use the arrow keys. Click or Enter selects; Shift adds more. Esc stops.', 'revision-help'));
    form.addEventListener('submit', run(async event => {
      event.preventDefault();
      if (preparing || busy || hasPending()) throw new Error('Wait for the current revision save to finish.');
      const text = textarea.value.trim();
      if (!text) throw new Error('Enter a comment before saving.');
      const owner = selectedId;
      const selected = [...selection.values()];
      const now = new Date().toISOString();
      const next = revise(revision, () => {});
      preparing = true;
      render();
      try {
        if (!selected.length) throw new Error('Select at least one element.');
        const targets = [];
        for (const { page, target, element } of selected) {
          const hash = await sha256(page.content);
          let source = next.sources.find(item => item.path === page.path && item.sha256 === hash);
          if (!source) {
            source = { id: newId('source'), ...page, sha256: hash };
            next.sources.push(source);
          }
          targets.push({ sourceId: source.id, ...target, sha256: await sha256(target.html), ...(element ? { element } : {}) });
        }
        if (targets.some(target => target.element)) next.schemaVersion = SCHEMA_VERSION;
        next.comments.push({ id: newId('comment'), text, status: 'open', createdAt: now, updatedAt: now, targets });
        await verifyRevision(next);
        drafts[owner] = { text: '', editId: null };
        selection.clear();
        await commit(next, revision.version);
      } finally {
        preparing = false;
        render();
      }
    }));
    composer.append(form);
    editor.append(composer, comments);
    if (!revision.comments.length) comments.append(node('p', 'No feedback yet. Your comments will appear here, with links to the selected passages.', 'revision-comments-empty'));
    renderSelection();
  }

  importInput.addEventListener('change', run(async () => {
    const file = importInput.files[0];
    importInput.value = '';
    if (!file) return;
    if (file.size > MAX_REVISION_BYTES) throw new Error('Revision file exceeds 8 MiB.');
    const revision = await verifyRevision(JSON.parse(await file.text()));
    if (revisions.has(revision.id)) throw new Error('A revision with this ID already exists. Import cannot overwrite it.');
    await commit(revision, 0);
  }));
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !open) return;
    hideTooltip();
    if (dialog.open) return;
    const menu = panel.querySelector('.revision-menu-popover:popover-open');
    if (menu) {
      event.preventDefault();
      menu.hidePopover();
      panel.querySelector(`[aria-controls="${menu.id}"]`)?.focus();
      return;
    }
    if (selecting) setSelecting(false);
    else setOpen(false);
  });
  window.addEventListener('focus', () => { if (open && !hasPending() && !dialog.open) refresh(); });
  window.addEventListener('storage', event => {
    if (event.key === cacheKey) {
      externalConflict = true;
      setSelecting(false);
      report('Revisions changed in another tab. Export any local edits and reload before editing.');
      render();
    }
  });

  // Re-links selected elements to this page's freshly rendered nodes so their outlines return.
  function relinkSelection() {
    for (const item of selection.values()) {
      const record = records.find(entry => entry.page.path === item.page.path && entry.page.content === item.page.content
        && entry.target.selector === item.target.selector && entry.target.html === item.target.html);
      if (!record) continue;
      const path = item.element?.path || '';
      item.node = !path ? record.element : [...record.element.querySelectorAll('*')]
        .find(element => origins.get(element)?.record === record && origins.get(element).path === path) || null;
    }
  }

  return {
    replaceElement(previous, replacement) {
      const record = records.find(item => item.element === previous);
      if (record) {
        record.element = replacement;
        origins.set(replacement, { record, path: '' });
      }
    },
    capture(root, page) {
      cancelTargetScroll();
      if (!safeContentPath(page.path) || !safeContentPath(page.route)) {
        records = [];
        origins = new WeakMap();
        report('This content root is not a local host-relative path. Revision selection is unavailable for this page.');
        return;
      }
      records = captureBlocks(root, page);
      origins = mapOrigins(records);
    },
    mount() {
      relinkSelection();
      renderSelection();
      if (jump) {
        const { source, target } = jump;
        jump = null;
        const match = records.find(record => record.page.route === source.route
          && record.page.path === source.path && record.page.content === source.content
          && record.target.selector === target.selector && record.target.html === target.html);
        if (!match) report('This target is stale or missing. Compare its saved source and block snapshots before retargeting; Slate will not guess.');
        else focusTarget(match.element);
      }
    },
  };
}
