import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';

import { AuthCard, AuthLayout } from '@/components/auth-layout';
import { Button, Field, Icon, T } from '@/components/ui';
import { useAuth } from '@/state/auth';
import { colors } from '@/theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const passwordRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    if (!username.trim() || !password) return setError('Enter your username and password');
    setBusy(true);
    setError(null);
    try {
      await login(username, password);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Welcome back to Flock" subtitle="Sign in to pick up right where you left off">
      <AuthCard badge="FAST LOGIN">
        <Field
          label="Username"
          icon="at-sign"
          placeholder="your.username"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          value={username}
          onChangeText={setUsername}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Password"
          icon="lock"
          placeholder="••••••••"
          secureTextEntry={!showPassword}
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
          right={
            <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityLabel="Toggle password visibility">
              <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
            </Pressable>
          }
        />
        <Button title="Continue" iconRight="arrow-right" size="lg" onPress={submit} loading={busy} />
      </AuthCard>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceHigh }} />
        <T variant="overline" color={colors.textMuted}>
          NEW TO FLOCK?
        </T>
        <View style={{ flex: 1, height: 1, backgroundColor: colors.surfaceHigh }} />
      </View>

      <Link href="/register" asChild>
        <Button title="Create an account" icon="user-plus" variant="ghost" size="lg" />
      </Link>
    </AuthLayout>
  );
}
