/** A minimal observable store. Views read it only through view models. */
export type Listener = () => void;

export class Store<S extends object> {
  #state: S;
  #listeners = new Set<Listener>();
  #version = 0;

  constructor(initial: S) {
    this.#state = initial;
  }

  get state(): S {
    return this.#state;
  }

  get version(): number {
    return this.#version;
  }

  update(recipe: (draft: S) => S): void {
    const next = recipe(this.#state);
    if (next === this.#state) return;
    this.#state = next;
    this.#version++;
    for (const l of [...this.#listeners]) l();
  }

  subscribe(listener: Listener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
}
