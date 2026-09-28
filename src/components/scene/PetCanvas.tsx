/*
 * PET CANVAS: GLView + render loop + gestos táctiles
 * --------------------------------------------------
 * - Render a 60 fps con requestAnimationFrame SOLO mientras la pantalla tiene
 *   foco y la app está activa (la SNN va aparte, en el TickEngine).
 * - Nada de Three.js entra en el estado de React: la escena vive en un ref.
 * - Los gestos se traducen a interacciones del MUNDO vía SessionController:
 *
 *     tap mascota           → caricia (petDirect)
 *     arrastrar sobre ella  → caricia continua
 *     tap plato / agua      → rellenar
 *     arrastrar un objeto   → moverlo; soltar con velocidad → lanzarlo
 *     arrastrar el suelo    → rotar la vista (órbita)
 *     pinch                 → zoom
 */
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl';
import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { Action } from '@/core/brain/Actions';
import type { SpeciesKey } from '@/core/persistence/SaveGame';
import type { Point } from '@/core/simulation/Pet';
import { PetMaterials, PetQuality } from '@/render3d/PetMaterials';
import { PetScene, type SceneSource } from '@/render3d/PetScene';
import { createRenderer } from '@/render3d/Studio';
import { SessionController } from '@/services/SessionController';
import { registerCapturer } from '@/services/snapshots';
import { useStore } from '@/state/createStore';
import { devStore, settingsStore } from '@/state/stores';

import { SceneFallback } from './SceneFallback';

export type CanvasMode = 'home' | 'fetch' | 'preview' | 'observe';

interface Props {
  species: SpeciesKey;
  mode?: CanvasMode;
  framing?: 'room' | 'close';
  source?: SceneSource; // por defecto: la sesión activa
  style?: StyleProp<ViewStyle>;
  children?: ReactNode; // overlays RN sobre la escena
  onPetTouched?: () => void;
}

function sessionSource(): SceneSource | null {
  const s = SessionController.current;
  if (!s) return null;
  return {
    world: s.world,
    active: () => s.sim.last.active as readonly Action[],
    // Crecimiento real; en desarrollo, la vista previa lo sustituye SOLO en pantalla (no toca el desarrollo)
    growth: () => ({ value: devStore.get().growthPreview ?? s.growth.visualValue(s.clock.now()), size: s.growth.state.modifiers.size }),
  };
}

