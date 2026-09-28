/*
 * ICON: nombres semánticos → Material Symbols (Android/web, los mismos de
 * Stitch) y SF Symbols (iOS). Los nombres se validan en compilación con los
 * tipos de expo-symbols.
 */
import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { colors } from '@/theme';

type NameObject = Exclude<SymbolViewProps['name'], string>;
type Pair = { ios: NonNullable<NameObject['ios']>; android: NonNullable<NameObject['android']> };

export const ICONS = {
  paw: { ios: 'pawprint.fill', android: 'pets' },
  person: { ios: 'person.fill', android: 'person' },
  calendar: { ios: 'calendar', android: 'calendar_today' },
  sun: { ios: 'sun.max.fill', android: 'wb_sunny' },
  sunrise: { ios: 'sunrise.fill', android: 'wb_twilight' },
  sunset: { ios: 'sunset.fill', android: 'wb_twilight' },
  moon: { ios: 'moon.fill', android: 'bedtime' },
  bed: { ios: 'bed.double.fill', android: 'bed' },
  food: { ios: 'fork.knife', android: 'soup_kitchen' },
  water: { ios: 'drop.fill', android: 'water_drop' },
  waterDrop: { ios: 'drop.fill', android: 'water_drop' },
  touch: { ios: 'hand.tap.fill', android: 'touch_app' },
  ball: { ios: 'baseball.fill', android: 'sports_baseball' },
  soccer: { ios: 'soccerball', android: 'sports_soccer' },
  tips: { ios: 'lightbulb.max', android: 'tips_and_updates' },
  lightbulb: { ios: 'lightbulb', android: 'lightbulb' },
  smile: { ios: 'face.smiling', android: 'sentiment_very_satisfied' },
  psychology: { ios: 'brain.head.profile', android: 'psychology' },
  psychologyAlt: { ios: 'questionmark.bubble', android: 'psychology_alt' },
  bolt: { ios: 'bolt.fill', android: 'bolt' },
  searchInsights: { ios: 'sparkle.magnifyingglass', android: 'search_insights' },
  search: { ios: 'magnifyingglass', android: 'search' },
  heart: { ios: 'heart', android: 'favorite' },
  heartFill: { ios: 'heart.fill', android: 'favorite' },
  heartHand: { ios: 'hand.raised.fill', android: 'volunteer_activism' },
  backpack: { ios: 'backpack.fill', android: 'backpack' },
  toys: { ios: 'teddybear.fill', android: 'toys' },
  brain: { ios: 'brain', android: 'neurology' },
  home: { ios: 'house.fill', android: 'cottage' },
  book: { ios: 'book.fill', android: 'auto_stories' },
  menuBook: { ios: 'book.closed.fill', android: 'menu_book' },
  close: { ios: 'xmark', android: 'close' },
  arrowForward: { ios: 'arrow.right', android: 'arrow_forward' },
  arrowBack: { ios: 'chevron.left', android: 'arrow_back_ios_new' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  verified: { ios: 'checkmark.seal.fill', android: 'verified' },
  star: { ios: 'star.fill', android: 'star' },
  lock: { ios: 'lock.fill', android: 'lock' },
  eye: { ios: 'eye', android: 'visibility' },
  wave: { ios: 'hand.wave.fill', android: 'waving_hand' },
  mic: { ios: 'mic.fill', android: 'mic' },
  volume: { ios: 'speaker.wave.2.fill', android: 'volume_up' },
  volumeLow: { ios: 'speaker.wave.1.fill', android: 'volume_down' },
  volumeOff: { ios: 'speaker.slash.fill', android: 'volume_off' },
  hourglass: { ios: 'hourglass', android: 'hourglass_empty' },
  cookie: { ios: 'birthday.cake.fill', android: 'cookie' },
  sparkle: { ios: 'sparkles', android: 'auto_awesome' },
  camera: { ios: 'camera.fill', android: 'add_a_photo' },
  box: { ios: 'shippingbox.fill', android: 'inventory_2' },
  interests: { ios: 'square.grid.2x2.fill', android: 'interests' },
  music: { ios: 'music.note', android: 'music_note' },
  spa: { ios: 'leaf.fill', android: 'spa' },
  shield: { ios: 'shield.fill', android: 'shield' },
  group: { ios: 'person.2.fill', android: 'group' },
  speed: { ios: 'speedometer', android: 'speed' },
  play: { ios: 'play.fill', android: 'play_arrow' },
  pause: { ios: 'pause.fill', android: 'pause' },
  step: { ios: 'forward.frame.fill', android: 'skip_next' },
  settings: { ios: 'gearshape.fill', android: 'settings' },
  dev: { ios: 'hammer.fill', android: 'construction' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  download: { ios: 'square.and.arrow.down', android: 'download' },
  trash: { ios: 'trash', android: 'delete' },
  refresh: { ios: 'arrow.clockwise', android: 'refresh' },
  sensors: { ios: 'sensor.fill', android: 'sensors' },
  hub: { ios: 'point.3.connected.trianglepath.dotted', android: 'hub' },
  bubbles: { ios: 'bubbles.and.sparkles.fill', android: 'bubble_chart' },
  visibility: { ios: 'eye.fill', android: 'visibility' },
  route: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route' },
  light: { ios: 'lightbulb.fill', android: 'lightbulb' },
  noise: { ios: 'speaker.wave.3.fill', android: 'campaign' },
  location: { ios: 'mappin.circle.fill', android: 'location_on' },
  timer: { ios: 'timer', android: 'schedule' },
  voice: { ios: 'waveform', android: 'record_voice_over' },
  air: { ios: 'wind', android: 'air' },
  battery: { ios: 'battery.75percent', android: 'battery_charging_full' },
  doubleDown: { ios: 'chevron.down.2', android: 'keyboard_double_arrow_down' },
  graphic: { ios: 'waveform.path.ecg', android: 'graphic_eq' },
  palette: { ios: 'paintpalette.fill', android: 'palette' },
  volunteer: { ios: 'hand.raised.fill', android: 'volunteer_activism' },
  explore: { ios: 'safari.fill', android: 'explore' },
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'minus', android: 'remove' },
} as const satisfies Record<string, Pair>;

export type IconName = keyof typeof ICONS;

export function isIconName(v: string): v is IconName {
  return v in ICONS;
}

interface Props {
  name: IconName;
  size?: number;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
}

export function Icon({ name, size = 20, color = colors.text, style }: Props) {
  const pair = ICONS[name];
  return (
    <SymbolView
      name={{ ios: pair.ios, android: pair.android, web: pair.android }}
      size={size}
      tintColor={color}
      style={[{ width: size, height: size }, style]}
      type="monochrome"
    />
  );
}

// Iconos semánticos del dominio (recuerdos, rasgos, juegos) → Icon
export function iconFor(key: string, fallback: IconName = 'sparkle'): IconName {
  return isIconName(key) ? key : fallback;
}
