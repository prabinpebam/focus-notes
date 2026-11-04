import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { ToolbarRow } from "../../layouts/ToolbarRow/ToolbarRow.tsx";
import { MorphPanel } from "../MorphPanel/MorphPanel.tsx";
import { IconButton } from "../IconButton/IconButton.tsx";
import { MenuButton } from "../MenuButton/MenuButton.tsx";
import { Divider } from "../Divider/Divider.tsx";
import { Icon } from "../Icon/Icon.tsx";
import { LiveRegion } from "../LiveRegion/LiveRegion.tsx";
import type { CommandItem, MenuSection } from "../../data.ts";
import { ICON_NAMES, type IconName } from "../../icon-names.ts";
import * as s from "./ToolbarComposer.css.ts";

export interface ToolbarComposerProps {
  /** The toolbar's own name, as on the real one. */
  label: string;
  moreLabel: string;
  /** The buttons on the toolbar now, in order. */
  items: CommandItem[];
  /** Every action that can be on the toolbar, by category; those already on it aren't listed. */
  groups: MenuSection[];
  max?: number;
  catalogueLabel: string;
  /** "{count} of {max} on the toolbar". */
  countLabel: string;
  /** How to do it without a pointer, read when the toolbar or the list is reached. */
  instructions: string;
  /** Announcements; {name}, {other}, {position} and {count} are filled in. */
  pickedLabel: string;
  placeLabel: string;
  overLabel: string;
  fullLabel: string;
  addedLabel: string;
  movedLabel: string;
  replacedLabel: string;
  removedLabel: string;
  cancelledLabel: string;
  onChange?: (payload: { ids: string }) => void;
}

type Source = { from: "toolbar" | "catalogue"; id: string };
type Target = { kind: "gap"; index: number } | { kind: "slot"; index: number; gap: number } | { kind: "remove" };
type Leaving = { key: number; id: string; index: number; kind: "remove" | "replace"; under?: string };

const prop = (ref: string) => ref.slice(4, -1);
const iconOf = (name: string | undefined): IconName => ((ICON_NAMES as readonly string[]).includes(name ?? "") ? name as IconName : "info");
const fill = (text: string, values: Record<string, string | number>) => text.replace(/\{(\w+)\}/g, (m, k: string) => (k in values ? String(values[k]) : m));
const DRAG_START = 4;
const sameTarget = (a: Target | null, b: Target | null) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The visual toolbar customizer (IA-CMP-TOOLBAR, DD-IA-08): the real toolbar, open as it is over a
 * note, above every action that can join it, grouped. Drag a button onto the toolbar (a marker shows
 * where it lands), hold it over one for motion.hold to replace that one, drag one off to remove it.
 * Full, the marker turns red. Keys: Space or Enter picks a button up, the arrows choose a place,
 * Enter drops, Esc cancels, Delete removes. The buttons themselves do nothing here.
 */
