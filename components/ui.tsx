import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { forwardRef, type ReactNode } from 'react';
import {
  ActivityIndicator,
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
import { useTheme } from '@/lib/theme';

/* ------------------------- Screen ------------------------- */
export function Screen({ children, scroll = true, padded = true }: { children: ReactNode; scroll?: boolean; padded?: boolean }) {
  const { c } = useTheme();
  const Inner = scroll ? ScrollView : View;
  return (
    <SafeAreaView edges={['bottom']} style={[styles.flex, { backgroundColor: c.background }]}>
      <Inner
        style={styles.flex}
        contentContainerStyle={padded ? { padding: 20, paddingBottom: 60 } : undefined}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </Inner>
    </SafeAreaView>
  );
}

/* ------------------------- Card --------------------------- */
export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.border }, style]} {...rest}>
      {children}
    </View>
  );
}

/* ------------------------- Text --------------------------- */
export function H1({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.h1, { color: c.text }]}>{children}</Text>;
}
export function H2({ children }: { children: ReactNode }) {
  const { c } = useTheme();
  return <Text style={[styles.h2, { color: c.text }]}>{children}</Text>;
}
export function P({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: any }) {
  const { c } = useTheme();
  return <Text style={[styles.p, { color: muted ? c.textMuted : c.text }, style]}>{children}</Text>;
}

/* ------------------------- Button ------------------------- */
interface BtnProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  icon?: SymbolViewProps['name'];
}
export function Button({ title, variant = 'primary', loading, icon, style, disabled, ...rest }: BtnProps) {
  const { c, brand } = useTheme();
  const bg =
    variant === 'primary' ? brand : variant === 'danger' ? c.danger : variant === 'secondary' ? c.card : 'transparent';
  const fg = variant === 'ghost' || variant === 'secondary' ? c.text : '#fff';
  const border = variant === 'secondary' ? c.border : 'transparent';
  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === 'secondary' ? 1 : 0, opacity: pressed || disabled ? 0.7 : 1 },
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
  );
}

/* ------------------------- Input -------------------------- */
export const Input = forwardRef<TextInput, TextInputProps & { label?: string }>(function Input(
  { label, style, ...rest },
  ref,
) {
  const { c } = useTheme();
  return (
    <View style={{ marginBottom: 12 }}>
      {label ? <Text style={[styles.label, { color: c.textMuted }]}>{label}</Text> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.textMuted}
        style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }, style]}
        {...rest}
      />
    </View>
  );
});

/* ------------------------- Stat Row ----------------------- */
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

/* ------------------------- Empty -------------------------- */
export function Empty({ icon, title, subtitle }: { icon: SymbolViewProps['name']; title: string; subtitle?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.empty}>
      <SymbolView name={icon} tintColor={c.textMuted} size={48} />
      <Text style={[styles.h2, { color: c.text, marginTop: 12 }]}>{title}</Text>
      {subtitle && <Text style={[styles.p, { color: c.textMuted, textAlign: 'center', marginTop: 4 }]}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  h1: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  h2: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  p: { fontSize: 15, lineHeight: 22 },
  btn: { height: 50, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { height: 50, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 16 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10 },
  statValue: { fontSize: 18, fontWeight: '700' },
  empty: { alignItems: 'center', paddingVertical: 60, paddingHorizontal: 24 },
});
