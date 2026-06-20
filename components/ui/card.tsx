import { View, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Radius, Spacing } from '@/constants/spacing';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  bordered?: boolean;
}

export function Card({
  children,
  style,
  padded = true,
  bordered = true,
}: CardProps) {
  const { colors } = useAppTheme();
  const { s } = useResponsive();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: s(Radius.lg),
          borderWidth: bordered ? 1 : 0,
          borderColor: colors.border,
          padding: padded ? s(Spacing.xl) : 0,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