export function ToolbarComposer(props: ToolbarComposerProps) {
  const { label, moreLabel, items, groups, max = 6, catalogueLabel, countLabel, instructions, onChange } = props;
  const uid = useId();
  const byId = useMemo(() => {
    const m = new Map<string, CommandItem>();
    for (const g of groups) for (const it of g.items) m.set(it.id, it);
    for (const it of items) m.set(it.id, it);
    return m;
  }, [items, groups]);
  const [order, setOrder] = useState(() => items.map((i) => i.id));
  const [source, setSource] = useState<Source | null>(null);
  const [mode, setMode] = useState<"pointer" | "keys">("pointer");
  const [target, setTarget] = useState<Target | null>(null);
  const [lifted, setLifted] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<Leaving[]>([]);
  const [entering, setEntering] = useState<{ id: string; kind: "insert" | "replace" } | null>(null);
  const [say, setSay] = useState({ text: "", key: 0 });
  const [focusId, setFocusId] = useState<string | null>(null);
  const itemIds = items.map(i => i.id).join(",");
  useEffect(() => { setOrder(itemIds ? itemIds.split(",") : []); }, [itemIds]);

  const root = useRef<HTMLDivElement | null>(null);
  const stage = useRef<HTMLDivElement | null>(null);
  const catalogue = useRef<HTMLDivElement | null>(null);
  const ghost = useRef<HTMLSpanElement | null>(null);
  const pending = useRef<{ source: Source; x: number; y: number; id: number } | null>(null);
  const live = useRef({ source, target, lifted, order });
  live.current = { source, target, lifted, order };
  const leaveKey = useRef(0);

  const full = order.length >= max;
  const nameOf = (id: string) => byId.get(id)?.label ?? id;
  const announce = (text: string) => setSay((p) => ({ text, key: p.key + 1 }));
  const originIndex = source?.from === "toolbar" ? order.indexOf(source.id) : -1;

  /** A target that would change nothing (a toolbar button onto its own place) is no target. */
  const normalize = (t: Target | null, src: Source | null, ord: string[]): Target | null => {
    if (!t || !src) return null;
    const j = src.from === "toolbar" ? ord.indexOf(src.id) : -1;
    if (t.kind === "remove") return src.from === "toolbar" ? t : null;
    if (j < 0) return t;
    if (t.kind === "slot" && t.index === j) return null;
    if (t.kind === "gap" && (t.index === j || t.index === j + 1)) return null;
    return t;
  };

  const locate = (x: number, y: number): Target | null => {
    const inside = (el: HTMLElement | null) => { const r = el?.getBoundingClientRect(); return !!r && x >= r.left && x <= r.right && y >= r.top && y <= r.bottom; };
    if (inside(stage.current)) {
      const slots = [...(stage.current?.querySelectorAll<HTMLElement>("[data-slot]") ?? [])].map((el) => ({ i: Number(el.dataset.slot), r: el.getBoundingClientRect() }));
      const gap = slots.filter(({ r }) => r.left + r.width / 2 < x).length;
      for (const { i, r } of slots) if (x >= r.left + r.width / 4 && x <= r.right - r.width / 4) return { kind: "slot", index: i, gap };
      return { kind: "gap", index: gap };
    }
    if (inside(catalogue.current)) return { kind: "remove" };
    return null;
  };

  const commit = (src: Source, t: Target | null, replaceOk: boolean, keys: boolean) => {
    const ord = live.current.order;
    const n = ord.length;
    const j = src.from === "toolbar" ? ord.indexOf(src.id) : -1;
    const name = nameOf(src.id);
    const finish = (next: string[], text: string) => {
      setOrder(next);
      onChange?.({ ids: next.join(",") });
      announce(text);
      if (keys) setFocusId(next.includes(src.id) ? src.id : null);
    };
    const leave = (id: string, index: number, kind: Leaving["kind"], under?: string) => {
      const key = ++leaveKey.current;
      setLeaving((l) => [...l, { key, id, index, kind, ...(under ? { under } : {}) }]);
      // Cleared when its animation ends; this covers an animation that never runs.
      setTimeout(() => setLeaving((l) => l.filter((x) => x.key !== key)), 1000);
    };
    if (!t) { announce(props.cancelledLabel); return; }
    if (t.kind === "remove") {
      const next = ord.filter((x) => x !== src.id);
      leave(src.id, j, "remove");
      finish(next, fill(props.removedLabel, { name }));
      return;
    }
    if (t.kind === "slot" && replaceOk) {
      const old = ord[t.index]!;
      const next = ord.map((x) => (x === old ? src.id : x)).filter((x, i) => !(x === src.id && i === j));
      leave(old, t.index, "replace", src.id);
      setEntering({ id: src.id, kind: "replace" });
      finish(next, fill(props.replacedLabel, { name, other: nameOf(old) }));
      return;
    }
    const gap = t.kind === "slot" ? t.gap : t.index;
    if (src.from === "catalogue" && n >= max) { announce(props.fullLabel); return; }
    if (j >= 0 && (gap === j || gap === j + 1)) { announce(props.cancelledLabel); return; }
    const without = ord.filter((x) => x !== src.id);
    const at = j >= 0 && gap > j ? gap - 1 : gap;
    const next = [...without.slice(0, at), src.id, ...without.slice(at)];
    if (j >= 0) leave(src.id, j, "remove");
    setEntering({ id: src.id, kind: "insert" });
    finish(next, fill(j >= 0 ? props.movedLabel : props.addedLabel, { name, position: at + 1, count: next.length }));
  };

  const end = () => { setSource(null); setTarget(null); setLifted(null); pending.current = null; };

  // Pointer: a press that moves a few pixels becomes a drag; the ghost follows the pointer every move.
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      if (!live.current.source) {
        if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START) return;
        setMode("pointer");
        setSource(p.source);
        announce(fill(props.pickedLabel, { name: nameOf(p.source.id) }));
      }
      e.preventDefault();
      const r = root.current?.getBoundingClientRect();
      if (r && ghost.current) {
        ghost.current.style.setProperty(prop(s.ghostX), `${e.clientX - r.left}px`);
        ghost.current.style.setProperty(prop(s.ghostY), `${e.clientY - r.top}px`);
      }
      const next = normalize(locate(e.clientX, e.clientY), live.current.source ?? p.source, live.current.order);
      if (!sameTarget(next, live.current.target)) {
        setTarget(next);
        if (live.current.lifted !== null && !(next?.kind === "slot" && next.index === live.current.lifted)) setLifted(null);
      }
    };
    const up = (e: PointerEvent) => {
      const p = pending.current;
      if (!p || e.pointerId !== p.id) return;
      const { source: src, target: t, lifted: l } = live.current;
      if (src) commit(src, t, t?.kind === "slot" && l === t.index, false);
      end();
    };
    const cancel = (e: PointerEvent) => { if (pending.current && e.pointerId === pending.current.id) end(); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  });

  // Position the ghost before its first paint, where the drag started.
  useEffect(() => {
    const p = pending.current;
    const r = root.current?.getBoundingClientRect();
    if (source && mode === "pointer" && p && r && ghost.current) {
      ghost.current.style.setProperty(prop(s.ghostX), `${p.x - r.left}px`);
      ghost.current.style.setProperty(prop(s.ghostY), `${p.y - r.top}px`);
    }
  }, [source, mode]);

  useEffect(() => {
    if (!focusId) return;
    const id = requestAnimationFrame(() => {
      document.getElementById(`${uid}-on-${focusId}`)?.focus();
      setFocusId(null);
    });
    return () => cancelAnimationFrame(id);
  }, [focusId, uid]);

  const press = (src: Source) => (e: ReactPointerEvent) => {
    if (e.button !== 0 || live.current.source) return;
    pending.current = { source: src, x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  // Keys: every place in order, gap 0, button 0, gap 1 … gap n; a toolbar button's own place is skipped.
  const places = (): Target[] => {
    const out: Target[] = [];
    for (let i = 0; i <= order.length; i++) {
      out.push({ kind: "gap", index: i });
      if (i < order.length) out.push({ kind: "slot", index: i, gap: i });
    }
    return out.filter((t) => normalize(t, source, order));
  };
  const ordinal = (t: Target | null) => (t?.kind === "gap" ? t.index * 2 : t?.kind === "slot" ? t.index * 2 + 1 : originIndex >= 0 ? originIndex * 2 + 1 : order.length * 2 + 1);
  const describe = (t: Target) => {
    if (t.kind === "slot") return fill(props.overLabel, { name: nameOf(order[t.index]!) });
    if (source?.from === "catalogue" && full) return props.fullLabel;
    const at = originIndex >= 0 && t.kind === "gap" && t.index > originIndex ? t.index : t.kind === "gap" ? t.index + 1 : 0;
    return fill(props.placeLabel, { position: at, count: originIndex >= 0 ? order.length : order.length + 1 });
  };
  const goTo = (t: Target | undefined) => {
    if (!t) return;
    setTarget(t);
    setLifted(t.kind === "slot" ? t.index : null);
    announce(describe(t));
  };

  const onRootKeys = (e: ReactKeyboardEvent) => {
    if (!source || mode !== "keys") return;
    const list = places();
    const at = ordinal(target);
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    switch (e.key) {
      case "ArrowRight": case "ArrowDown": stop(); goTo(list.find((t) => ordinal(t) > at)); return;
      case "ArrowLeft": case "ArrowUp": stop(); goTo([...list].reverse().find((t) => ordinal(t) < at)); return;
      case "Home": stop(); goTo(list[0]); return;
      case "End": stop(); goTo(list.at(-1)); return;
      case "Enter": case " ": stop(); commit(source, target, target?.kind === "slot", true); end(); return;
      case "Escape": stop(); announce(props.cancelledLabel); end(); return;
      case "Tab": end(); return;
      default: stop();
    }
  };

  const pickKeys = (src: Source) => (e: ReactKeyboardEvent) => {
    if (source) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      setMode("keys");
      setSource(src);
      setTarget(null);
      announce(fill(props.pickedLabel, { name: nameOf(src.id) }));
    } else if (src.from === "toolbar" && (e.key === "Delete" || e.key === "Backspace")) {
      e.preventDefault();
      e.stopPropagation();
      commit(src, { kind: "remove" }, false, false);
      const ord = order.filter((x) => x !== src.id);
      const next = ord[Math.min(order.indexOf(src.id), ord.length - 1)];
      if (next) setFocusId(next);
    }
  };

  const button = (it: CommandItem, id?: string) => (
    <IconButton
      {...(id ? { id } : {})}
      icon={iconOf(it.icon)}
      label={it.label}
      {...(it.shortcut ? { shortcut: it.shortcut } : {})}
      {...(it.checked !== undefined ? { toggle: true, pressed: it.checked } : {})}
      onPress={() => {}}
    />
  );

  const markerAt = target?.kind === "gap" ? target.index : null;
  const marker = (side: "before" | "after") => (
    <span className={s.marker} data-side={side} data-full={source?.from === "catalogue" && full ? "" : undefined} aria-hidden="true" />
  );
  const slots = order.flatMap((id, i) => {
    const gone = leaving.filter((l) => l.kind === "remove" && l.index === i);
    const outgoing = leaving.find((l) => l.kind === "replace" && l.under === id);
    const it = byId.get(id);
    if (!it) return [];
    return [
      ...gone.map((l) => (
        <span key={`gone-${l.key}`} className={s.slot} data-leaving="" aria-hidden="true" inert onAnimationEnd={() => setLeaving((x) => x.filter((y) => y.key !== l.key))}>
          {byId.get(l.id) ? button(byId.get(l.id)!) : null}
        </span>
      )),
      <span
        key={id}
        className={s.slot}
        data-slot={i}
        data-origin={source?.id === id ? "" : undefined}
        data-holding={mode === "pointer" && target?.kind === "slot" && target.index === i && lifted !== i ? "" : undefined}
        data-lifted={lifted === i ? "" : undefined}
        data-entering={entering?.id === id ? entering.kind : undefined}
        onAnimationEnd={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.currentTarget.hasAttribute("data-holding")) setLifted(i);
          else if (entering?.id === id) setEntering(null);
        }}
        onPointerDownCapture={press({ from: "toolbar", id })}
        onKeyDownCapture={pickKeys({ from: "toolbar", id })}
      >
        <span className={s.displaced}>{button(it, `${uid}-on-${id}`)}</span>
        {outgoing && byId.get(outgoing.id) ? (
          <span className={s.outgoing} aria-hidden="true" inert onAnimationEnd={() => setLeaving((x) => x.filter((y) => y.key !== outgoing.key))}>{button(byId.get(outgoing.id)!)}</span>
        ) : null}
        {markerAt === i ? marker("before") : null}
        {markerAt === order.length && i === order.length - 1 ? marker("after") : null}
      </span>,
    ];
  });
  const trailing = leaving.filter((l) => l.kind === "remove" && l.index >= order.length).map((l) => (
    <span key={`gone-${l.key}`} className={s.slot} data-leaving="" aria-hidden="true" inert onAnimationEnd={() => setLeaving((x) => x.filter((y) => y.key !== l.key))}>
      {byId.get(l.id) ? button(byId.get(l.id)!) : null}
    </span>
  ));
  const pinned = new Set(order);
  const shelf = groups.map((g) => ({ ...g, items: g.items.filter((it) => !pinned.has(it.id) || source?.id === it.id && source.from === "catalogue") })).filter((g) => g.items.length);
  const dragged = source ? byId.get(source.id) : undefined;

  return (
    <div ref={root} className={s.root} data-dragging={source && mode === "pointer" ? "" : undefined} onKeyDownCapture={onRootKeys}>
      <span id={`${uid}-how`} className={s.srOnly}>{instructions}</span>
      <LiveRegion message={say.text} announceKey={say.key} />
      <div ref={stage} className={s.stage} role="group" aria-label={label} aria-describedby={`${uid}-how`}>
        <MorphPanel
          preview
          open
          label={label}
          trigger={null}
          content={
            <ToolbarRow label={label}>
              {order.length ? slots : <span className={s.empty} data-slot-empty="">{markerAt === 0 ? marker("before") : null}</span>}
              {trailing}
              <Divider orientation="vertical" />
              <MenuButton icon="more" label={moreLabel} sections={shelf} onAction={() => {}} />
            </ToolbarRow>
          }
        />
        <span className={s.count} data-full={full ? "" : undefined}>{fill(countLabel, { count: order.length, max })}</span>
      </div>
      <div ref={catalogue} className={s.catalogue} role="group" aria-label={catalogueLabel} aria-describedby={`${uid}-how`} data-leaving={target?.kind === "remove" ? "" : undefined}>
        {shelf.map((g) => (
          <section key={g.id} className={s.group} aria-labelledby={`${uid}-g-${g.id}`}>
            <h3 id={`${uid}-g-${g.id}`} className={s.heading}>{g.label}</h3>
            <ul className={s.grid}>
              {g.items.map((it) => (
                <li
                  key={it.id}
                  className={s.cell}
                  data-origin={source?.id === it.id ? "" : undefined}
                  onPointerDownCapture={press({ from: "catalogue", id: it.id })}
                  onKeyDownCapture={pickKeys({ from: "catalogue", id: it.id })}
                >
                  {button(it)}
                  <span className={s.label} aria-hidden="true">{it.label}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {source && mode === "pointer" && dragged ? <span ref={ghost} className={s.ghost} aria-hidden="true"><Icon name={iconOf(dragged.icon)} /></span> : null}
    </div>
  );
}
