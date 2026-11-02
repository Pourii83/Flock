import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { View, type TextInputInstance } from 'react-native';

import { AuthCard, AuthLayout } from '@/components/auth-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { Button, Field, T } from '@/components/ui';
import { isInstalledApp } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { colors } from '@/theme';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const server = useServerField();
  const usernameRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);

  const usernameError = username && !USERNAME_RE.test(username) ? '3–24 letters, numbers, _ or .' : null;

  const submit = async () => {
    if (!displayName.trim()) return setError('Tell your flock your name');
    if (!USERNAME_RE.test(username)) return setError('Pick a valid username');
    if (password.length < 6) return setError('Password must be at least 6 characters');
    setBusy(true);
    setError(null);
    try {
      if (isInstalledApp) await server.apply();
      await register(username, displayName, password);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Join Flock" subtitle="Create your account in a few seconds">
      <AuthCard badge="CREATE ACCOUNT">
        {isInstalledApp && <ServerField field={server} />}
        <Field
          label="Your name"
          icon="user"
          placeholder="Maya Lin"
          autoComplete="name"
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
        />
        <Field
          ref={usernameRef}
          label="Username"
          icon="at-sign"
          placeholder="maya.lin"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username-new"
          value={username}
          onChangeText={setUsername}
          error={usernameError}
          returnKeyType="next"
          onSubmitEditing={() => passwordRef.current?.focus()}
        />
        <Field
          ref={passwordRef}
          label="Password"
          icon="lock"
          placeholder="At least 6 characters"
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        <Button title="Create account" iconRight="arrow-right" size="lg" onPress={submit} loading={busy} />
      </AuthCard>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <T variant="body" color={colors.textMuted}>
          Already have an account?
        </T>
        <Link href="/login">
          <T variant="labelLg" color={colors.amber}>
            Sign in
          </T>
        </Link>
      </View>
    </AuthLayout>
  );
}
