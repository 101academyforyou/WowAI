import { ActivityIndicator, ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { useColors } from '../lib/theme';
import type { User } from '../lib/api';

export function Button({
  title, onPress, variant = 'secondary', disabled, loading, style,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : c.surface2;
  const fg = variant === 'primary' ? '#fff' : variant === 'danger' ? c.danger : c.text;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: variant === 'primary' ? bg : c.border, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Avatar({ user, size = 34 }: { user: Pick<User, 'username' | 'displayName'>; size?: number }) {
  const c = useColors();
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.accent2 }]}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.42 }}>
        {(user.displayName || user.username).slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? c.accent : `${c.accent}22` }]}
    >
      <Text style={{ color: active ? '#fff' : c.accent, fontWeight: '600', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, message, children }: { title?: string; message?: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      {title ? <Text style={[styles.emptyTitle, { color: c.text }]}>{title}</Text> : null}
      {message ? <Text style={{ color: c.muted, textAlign: 'center', lineHeight: 21 }}>{message}</Text> : null}
      {children}
    </View>
  );
}

export function Loading() {
  const c = useColors();
  return <ActivityIndicator style={{ marginTop: 48 }} color={c.accent} />;
}

// iOS 用原生的 Action Sheet，其他平台退回 Alert / confirm
export function chooseOption(title: string, options: string[], { destructiveIndex }: { destructiveIndex?: number } = {}): Promise<number | null> {
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...options, '取消'], cancelButtonIndex: options.length, destructiveButtonIndex: destructiveIndex },
        (i) => resolve(i === options.length ? null : i),
      );
    } else if (Platform.OS === 'web') {
      const answer = globalThis.prompt?.(`${title}\n${options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`);
      const i = Number(answer) - 1;
      resolve(Number.isInteger(i) && i >= 0 && i < options.length ? i : null);
    } else {
      Alert.alert(title, undefined, [
        ...options.map((o, i) => ({ text: o, onPress: () => resolve(i) })),
        { text: '取消', style: 'cancel' as const, onPress: () => resolve(null) },
      ]);
    }
  });
}

export function confirmAction(title: string, message: string, confirmText: string): Promise<boolean> {
  if (Platform.OS === 'web') return Promise.resolve(Boolean(globalThis.confirm?.(`${title}\n${message}`)));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') globalThis.alert?.(message ? `${title}\n${message}` : title);
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  button: { minHeight: 44, borderRadius: 10, borderWidth: 1, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '700', fontSize: 15 },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
});
