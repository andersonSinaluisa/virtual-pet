/*
 * SAVE GAME STORE: guardar/cargar con recuperación segura
 * -------------------------------------------------------
 *   cargar: principal → (si falla) respaldo → (si falla) se aparta la copia
 *           corrupta bajo otra clave y se empieza de cero AVISANDO.
 *   guardar: el principal válido anterior pasa a ser el respaldo.
 *
 * El dominio no conoce AsyncStorage/SQLite: solo la interfaz KeyValueStore.
 */
import { migrateSave, SaveError } from './migrations';
import type { SaveGame } from './SaveGame';

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export const SAVE_KEYS = {
  main: 'milo.save',
  backup: 'milo.save.backup',
  corrupt: 'milo.save.corrupt',
} as const;

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; save: SaveGame }
  | { status: 'recovered'; save: SaveGame; reason: string }
  | { status: 'corrupt'; reason: string };

export class SaveGameStore {
  constructor(private readonly kv: KeyValueStore) {}

  async load(): Promise<LoadResult> {
    const main = await this.kv.getItem(SAVE_KEYS.main);
    if (main === null) {
      const backupOnly = await this.tryParse(await this.kv.getItem(SAVE_KEYS.backup));
      if (backupOnly.ok) return { status: 'recovered', save: backupOnly.save, reason: 'Faltaba el guardado principal' };
      return { status: 'empty' };
    }
    const parsed = await this.tryParse(main);
    if (parsed.ok) return { status: 'ok', save: parsed.save };

    const backup = await this.tryParse(await this.kv.getItem(SAVE_KEYS.backup));
    if (backup.ok) {
      await this.kv.setItem(SAVE_KEYS.corrupt, main);
      await this.kv.setItem(SAVE_KEYS.main, JSON.stringify(backup.save));
      return { status: 'recovered', save: backup.save, reason: parsed.error };
    }
    // Nada que recuperar: se aparta la copia corrupta (nunca se borra)
    await this.kv.setItem(SAVE_KEYS.corrupt, main);
    await this.kv.removeItem(SAVE_KEYS.main);
    return { status: 'corrupt', reason: parsed.error };
  }

  async save(save: SaveGame): Promise<void> {
    const json = JSON.stringify(save);
    const previous = await this.kv.getItem(SAVE_KEYS.main);
    if (previous !== null && (await this.tryParse(previous)).ok) await this.kv.setItem(SAVE_KEYS.backup, previous);
    await this.kv.setItem(SAVE_KEYS.main, json);
  }

  async clear(): Promise<void> {
    await this.kv.removeItem(SAVE_KEYS.main);
    await this.kv.removeItem(SAVE_KEYS.backup);
  }

  async exportRaw(): Promise<string | null> {
    return this.kv.getItem(SAVE_KEYS.main);
  }

  // Importar (modo desarrollo): valida y migra antes de escribir
  async importRaw(json: string): Promise<SaveGame> {
    const parsed = await this.tryParse(json);
    if (!parsed.ok) throw new SaveError(parsed.error, false);
    await this.save(parsed.save);
    return parsed.save;
  }

  private async tryParse(raw: string | null): Promise<{ ok: true; save: SaveGame } | { ok: false; error: string }> {
    if (raw === null) return { ok: false, error: 'vacío' };
    try {
      return { ok: true, save: migrateSave(JSON.parse(raw) as unknown) };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}

// Almacén en memoria (tests y fallback si el almacenamiento nativo falla)
export class MemoryKeyValueStore implements KeyValueStore {
  readonly data = new Map<string, string>();
  async getItem(key: string) { return this.data.get(key) ?? null; }
  async setItem(key: string, value: string) { this.data.set(key, value); }
  async removeItem(key: string) { this.data.delete(key); }
}
