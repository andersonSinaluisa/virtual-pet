/*
 * Gestor de assets de escenario de la app (uno para toda la app: la caché se
 * comparte entre pantallas). Lee los GLB empaquetados con expo-asset y
 * expo-file-system; el resto del pipeline es independiente de la plataforma.
 */
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';

import { EnvironmentAssetManager } from '@/render3d/EnvironmentAssetManager';
import { ENV_ASSET_MODULES } from '@/render3d/EnvironmentAssetRegistry';

async function readBytes(id: string): Promise<ArrayBuffer> {
  const mod = ENV_ASSET_MODULES[id];
  if (mod === undefined) throw new Error(`Asset de escenario desconocido: ${id}`);
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  try {
    return await new File(uri).arrayBuffer();
  } catch {
    // Web / URIs remotas en desarrollo
    const res = await fetch(uri);
    return res.arrayBuffer();
  }
}

export const environmentAssets = new EnvironmentAssetManager(readBytes);
