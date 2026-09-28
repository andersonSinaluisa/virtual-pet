/*
 * Adaptador de almacenamiento: expo-sqlite/kv-store (módulo Expo, en Expo Go)
 * detrás de la interfaz KeyValueStore del dominio. Si el almacenamiento
 * nativo falla al arrancar, se usa memoria y se avisa (la partida no se pierde
 * de la sesión actual, pero no persistirá: se muestra en la UI).
 */
import Storage from 'expo-sqlite/kv-store';

import { MemoryKeyValueStore, SaveGameStore, type KeyValueStore } from '@/core/persistence/SaveGameStore';

class SqliteKeyValueStore implements KeyValueStore {
  getItem(key: string): Promise<string | null> {
    return Storage.getItem(key);
  }
  setItem(key: string, value: string): Promise<void> {
    return Storage.setItem(key, value);
  }
  removeItem(key: string): Promise<void> {
    return Storage.removeItem(key).then(() => undefined);
  }
}

export interface StorageHandle {
  store: SaveGameStore;
  persistent: boolean;
}

export async function openStorage(): Promise<StorageHandle> {
  const kv = new SqliteKeyValueStore();
  try {
    await kv.getItem('milo.probe');
    return { store: new SaveGameStore(kv), persistent: true };
  } catch (e) {
    console.warn('[storage] expo-sqlite no disponible; la partida no se guardará', e);
    return { store: new SaveGameStore(new MemoryKeyValueStore()), persistent: false };
  }
}