export function PetCanvas({ species, mode = 'home', framing = 'room', source, style, children, onPetTouched }: Props) {
  const focused = useIsFocused();
  const fur = useStore(settingsStore, (s) => s.fur);
  const shadows = useStore(settingsStore, (s) => s.shadows);
  const debugScene = useStore(devStore, (d) => d.debugScene);
  const [failed, setFailed] = useState<string | null>(null);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const size = useRef({ w: 1, h: 1 });

  const sceneRef = useRef<PetScene | null>(null);
  const glRef = useRef<ExpoWebGLRenderingContext | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastT = useRef(0);
  const liveRef = useRef(false);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  const live = focused && appActive && !failed;

  // Arranca/para el loop de render según foco y AppState
  useEffect(() => {
    liveRef.current = live;
    if (live && sceneRef.current && frameRef.current === null) {
      lastT.current = 0;
      frameRef.current = requestAnimationFrame(loop);
    }
    if (!live && frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  // Captura para recuerdos mientras esta escena está visible
  useEffect(() => {
    if (!live || mode === 'preview') return;
    return registerCapturer(async () => {
      const gl = glRef.current;
      if (!gl) return null;
      const snap = await GLView.takeSnapshotAsync(gl, { format: 'jpeg', compress: 0.8 });
      return typeof snap.uri === 'string' ? snap.uri : null;
    });
  }, [live, mode]);

  useEffect(() => { sceneRef.current?.setSpecies(species); }, [species]);

  useEffect(() => () => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    sceneRef.current?.dispose();
    sceneRef.current = null;
    glRef.current = null;
  }, []);

  function loop(now: number) {
    frameRef.current = null;
    const scene = sceneRef.current, gl = glRef.current;
    if (!scene || !gl || !liveRef.current) return;
    try {
      const dt = lastT.current ? (now - lastT.current) / 1000 : 1 / 60;
      lastT.current = now;
      if (gl.drawingBufferWidth !== size.current.w || gl.drawingBufferHeight !== size.current.h) {
        size.current = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight };
        scene.resize(size.current.w, size.current.h);
      }
      scene.update(dt);
      scene.render();
      gl.endFrameEXP();
      frameRef.current = requestAnimationFrame(loop);
    } catch (e) {
      console.error('[PetCanvas] render', e);
      setFailed(e instanceof Error ? e.message : String(e));
    }
  }

  function onContextCreate(gl: ExpoWebGLRenderingContext) {
    try {
      const src = source ?? sessionSource();
      if (!src) throw new Error('No hay simulación activa');
      if (PetQuality.fur !== fur) { PetQuality.fur = fur; PetMaterials.clear(); }
      PetQuality.shadows = shadows;
      const renderer = createRenderer(gl as unknown as WebGL2RenderingContext, { shadows });
      const scene = new PetScene(renderer, src, { species, framing, debug: debugScene && __DEV__ });
      size.current = { w: gl.drawingBufferWidth, h: gl.drawingBufferHeight };
      scene.resize(size.current.w, size.current.h);
      glRef.current = gl;
      sceneRef.current = scene;
      if (liveRef.current || live) {
        liveRef.current = true;
        frameRef.current = requestAnimationFrame(loop);
      }
    } catch (e) {
      console.error('[PetCanvas] contexto', e);
      setFailed(e instanceof Error ? e.message : String(e));
    }
  }

  // ---------- Gestos (JS thread: tocan objetos JS de la simulación) ----------
  const drag = useRef<{ kind: 'pet' | 'object' | 'orbit' | 'none'; id: number; last: number; trail: { p: Point; t: number }[]; orbit0: number }>({ kind: 'none', id: 0, last: 0, trail: [], orbit0: 0 });
  const zoom0 = useRef(1);
  const layout = useRef({ w: 1, h: 1 });
  const ndc = (x: number, y: number) => ({ x: (x / Math.max(1, layout.current.w)) * 2 - 1, y: -(y / Math.max(1, layout.current.h)) * 2 + 1 });
  const interactive = mode !== 'preview';
  // En pantallas con scroll ('observe') solo se admite tocar: arrastrar desplazaría la página
  const dragging = mode === 'home' || mode === 'fetch';

  const tap = Gesture.Tap().runOnJS(true).enabled(interactive).onEnd((e) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const n = ndc(e.x, e.y);
    const hit = scene.pick(n.x, n.y);
    if (!hit) return;
    if (hit.kind === 'pet') { SessionController.petDirect(); onPetTouched?.(); }
    else if (hit.kind === 'object') {
      const o = SessionController.current?.world.getObject(hit.id);
      if (o?.kind === 'bowl') SessionController.interact('food');
      else if (o?.kind === 'water') SessionController.interact('water');
    }
  });

  const pan = Gesture.Pan().runOnJS(true).enabled(dragging).minDistance(6)
    .onBegin((e) => {
      const scene = sceneRef.current, s = SessionController.current;
      const d = drag.current;
      d.kind = 'none'; d.trail = []; d.last = 0;
      if (!scene || !s) return;
      const n = ndc(e.x, e.y);
      const hit = scene.pick(n.x, n.y);
      if (hit?.kind === 'pet') d.kind = 'pet';
      else if (hit?.kind === 'object') {
        const o = s.world.getObject(hit.id);
        if (o && !o.fixed && o.id !== s.world.pet.carrying) { d.kind = 'object'; d.id = o.id; }
      } else { d.kind = 'orbit'; d.orbit0 = scene.getOrbit(); }
    })
    .onUpdate((e) => {
      const scene = sceneRef.current, d = drag.current;
      if (!scene) return;
      const n = ndc(e.x, e.y);
      if (d.kind === 'pet') {
        const now = Date.now();
        if (now - d.last > 150) {
          const h = scene.pick(n.x, n.y);
          if (h?.kind === 'pet') { SessionController.petDirect(); d.last = now; onPetTouched?.(); }
        }
      } else if (d.kind === 'object') {
        const p = scene.floorPoint(n.x, n.y);
        if (!p) return;
        SessionController.moveObject(d.id, p.x, p.y);
        d.trail.push({ p, t: Date.now() });
        if (d.trail.length > 6) d.trail.shift();
      } else if (d.kind === 'orbit') {
        scene.setOrbit(d.orbit0 - (e.translationX / Math.max(1, layout.current.w)) * 1.4);
      }
    })
    .onEnd(() => {
      const d = drag.current, s = SessionController.current;
      if (d.kind === 'object' && s) {
        const a = d.trail[0], b = d.trail[d.trail.length - 1];
        const dtMs = a && b ? b.t - a.t : 0;
        if (a && b && dtMs > 10) {
          // Velocidad de soltado (mundo/ms) → unidades de mundo por tick
          const perTick = 1000 / s.config.simulation.baseTicksPerSecond;
          const vx = ((b.p.x - a.p.x) / dtMs) * perTick * 0.35;
          const vy = ((b.p.y - a.p.y) / dtMs) * perTick * 0.35;
          if (Math.hypot(vx, vy) > 0.01) SessionController.throwObject(d.id, vx, vy);
        }
        SessionController.endMoveObject(d.id);
      }
      d.kind = 'none';
    });

  const pinch = Gesture.Pinch().runOnJS(true).enabled(dragging)
    .onBegin(() => { zoom0.current = sceneRef.current?.getZoom() ?? 1; })
    .onUpdate((e) => { sceneRef.current?.setZoom(zoom0.current / Math.max(0.2, e.scale)); });

  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));

  if (failed) {
    return (
      <View style={[styles.root, style]}>
        <SceneFallback reason={failed} />
        {children}
      </View>
    );
  }

  return (
    <View style={[styles.root, style]} onLayout={(e) => { layout.current = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height }; }}>
      <GestureDetector gesture={gesture}>
        <GLView style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} msaaSamples={4} />
      </GestureDetector>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
});
