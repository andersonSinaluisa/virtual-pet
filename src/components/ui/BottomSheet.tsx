/*
 * Bottom sheet (DESIGN.md → Sheet Architecture): los menús suben como
 * hojas flotantes en lugar de pantallas opacas, así el jugador sigue viendo
 * a su mascota. Modal nativo transparente + panel con radio 32 y asa.
 */
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, shadows, spacing } from '@/theme';

import { IconButton } from './Buttons';
import { Text } from './Text';

interface Props {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function BottomSheet({ visible, onClose, title, subtitle, children }: Props) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.fill}>
        <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Cerrar" />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.md }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.titles}>
              <Text variant="headlineMd">{title}</Text>
              {subtitle ? <Text variant="bodySm" color={colors.textMuted}>{subtitle}</Text> : null}
            </View>
            <IconButton icon="close" label="Cerrar" size={40} bg={colors.surfaceContainerHigh} color={colors.text} onPress={onClose} />
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.scrim },
  sheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: spacing.sm, maxHeight: '85%', ...shadows.float },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: colors.outlineVariant, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.margin, gap: spacing.md, marginBottom: spacing.sm },
  titles: { flex: 1 },
  scroll: { flexGrow: 0 },
  content: { paddingHorizontal: spacing.margin, paddingBottom: spacing.md, gap: spacing.md },
});
