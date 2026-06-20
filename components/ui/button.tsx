import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
  type TextStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAppTheme } from '@/context/ThemeContext';
import { useResponsive } from '@/hooks/useResponsive';
import { Radius, FontSize, FontWeight, Spacing } from '@/constants/spacing';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  iconPosition?: 'left' | 'right';
  style?: ViewStyle;
  textStyle?: TextStyle;
  fullWidth?: boolean;
  accessibilityLabel?: string;
}

export function Button({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  icon,
  iconPosition = 'left',
  style,
  textStyle,
  fullWidth = true,
  accessibilityLabel,
}: ButtonProps) {
  const { colors } = useAppTheme();
  const { s } = useResponsive();

  const bg = variant === 'primary' ? colors.accentStrong
    : variant === 'secondary' ? colors.surfaceAlt
    : variant === 'danger' ? colors.danger + '18'
    : 'transparent';

  const txt = variant === 'primary' ? colors.onAccent
    : variant === 'secondary' ? colors.text
    : variant === 'danger' ? colors.danger
    : colors.accent;

  const border = variant === 'secondary' ? colors.border
    : variant === 'ghost' ? colors.accent + '40'
    : 'transparent';

  return (
    <TouchableOpacity
      style={[
        styles.base,
        {
          backgroundColor: bg,
          borderColor: border,
          borderRadius: s(Radius.md),
          paddingVertical: s(Spacing.md + 2),
          opacity: disabled || loading ? 0.5 : 1,
          gap: s(Spacing.sm),
          borderWidth: variant === 'primary' ? 0 : 1.5,
        },
        fullWidth && styles.fullWidth,
        style,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      disabled={disabled || loading}
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
    >
      {loading ? (
        <ActivityIndicator size="small" color={txt} />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <Ionicons name={icon} size={s(FontSize.bodyLarge)} color={txt} />
          )}
          <Text
            style={[
              styles.text,
              { color: txt, fontSize: s(FontSize.body) },
              textStyle,
            ]}
          >
            {title}
          </Text>
          {icon && iconPosition === 'right' && (
            <Ionicons name={icon} size={s(FontSize.bodyLarge)} color={txt} />
          )}
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: {
    width: '100%',
  },
  text: {
    fontWeight: FontWeight.bold,
  },
});
