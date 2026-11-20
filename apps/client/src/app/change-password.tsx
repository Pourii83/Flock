import { useRef, useState } from 'react';
import { Pressable, type TextInputInstance } from 'react-native';

import { AuthCard, AuthLayout } from '@/components/auth-layout';
import { Button, Field, Icon } from '@/components/ui';
import { t } from '@/lib/i18n';
import { useAuth } from '@/state/auth';
import { colors } from '@/theme';

/** An account the admin made with "change password after first sign-in" lands here before anything else. */
export default function ChangePasswordScreen() {
  const { user, changePassword, logout } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nextRef = useRef<TextInputInstance>(null);
  const repeatRef = useRef<TextInputInstance>(null);

  const submit = async () => {
    if (!current || !next) return setError(t('Fill in both passwords'));
    if (next.length < 6) return setError(t('Password must be at least 6 characters'));
    if (next !== repeat) return setError(t('The new passwords don’t match'));
    setBusy(true);
    setError(null);
    try {
      await changePassword(current, next);
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  };

  const eye = (
    <Pressable onPress={() => setShow((v) => !v)} hitSlop={8} accessibilityLabel={t('Toggle password visibility')}>
      <Icon name={show ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
    </Pressable>
  );

  return (
    <AuthLayout
      title={t('Choose your own password')}
      subtitle={t('{name}, your account was made by the server admin. Pick a new password to continue.', { name: user?.displayName ?? '' })}>
      <AuthCard badge={t('FIRST SIGN-IN')}>
        <Field
          label={t('Password you were given')}
          icon="key"
          placeholder="••••••••"
          secureTextEntry={!show}
          autoComplete="current-password"
          textContentType="password"
          value={current}
          onChangeText={setCurrent}
          returnKeyType="next"
          onSubmitEditing={() => nextRef.current?.focus()}
          right={eye}
        />
        <Field
          ref={nextRef}
          label={t('New password')}
          icon="lock"
          placeholder="••••••••"
          secureTextEntry={!show}
          autoComplete="new-password"
          textContentType="newPassword"
          value={next}
          onChangeText={setNext}
          returnKeyType="next"
          onSubmitEditing={() => repeatRef.current?.focus()}
        />
        <Field
          ref={repeatRef}
          label={t('Repeat new password')}
          icon="lock"
          placeholder="••••••••"
          secureTextEntry={!show}
          autoComplete="new-password"
          textContentType="newPassword"
          value={repeat}
          onChangeText={setRepeat}
          returnKeyType="go"
          onSubmitEditing={submit}
          error={error}
        />
        <Button title={t('Save and continue')} iconRight="arrow-right" size="lg" onPress={submit} loading={busy} />
      </AuthCard>
      <Button title={t('Sign out')} icon="log-out" variant="ghost" size="lg" onPress={() => void logout()} />
    </AuthLayout>
  );
}
