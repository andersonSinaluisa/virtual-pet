/*
 * Tipografía (DESIGN.md): Quicksand para títulos y labels, Nunito Sans para
 * cuerpo y diálogo. 1rem = 16px. En RN no hay "font-weight" sobre una sola
 * familia de Google Fonts: cada peso es una familia.
 */
import type { TextStyle } from 'react-native';

import { NunitoSans_400Regular } from '@expo-google-fonts/nunito-sans/400Regular';
import { NunitoSans_400Regular_Italic } from '@expo-google-fonts/nunito-sans/400Regular_Italic';
import { NunitoSans_600SemiBold } from '@expo-google-fonts/nunito-sans/600SemiBold';
import { NunitoSans_700Bold } from '@expo-google-fonts/nunito-sans/700Bold';
import { Quicksand_500Medium } from '@expo-google-fonts/quicksand/500Medium';
import { Quicksand_600SemiBold } from '@expo-google-fonts/quicksand/600SemiBold';
import { Quicksand_700Bold } from '@expo-google-fonts/quicksand/700Bold';

export const fontAssets = {
  Quicksand_500Medium,
  Quicksand_600SemiBold,
  Quicksand_700Bold,
  NunitoSans_400Regular,
  NunitoSans_400Regular_Italic,
  NunitoSans_600SemiBold,
  NunitoSans_700Bold,
};

export const fonts = {
  headingMedium: 'Quicksand_500Medium',
  headingSemi: 'Quicksand_600SemiBold',
  heading: 'Quicksand_700Bold',
  body: 'NunitoSans_400Regular',
  bodyItalic: 'NunitoSans_400Regular_Italic',
  bodySemi: 'NunitoSans_600SemiBold',
  bodyBold: 'NunitoSans_700Bold',
} as const;

export const typography = {
  displayLg: { fontFamily: fonts.heading, fontSize: 36, lineHeight: 44, letterSpacing: -0.36 },
  headlineLg: { fontFamily: fonts.heading, fontSize: 26, lineHeight: 34 },
  headlineMd: { fontFamily: fonts.headingSemi, fontSize: 22, lineHeight: 28 },
  headlineSm: { fontFamily: fonts.headingSemi, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.body, fontSize: 18, lineHeight: 28 },
  bodyMd: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24 },
  bodySm: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodyXs: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  labelLg: { fontFamily: fonts.heading, fontSize: 16, lineHeight: 20, letterSpacing: 0.16 },
  labelMd: { fontFamily: fonts.headingSemi, fontSize: 14, lineHeight: 18, letterSpacing: 0.28 },
  labelSm: { fontFamily: fonts.heading, fontSize: 12, lineHeight: 16, letterSpacing: 0.36 },
  labelXs: { fontFamily: fonts.heading, fontSize: 10, lineHeight: 13, letterSpacing: 0.6 },
  thought: { fontFamily: fonts.bodyItalic, fontSize: 15, lineHeight: 22 },
} satisfies Record<string, TextStyle>;

export type TypographyVariant = keyof typeof typography;
