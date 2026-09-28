// Emisor de eventos tipado y mínimo (sin dependencias de plataforma).
export class Emitter<M extends Record<string, unknown>> {
  private listeners: { [K in keyof M]?: Set<(v: M[K]) => void> } = {};

  on<K extends keyof M>(event: K, fn: (v: M[K]) => void): () => void {
    const set = (this.listeners[event] ??= new Set());
    set.add(fn);
    return () => { set.delete(fn); };
  }

  emit<K extends keyof M>(event: K, value: M[K]): void {
    const set = this.listeners[event];
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(value); } catch (e) { console.warn(`[Emitter] listener de "${String(event)}" falló`, e); }
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
