/*
 * PET AUDIO LAB (solo desarrollo)
 * -------------------------------
 * Escuchar y revisar la voz de cada especie sin esperar a que la mascota "quiera":
 * especie · intención · etapa · intensidad · voz (la de tu mascota o una nueva) ·
 * reproducir (selección ponderada real) · siguiente variante · prueba de bucles
 * (ronroneo, jadeo, ronroneo dental, sueño) con sus fundidos.
 * Muestra el asset, su fuente y licencia, duración, cooldown, peso, tono y volumen,
 * y el registro intención → respuesta de la mascota real (qué decidió y por qué).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { audioSpecies, getAsset, layerAssets, sourceOf, vocalVariants } from '@/core/audio/petAudioManifest';
import { generateVoiceProfile, STAGE_RATE, STAGE_VOLUME, type PetVoiceProfile } from '@/core/audio/PetVoiceProfile';
import { SoundVariantSelector } from '@/core/audio/SoundVariantSelector';
import { SPECIES_PROFILES, type LayerId } from '@/core/audio/SpeciesVocalizationProfile';
import { VOCALIZATION_INTENTS, type PetAudioAsset, type VocalizationIntent } from '@/core/audio/types';
import { LIFE_STAGES, type LifeStage } from '@/core/growth/LifeStage';
import { SPECIES, type SpeciesKey } from '@/core/persistence/SaveGame';
import { SoftButton } from '@/components/ui/Buttons';
import { Squishable } from '@/components/ui/Squishable';
import { Card } from '@/components/ui/Surfaces';
import { Text } from '@/components/ui/Text';
import { ContinuousLayer } from '@/services/audio/ContinuousLayer';
import { PetAudioManager, resolvePetAudio } from '@/services/audio/PetAudioManager';
import { SessionController } from '@/services/SessionController';
import { colors, fonts, radius, spacing } from '@/theme';

const LAYERS: LayerId[] = ['purr', 'pant', 'teethPurr', 'sleep'];
const LAYER_INTENT: Record<LayerId, VocalizationIntent> = { purr: 'AFFECTION', pant: 'AFFECTION', teethPurr: 'AFFECTION', sleep: 'SLEEPING' };

function Pill({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
  return (
    <Squishable onPress={onPress} style={[styles.pill, on ? styles.pillOn : null]}>
      <Text variant="labelSm" color={on ? colors.onPrimaryContainer : colors.text}>{label}</Text>
    </Squishable>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.mono}>{k}</Text>
      <Text style={styles.monoR}>{v}</Text>
    </View>
  );
}

export function PetAudioLab() {
  const session = SessionController.current;
  const [species, setSpecies] = useState<SpeciesKey>(session?.profile.species ?? 'dog');
  const [intent, setIntent] = useState<VocalizationIntent>('GREETING');
  const [stage, setStage] = useState<LifeStage>(session?.growth.stage ?? 'YOUNG');
  const [intensity, setIntensity] = useState(0.7);
  const [ownVoice, setOwnVoice] = useState(true);
  const [randomVoice, setRandomVoice] = useState<PetVoiceProfile>(() => generateVoiceProfile(`lab|${Date.now()}`, 'dog'));
  const [last, setLast] = useState<{ asset: PetAudioAsset; weight: number } | null>(null);
  const [loop, setLoop] = useState<LayerId | null>(null);
  const [, bump] = useState(0);
  const [selector] = useState(() => new SoundVariantSelector(Math.random));
  const layer = useRef<ContinuousLayer | null>(null);
  useEffect(() => () => layer.current?.release(), []); // al salir del laboratorio no queda nada sonando

  const sp = audioSpecies(species);
  const prof = SPECIES_PROFILES[sp];
  const set = prof.sets[intent];
  const variants = useMemo(() => vocalVariants(sp, intent, stage), [sp, intent, stage]);
  const voice: PetVoiceProfile = ownVoice && session && session.profile.species === species ? session.voice : randomVoice;
  const preferred = new Set(voice.preferredVariants);
  const gain = set ? (set.gain[0] + (set.gain[1] - set.gain[0]) * intensity) * voice.volume * STAGE_VOLUME[stage] : 0;
  const rate = voice.pitch * STAGE_RATE[stage];

  const play = (asset: PetAudioAsset | null) => {
    if (!asset) return;
    setLast({ asset, weight: selector.weightOf(asset.id, sp, preferred) });
    PetAudioManager.play(asset.id, { gain, rate, category: 'VOCAL' });
  };

  const toggleLoop = (id: LayerId) => {
    const spec = prof.layers[id];
    const asset = layerAssets(sp, LAYER_INTENT[id])[0];
    layer.current ??= new ContinuousLayer('lab', resolvePetAudio, { hz: 0.3, depth: 0.12 });
    if (loop === id || !spec || !asset) {
      layer.current.setTarget(null, 0, spec ?? null); // fundido de salida (sin cortar)
      setLoop(null);
      return;
    }
    layer.current.setTarget(asset.id, Math.max(spec.maxGain, 0.3), spec);
    setLoop(id);
  };

  const src = last ? sourceOf(last.asset) : null;
  const log = session?.vocal.log.slice(-8).reverse() ?? [];

  return (
    <Card style={styles.card}>
      <Text variant="labelMd" color={colors.primary} uppercase>Pet Audio Lab</Text>
      <View style={styles.wrap}>{SPECIES.map((s) => <Pill key={s} label={s} on={s === species} onPress={() => { setSpecies(s); setRandomVoice(generateVoiceProfile(`lab|${Date.now()}`, s)); }} />)}</View>
      <View style={styles.wrap}>{VOCALIZATION_INTENTS.filter((i) => i !== 'SLEEPING').map((i) => <Pill key={i} label={i.toLowerCase()} on={i === intent} onPress={() => setIntent(i)} />)}</View>
      <View style={styles.wrap}>{LIFE_STAGES.map((st) => <Pill key={st} label={st.toLowerCase()} on={st === stage} onPress={() => setStage(st)} />)}</View>
      <View style={styles.wrap}>
        {[0.2, 0.4, 0.7, 1].map((v) => <Pill key={v} label={`intensidad ${v}`} on={v === intensity} onPress={() => setIntensity(v)} />)}
      </View>
      <View style={styles.wrap}>
        <Pill label="voz de tu mascota" on={ownVoice} onPress={() => setOwnVoice(true)} />
        <Pill label="otra voz" on={!ownVoice} onPress={() => { setOwnVoice(false); setRandomVoice(generateVoiceProfile(`lab|${Date.now()}`, species)); }} />
      </View>
      <View style={styles.wrap}>
        <SoftButton label="Reproducir" icon="play" onPress={() => play(selector.pick(variants, sp, intent, preferred))} />
        <SoftButton label="Siguiente" icon="step" tone="lavender" onPress={() => play(selector.next(variants, sp, intent))} />
      </View>
      <Line k="variantes" v={`${variants.length}${set ? ` · p ${set.probability} · cooldown ${(set.cooldownMs / 1000).toFixed(0)} s` : ' · (esta especie calla: silencio)'}`} />
      <Line k="voz" v={`tono ×${voice.pitch.toFixed(3)} · vol ${voice.volume.toFixed(2)} · frecuencia ×${voice.vocalizationFrequency.toFixed(2)}`} />
      <Line k="salida" v={`rate ${rate.toFixed(3)} · gain ${gain.toFixed(2)}`} />
      {last ? (
        <>
          <Line k="asset" v={`${last.asset.id} · ${last.asset.durationMs} ms · peso ${last.weight.toFixed(2)}${preferred.has(last.asset.id) ? ' ★' : ''}`} />
          <Line k="archivo" v={last.asset.file} />
          <Line k="fuente" v={src ? `${src.title} — ${src.author}` : '?'} />
          <Line k="licencia" v={src ? `${src.license}${src.attributionRequired ? ' (atribución)' : ''}` : '?'} />
        </>
      ) : null}
      <Text variant="labelSm" color={colors.textMuted}>Bucles (fundido de entrada/salida)</Text>
      <View style={styles.wrap}>
        {LAYERS.filter((l) => prof.layers[l]).map((l) => <Pill key={l} label={`${loop === l ? '■' : '▶'} ${l}`} on={loop === l} onPress={() => { toggleLoop(l); bump((v) => v + 1); }} />)}
      </View>
      {log.length ? <Text variant="labelSm" color={colors.textMuted}>Tu mascota: intención → respuesta</Text> : null}
      {log.map((e) => (
        <Line key={`${e.atMs}-${e.intent}-${e.response}`} k={`${new Date(e.atMs).toLocaleTimeString()} ${e.intent.toLowerCase()} · ${e.trigger}`} v={getAsset(e.response) ? `▶ ${e.response}` : e.response} />
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.full, backgroundColor: colors.surfaceContainerHigh },
  pillOn: { backgroundColor: colors.primaryContainer },
  line: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  mono: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.textMuted, flexShrink: 1 },
  monoR: { fontFamily: fonts.bodySemi, fontSize: 11, color: colors.text, fontVariant: ['tabular-nums'], marginLeft: 'auto', flexShrink: 1, textAlign: 'right' },
});
