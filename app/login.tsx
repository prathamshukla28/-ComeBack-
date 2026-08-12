import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

export default function LoginScreen() {
  const { c, brand } = useTheme();
  const { signIn, signUp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email || !password) {
      Alert.alert('Missing info', 'Enter both email and password.');
      return;
    }
    setBusy(true);
    try {
      const { error } =
        mode === 'in' ? await signIn(email, password) : await signUp(email, password);
      if (error) {
        Alert.alert(mode === 'in' ? 'Sign-in failed' : 'Sign-up failed', error);
      }
    } catch (e: any) {
      Alert.alert(
        'Network error',
        e?.message ?? 'Could not reach Supabase. Check your .env and internet.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: c.background }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <View style={styles.container}>
          <Text style={[styles.brand, { color: brand }]}>ComeBack</Text>
          <Text style={[styles.tagline, { color: c.textMuted }]}>
            Track everything. Come back stronger.
          </Text>

          <View style={{ height: 40 }} />

          <TextInput
            placeholder="Email"
            placeholderTextColor={c.textMuted}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            style={[
              styles.input,
              { backgroundColor: c.card, borderColor: c.border, color: c.text },
            ]}
          />
          <TextInput
            placeholder="Password"
            placeholderTextColor={c.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete="password"
            style={[
              styles.input,
              { backgroundColor: c.card, borderColor: c.border, color: c.text },
            ]}
          />

          <Pressable
            onPress={submit}
            disabled={busy}
            style={({ pressed }) => [
              styles.btn,
              { backgroundColor: brand, opacity: pressed || busy ? 0.7 : 1 },
            ]}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>{mode === 'in' ? 'Sign in' : 'Create account'}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setMode(mode === 'in' ? 'up' : 'in')} style={styles.switchWrap}>
            <Text style={[styles.switch, { color: c.textMuted }]}>
              {mode === 'in' ? 'New here? Create an account' : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, justifyContent: 'center' },
  brand: { fontSize: 48, fontWeight: '800', letterSpacing: -1 },
  tagline: { fontSize: 15, marginTop: 4 },
  input: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    marginBottom: 12,
  },
  btn: {
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  switchWrap: { alignItems: 'center', marginTop: 20 },
  switch: { fontSize: 14 },
});
