import { useState } from 'react';
import { View } from 'react-native';

import { checkServer, normalizeServerUrl, setServerUrl, useServerUrl } from '@/lib/config';
import { colors } from '@/theme';
import { Field, T } from './ui';

/**
 * Server address input for installed apps (Android / desktop).
 * `apply()` validates the address, checks it is a reachable Flock server and saves it.
 */
export function useServerField() {
  const current = useServerUrl();
  const [value, setValue] = useState(current);
  const [checking, setChecking] = useState(false);

  const normalized = normalizeServerUrl(value);
  const changed = normalized !== current;

  /** Returns the saved URL; throws a user-facing error when invalid or unreachable. */
  const apply = async () => {
    if (!normalized) throw new Error('Enter a valid server address, e.g. https://chat.example.com');
    if (!changed) return normalized;
    setChecking(true);
    try {
      await checkServer(normalized);
    } finally {
      setChecking(false);
    }
    await setServerUrl(normalized);
    setValue(normalized);
    return normalized;
  };

  return { value, setValue, normalized, changed, checking, apply };
}

export function ServerField({
  field,
  label = 'Server address',
  hint = 'The address of your Flock server — ask whoever runs it.',
}: {
  field: ReturnType<typeof useServerField>;
  label?: string;
  hint?: string;
}) {
  return (
    <View style={{ gap: 6 }}>
      <Field
        label={label}
        icon="server"
        placeholder="https://chat.example.com"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        textContentType="URL"
        value={field.value}
        onChangeText={field.setValue}
      />
      <T variant="bodySm" color={field.value && !field.normalized ? colors.danger : colors.textDim}>
        {field.value && !field.normalized ? 'That doesn’t look like a valid address.' : hint}
      </T>
    </View>
  );
}
