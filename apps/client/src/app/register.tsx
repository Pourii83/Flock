import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import { Pressable, View, type TextInputInstance } from 'react-native';

import { AuthCard, AuthLayout } from '@/components/auth-layout';
import { ServerField, useServerField } from '@/components/server-field';
import { Button, Field, Icon, T } from '@/components/ui';
import { isInstalledApp } from '@/lib/config';
import { useAuth } from '@/state/auth';
import { colors } from '@/theme';
import { t } from '@/lib/i18n';

const USERNAME_RE = /^[a-zA-Z0-9_.]{3,24}$/;

export default function RegisterScreen() {
  const { register } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const server = useServerField();
  const usernameRef = useRef<TextInputInstance>(null);
  const passwordRef = useRef<TextInputInstance>(null);
  const confirmRef = useRef<TextInputInstance>(null);

  const usernameError = username && !USERNAME_RE.test(username) ? t('3–24 letters, numbers, _ or .') : null;
  // Flag a mismatch once the confirmation is at least as long as the password.
  const confirmError = confirm && confirm.length >= password.length && confirm !== password ? t("Passwords don't match") : null;
  const eye = (
    <Pressable onPress={() => setShowPassword((v) => !v)} hitSlop={8} accessibilityLabel={t('Toggle password visibility')}>
      <Icon name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
    </Pressable>
  );

  const submit = async () => {
    if (!displayName.trim()) return setError(t('Tell your flock your name'));
    if (!USERNAME_RE.test(username)) return setError(t('Pick a valid username'));
    if (password.length < 6) return setError(t('Password must be at least 6 characters'));
    if (confirm !== password) return setError(t("Passwords don't match"));
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
    <AuthLayout title={t('Join Flock')} subtitle={t('Create your account in a few seconds')}>
      <AuthCard badge={t('CREATE ACCOUNT')}>
        {isInstalledApp && <ServerField field={server} />}
        <Field
          label={t('Your name')}
          icon="user"
          placeholder={t('Maya Lin')}
          autoComplete="name"
          value={displayName}
          onChangeText={setDisplayName}
          returnKeyType="next"
          onSubmitEditing={() => usernameRef.current?.focus()}
        />
        <Field
          ref={usernameRef}
          label={t('Username')}
          icon="at-sign"
          placeholder={t('maya.lin')}
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
          label={t('Password')}
          icon="lock"
          placeholder={t('At least 6 characters')}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          value={password}
          onChangeText={setPassword}
          returnKeyType="next"
          onSubmitEditing={() => confirmRef.current?.focus()}
          right={eye}
        />
        <Field
          ref={confirmRef}
          label={t('Confirm password')}
          icon="lock"
          placeholder={t('Repeat your password')}
          secureTextEntry={!showPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          value={confirm}
          onChangeText={setConfirm}
          returnKeyType="go"
          onSubmitEditing={submit}
          error={confirmError ?? error}
          right={eye}
        />
        <Button title={t('Create account')} iconRight="arrow-right" size="lg" onPress={submit} loading={busy} />
      </AuthCard>

      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}>
        <T variant="body" color={colors.textMuted}>
          {t('Already have an account?')}
        </T>
        <Link href="/login">
          <T variant="labelLg" color={colors.amber}>
            {t('Sign in')}
          </T>
        </Link>
      </View>
    </AuthLayout>
  );
}
