import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { forwardRef, useRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type TextInputProps,
  type ViewProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { tap as hapticTap } from '@/lib/haptics';
import { useTheme } from '@/lib/theme';

/* -------- Screen -------- */
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const { c } = useTheme();
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: c.background }]}>
      <Inner
        style={styles.flex}
        contentContainerStyle={padded ? { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 120 } : undefined}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

/* -------- Card -------- */
export function Card({ children, style, elevated = false, ...rest }: ViewProps & { children: ReactNode; elevated?: boolean }) {
  const { c, scheme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: elevated ? (c as any).backgroundElevated ?? c.card : c.card,
          borderColor: c.border,
        },
        scheme === 'light' ? styles.cardShadowLight : styles.cardShadowDark,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

/* -------- Typography -------- */
export function H1({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.h1, { color: c.text }]}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.h2, { color: c.text }]}>{children}</Text>;
}
export function Display({ children, style }: { children: ReactNode; style?: any }) {
  const { c } = useTheme();
  return <Text style={[styles.display, { color: c.text }, style]}>{children}</Text>;
}
export function Eyebrow({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.eyebrow, { color: c.textSubtle }]}>{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: any }) {
  const { c } = useTheme();
  return <Text style={[styles.p, { color: muted ? c.textMuted : c.text }, style]}>{children}</Text>;
}
export function Caption({ children, style }: { children: ReactNode; style?: any }) {
  const { c } = useTheme();
  return <Text style={[styles.caption, { color: c.textMuted }, style]}>{children}</Text>;
}

/* -------- Button -------- */
interface BtnProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  icon?: SymbolViewProps['name'];
}
export function Button({ title, variant = 'primary', loading, icon, style, disabled, onPress, ...rest }: BtnProps) {
  const { c, brand } = useTheme();
  const bg =
    variant === 'primary' ? brand : variant === 'danger' ? c.danger : variant === 'secondary' ? (c as any).cardMuted ?? c.card : 'transparent';
  const fg = variant === 'ghost' || variant === 'secondary' ? c.text : '#fff';
  const border = variant === 'secondary' ? c.border : 'transparent';
  const scale = useRef(new Animated.Value(1)).current;
  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, tension: 300, friction: 10 }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        disabled={disabled || loading}
        onPress={(e) => { hapticTap(); onPress?.(e); }}
        onPressIn={() => spring(0.96)}
        onPressOut={() => spring(1)}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0, opacity: pressed || disabled ? 0.86 : 1 },
          style as any,
        ]}
        {...rest}
      >
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {icon && <SymbolView name={icon} tintColor={fg} size={18} />}
            <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

/* -------- Input -------- */
export const Input = forwardRef<TextInput, TextInputProps & { label?: string }>(function Input(
  { label, style, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 14 }}>
      {label ? <Text style={[styles.label, { color: c.textSubtle }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.textSubtle}
        style={[styles.input, { backgroundColor: (c as any).cardMuted ?? c.card, borderColor: c.border, color: c.text }, style]}
        {...rest}
      />
    </View>
  );
});

/* -------- StatRow -------- */
export function StatRow({ label, value, icon }: { label: string; value: string; icon?: SymbolViewProps['name'] }) {
  const { c, brand } = useTheme();
  return (
    <View style={styles.statRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        {icon && <SymbolView name={icon} tintColor={brand} size={20} />}
        <Text style={[styles.p, { color: c.textMuted }]}>{label}</Text>
      </View>
      <Text style={[styles.statValue, { color: c.text }]}>{value}</Text>
    </View>
  );
}

/* -------- Empty -------- */
export function Empty({ icon, title, subtitle }: { icon: SymbolViewProps['name']; title: string; subtitle?: string }) {
  const { c, brand } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={{ backgroundColor: (c as any).cardMuted ?? c.card, padding: 20, borderRadius: 999, marginBottom: 16 }}>
        <SymbolView name={icon} tintColor={brand} size={40} />
      </View>
      <Text style={[styles.h2, { color: c.text }]}>{title}</Text>
      {subtitle && <Text style={[styles.p, { color: c.textMuted, textAlign: 'center', marginTop: 6 }]}>{subtitle}</Text>}
    </View>
  );
}

/* -------- Skeleton -------- */
export function Skeleton({ width, height, radius = 8, style }: { width: number | string; height: number; radius?: number; style?: any }) {
  const { c } = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;
  useRef(
    (() => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        ]),
      ).start();
      return null;
    })(),
  );
  return <Animated.View style={[{ width: width as any, height, borderRadius: radius, backgroundColor: (c as any).cardMuted ?? c.card, opacity }, style]} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: {
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 14,
  },
  cardShadowLight: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.06,
        shadowRadius: 16,
      },
      android: { elevation: 3 },
    }),
  },
  cardShadowDark: {
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.35,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
    }),
  },
  display: { fontSize: 56, fontWeight: '800', letterSpacing: -1.5, lineHeight: 60 },
  h1: { fontSize: 30, fontWeight: '800', letterSpacing: -0.6, marginBottom: 4 },
  h2: { fontSize: 20, fontWeight: '700', letterSpacing: -0.2, marginBottom: 8 },
  eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 6 },
  p: { fontSize: 15, lineHeight: 22 },
  caption: { fontSize: 13, lineHeight: 18 },
  btn: {
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  btnText: { fontSize: 16, fontWeight: '700', letterSpacing: -0.1 },
  label: { fontSize: 12, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    fontSize: 16,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
});
