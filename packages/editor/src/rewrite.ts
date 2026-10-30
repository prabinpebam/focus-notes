import type { Node, Slice } from "@tiptap/pm/model";
import { AddMarkStep, Mapping, RemoveMarkStep, Transform } from "@tiptap/pm/transform";

/** Paired documents for a protected preview; this helper does not dispatch or enter undo history. */
export class RewriteRange {
  #canonical: Node;
  #projection: Node;
  #from: number;
  #to: number;
  #replacement: Slice | undefined;
  #projectionTo: number;
  #bridge = new Mapping();

  constructor(doc: Node, from: number, to: number) {
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > doc.content.size) throw new Error("unsupported-target");
    this.#canonical = doc;
    this.#projection = doc;
    this.#from = from;
    this.#to = to;
    this.#projectionTo = to;
  }
  get canonical(): Node { return this.#canonical; }
  get projection(): Node { return this.#projection; }
  get from(): number { return this.#from; }
  get to(): number { return this.#to; }

  show(replacement: Slice): void {
    const preview = new Transform(this.#canonical).replace(this.#from, this.#to, replacement);
    this.#replacement = replacement;
    this.#projection = preview.doc;
    this.#projectionTo = preview.mapping.map(this.#to, 1);
    this.#bridge = preview.mapping.invert();
  }

  /** Applies a whole outside transaction atomically using real PM StepMaps, never length guesses. */
  applyOutside(transaction: Transform): void {
    if (!transaction.before.eq(this.#projection)) throw new Error("stale-target");
    let canonical = new Transform(this.#canonical);
    let bridge = this.#bridge;
    let from = this.#from, to = this.#to, projectedFrom = from, projectedTo = this.#projectionTo;
    for (const [index, step] of transaction.steps.entries()) {
      let touches = false, hasMappedRange = false;
      step.getMap().forEach((a, b) => {
        hasMappedRange = true;
        if (a <= projectedTo && b >= projectedFrom) touches = true;
      });
      if (step instanceof AddMarkStep || step instanceof RemoveMarkStep) {
        touches ||= step.from < projectedTo && step.to > projectedFrom;
      } else if (!hasMappedRange) {
        if (!("pos" in step) || typeof step.pos !== "number") throw new Error("protected-target");
        const node = transaction.docs[index]!.nodeAt(step.pos);
        if (!node || step.pos < projectedTo && step.pos + node.nodeSize > projectedFrom) touches = true;
      }
      if (touches) throw new Error("protected-target");
      // ReplaceAroundStep can retain the protected text while replacing its ancestor's
      // boundary tokens. Nonempty StepMaps therefore do not prove markup safety.
      const before = transaction.docs[index]!;
      const after = transaction.docs[index + 1] ?? transaction.doc;
      for (const position of [projectedFrom, projectedTo]) {
        const resolved = before.resolve(position);
        const mappedPosition = after.resolve(step.getMap().map(position, 1));
        if (mappedPosition.depth !== resolved.depth) throw new Error("protected-target");
        for (let depth = 1; depth <= resolved.depth; depth++) {
          if (!mappedPosition.node(depth).sameMarkup(resolved.node(depth))) throw new Error("protected-target");
        }
      }
      const mapped = step.map(bridge);
      if (!mapped) throw new Error("protected-target");
      const next = new Transform(canonical.doc);
      const applied = next.maybeStep(mapped);
      if (applied.failed) throw new Error("protected-target");
      const canonicalMap = mapped.getMap(), projectionMap = step.getMap();
      from = canonicalMap.map(from, 1);
      to = canonicalMap.map(to, -1);
      projectedFrom = projectionMap.map(projectedFrom, 1);
      projectedTo = projectionMap.map(projectedTo, -1);
      bridge = new Mapping([projectionMap.invert(), ...bridge.maps, canonicalMap]);
      canonical = next;
    }
    const rebuilt = this.#replacement ? new Transform(canonical.doc).replace(from, to, this.#replacement).doc : canonical.doc;
    if (!rebuilt.eq(transaction.doc)) throw new Error("protected-target");
    this.#canonical = canonical.doc;
    this.#projection = rebuilt;
    this.#from = from;
    this.#to = to;
    this.#projectionTo = projectedTo;
    this.#bridge = bridge;
  }

  discard(): Node { return this.#canonical; }

  /** The host dispatches this single replacement between closeHistory boundaries only on Accept. */
  accept(): Transform {
    if (!this.#replacement) throw new Error("not-reviewing");
    return new Transform(this.#canonical).replace(this.#from, this.#to, this.#replacement);
  }
}
