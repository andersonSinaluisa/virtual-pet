/*
 * Hápticos con moderación: caricia/recompensa, descubrimiento, objetos,
 * recuerdo importante. Un mínimo de 250 ms entre pulsos para no vibrar
 * constantemente (p. ej. al acariciar arrastrando el dedo).
 */
import * as Haptics from 'expo-haptics';

export type HapticKind = 'pet' | 'object' | 'discovery' | 'memory' | 'select';

let enabled = true;
let last = 0;

export function setHapticsEnabled(v: boolean): void {
  enabled = v;
}

export function haptic(kind: HapticKind): void {
  if (!enabled) return;
  const now = Date.now();
  if (now - last < 250) return;
  last = now;
  const run = () => {
    switch (kind) {
      case 'pet': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);
      case 'object': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      case 'select': return Haptics.selectionAsync();
      case 'discovery': return Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      case 'memory': return Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  };
  run().catch(() => {});
}
