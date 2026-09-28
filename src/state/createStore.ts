/*
 * Store mínimo observable + hook con selector (useSyncExternalStore).
 * Cada área tiene su propio store: la app no vive en un Context gigante y un
 * tick del cerebro solo re-renderiza lo que lee el dato que cambió.
 */
import { useSyncExternalStore } from 'react';

export interface Store<T> {
  get(): T;
  set(next: T | ((prev: T) => T)): void;
  subscribe(fn: () => void): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => state,
    set(next) {
      const value = typeof next === 'function' ? (next as (p: T) => T)(state) : next;
      if (Object.is(value, state)) return;
      state = value;
      listeners.forEach((l) => l());
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },
  };
}

export function useStore<T, S = T>(store: Store<T>, selector?: (s: T) => S): S {
  const get = () => (selector ? selector(store.get()) : (store.get() as unknown as S));
  return useSyncExternalStore(store.subscribe, get, get);
}
