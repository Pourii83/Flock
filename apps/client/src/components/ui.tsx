import Feather from '@expo/vector-icons/Feather';
import { forwardRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputInstance,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { isRTL, t } from '@/lib/i18n';
import { colors, fonts, radius, type, type TypeVariant } from '@/theme';

// Web-only: hide the browser focus ring on inputs (we draw our own).
export const noOutline = { outlineStyle: 'none' } as unknown as TextStyle;

// ---------- text ----------

export function T({
  variant = 'body',
  color = colors.text,
  style,
  ...rest
}: TextProps & { variant?: TypeVariant; color?: string }) {
  return <Text {...rest} style={[type[variant], { color }, style]} />;
}

// ---------- icons ----------

export type IconName = ComponentProps<typeof Feather>['name'];

// Icons that point "forward/backward" and must mirror in right-to-left layouts.
const DIRECTIONAL = new Set<IconName>(['arrow-left', 'arrow-right', 'chevron-left', 'chevron-right', 'send', 'corner-up-left', 'log-out', 'arrow-up-right', 'arrow-down-left']);

export function Icon({ name, size = 20, color = colors.text }: { name: IconName; size?: number; color?: string }) {
  const mirror = isRTL() && DIRECTIONAL.has(name);
  return <Feather name={name} size={size} color={color} style={mirror ? { transform: [{ scaleX: -1 }] } : undefined} />;
}

/** Circular / rounded icon button with press + hover feedback. */
export function IconButton({
  name,
  onPress,
  size = 40,
  iconSize = 20,
  color = colors.text,
  bg = 'transparent',
  activeBg = colors.surfaceHigh,
  label,
  style,
  disabled,
  rounded = 'pill',
}: {
  name: IconName;
  onPress?: () => void;
  size?: number;
  iconSize?: number;
  color?: string;
  bg?: string;
  activeBg?: string;
  label: string;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
  rounded?: 'pill' | 'lg';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed, hovered }: any) => [
        {
          width: size,
          height: size,
          borderRadius: rounded === 'pill' ? radius.pill : radius.lg,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed || hovered ? activeBg : bg,
          opacity: disabled ? 0.4 : 1,
        },
        style,
      ]}>
      <Icon name={name} size={iconSize} color={color} />
    </Pressable>
  );
}

// ---------- buttons ----------

type ButtonVariant = 'primary' | 'ghost' | 'danger' | 'subtle';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  iconRight,
  loading,
  disabled,
  style,
  size = 'md',
  trailing,
}: {
  title: string;
  onPress?: PressableProps['onPress'];
  variant?: ButtonVariant;
  icon?: IconName;
  iconRight?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'sm' | 'md' | 'lg';
  trailing?: ReactNode;
}) {
  const palette = {
    primary: { bg: colors.amber, fg: colors.onAmber, border: colors.amber },
    ghost: { bg: 'rgba(22, 29, 42, 0.8)', fg: colors.text, border: colors.surfaceHigh },
    danger: { bg: colors.danger, fg: colors.text, border: colors.danger },
    subtle: { bg: 'transparent', fg: colors.amber, border: 'transparent' },
  }[variant];
  const height = { sm: 36, md: 48, lg: 56 }[size];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed, hovered }: any) => [
        {
          height,
          paddingHorizontal: size === 'sm' ? 16 : 24,
          borderRadius: radius.pill,
          backgroundColor: palette.bg,
          borderWidth: 1,
          borderColor: palette.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        },
        variant === 'primary' && {
          shadowColor: colors.amber,
          shadowOpacity: hovered ? 0.45 : 0.3,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <>
          {icon && <Icon name={icon} size={size === 'sm' ? 16 : 18} color={palette.fg} />}
          <T variant={size === 'sm' ? 'label' : 'labelLg'} color={palette.fg} style={size === 'lg' && { fontSize: 17 }}>
            {title}
          </T>
          {iconRight && <Icon name={iconRight} size={18} color={palette.fg} />}
          {trailing}
        </>
      )}
    </Pressable>
  );
}

// ---------- inputs ----------

export const Field = forwardRef<
  TextInputInstance,
  TextInputProps & { label?: string; icon?: IconName; error?: string | null; right?: ReactNode }
>(function Field({ label, icon, error, right, style, onFocus, onBlur, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 8 }}>
      {label && (
        <T variant="labelLg" color={colors.text}>
          {label}
        </T>
      )}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.canvas,
          borderRadius: radius.lg,
          borderWidth: 1.5,
          borderColor: error ? colors.danger : focused ? colors.amber : 'transparent',
          paddingHorizontal: 16,
          height: 56,
          gap: 12,
        }}>
        {icon && <Icon name={icon} size={18} color={focused ? colors.amber : colors.textMuted} />}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textDim}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            { flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.medium, fontSize: 16, height: '100%' },
            noOutline,
            style,
          ]}
          {...rest}
        />
        {right}
      </View>
      {!!error && (
        <T variant="bodySm" color={colors.danger}>
          {error}
        </T>
      )}
    </View>
  );
});

export function SearchBar({
  value,
  onChangeText,
  placeholder,
  shortcut,
  right,
  style,
  autoFocus,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  shortcut?: string;
  right?: ReactNode;
  style?: StyleProp<ViewStyle>;
  autoFocus?: boolean;
}) {
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
          paddingHorizontal: 14,
          height: 44,
        },
        style,
      ]}>
      <Icon name="search" size={17} color={colors.textMuted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoFocus={autoFocus}
        autoCapitalize="none"
        style={[{ flex: 1, minWidth: 0, color: colors.text, fontFamily: fonts.regular, fontSize: 14, height: '100%' }, noOutline]}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')} accessibilityLabel={t('Clear search')} hitSlop={8}>
          <Icon name="x" size={16} color={colors.textMuted} />
        </Pressable>
      )}
      {!value && shortcut && (
        <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
          <T variant="labelSm" color={colors.textMuted}>
            {shortcut}
          </T>
        </View>
      )}
      {right}
    </View>
  );
}

// ---------- small pieces ----------

export function Pill({
  children,
  color = colors.textMuted,
  bg = colors.surface,
  style,
}: {
  children: ReactNode;
  color?: string;
  bg?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' }, style]}>
      <T variant="label" color={color}>
        {children}
      </T>
    </View>
  );
}

export function UnreadBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (!count) return null;
  return (
    <View
      style={[
        {
          minWidth: 20,
          height: 20,
          paddingHorizontal: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.amber,
          alignItems: 'center',
          justifyContent: 'center',
        },
        style,
      ]}>
      <T variant="label" color={colors.canvas} style={{ fontSize: 11, fontVariant: ['tabular-nums'] }}>
        {count > 99 ? '99+' : count}
      </T>
    </View>
  );
}

export function Chip({
  label,
  active,
  onPress,
  count,
  dot,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  count?: number;
  dot?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered }: any) => ({
        height: 32,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: active ? colors.amber : hovered ? colors.surfaceHigh : colors.surface,
      })}>
      <T variant="label" color={active ? colors.canvas : colors.textMuted}>
        {label}
        {count !== undefined ? ` (${count})` : ''}
      </T>
      {dot && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.amber }} />}
    </Pressable>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: colors.surfaceHigh,
          padding: 16,
        },
        style,
      ]}>
      {children}
    </View>
  );
}

export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
      <T variant="overline" color={colors.textMuted} style={{ textTransform: 'uppercase' }}>
        {children}
      </T>
      {right}
    </View>
  );
}
