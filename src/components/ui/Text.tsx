import { Text as RNText, type TextProps } from 'react-native';

import { colors, typography, type TypographyVariant } from '@/theme';

interface Props extends TextProps {
  variant?: TypographyVariant;
  color?: string;
  align?: 'left' | 'center' | 'right';
  uppercase?: boolean;
}

export function Text({ variant = 'bodyMd', color = colors.text, align, uppercase, style, ...rest }: Props) {
  return (
    <RNText
      {...rest}
      style={[typography[variant], { color }, align ? { textAlign: align } : null, uppercase ? { textTransform: 'uppercase' } : null, style]}
    />
  );
}
