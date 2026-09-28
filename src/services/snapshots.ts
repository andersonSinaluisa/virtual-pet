/*
 * CAPTURAS DE RECUERDOS
 * ---------------------
 * Cuando se crea un recuerdo y hay una escena 3D visible, se toma una
 * captura del GLView (GLView.takeSnapshotAsync) y se copia a
 * Paths.document/moments (la caché la puede borrar el sistema).
 * Si no hay escena activa, el recuerdo usa una ilustración de respaldo.
 */
import { Directory, File, Paths } from 'expo-file-system';

type Capturer = () => Promise<string | null>;

let active: Capturer | null = null;

// El PetCanvas visible se registra; al desmontarse se da de baja
export function registerCapturer(fn: Capturer): () => void {
  active = fn;
  return () => { if (active === fn) active = null; };
}

export async function captureToDocuments(name: string): Promise<string | null> {
  if (!active) return null;
  try {
    const tmp = await active();
    if (!tmp) return null;
    const dir = new Directory(Paths.document, 'moments');
    if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
    const dest = new File(dir, `${name}.jpg`);
    if (dest.exists) dest.delete();
    await new File(tmp).copy(dest);
    return dest.uri;
  } catch (e) {
    console.warn('[snapshots] no se pudo guardar la captura', e);
    return null;
  }
}
