import { ActivityIndicator, ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { fonts, glow, useColors } from '../lib/theme';
import { Image } from 'expo-image';
import { mediaUri, type User } from '../lib/api';

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
  const bg = variant === 'primary' ? c.accent : c.surface;
  const fg = variant === 'primary' ? c.accentText : variant === 'danger' ? c.danger : c.text;
  const border = variant === 'primary' ? c.accent : variant === 'danger' ? `${c.danger}88` : c.border;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        variant === 'primary' && !disabled ? glow(c.accent) : null,
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>}
    </Pressable>
  );
}

export function Avatar({ user, size = 34 }: { user: Pick<User, 'username' | 'displayName' | 'avatarUrl'>; size?: number }) {
  const c = useColors();
  const circle = { width: size, height: size, borderRadius: size / 2 };
  if (user.avatarUrl) {
    return (
      <Image
        source={{ uri: mediaUri(user.avatarUrl) }}
        style={[circle, styles.avatar, { borderColor: c.accent, backgroundColor: c.surface2 }]}
        contentFit="cover"
        accessibilityLabel={`${user.username} 的大頭貼`}
      />
    );
  }
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: c.surface2, borderColor: c.accent }]}>
      <Text style={{ color: c.accent, fontWeight: '700', fontSize: size * 0.42, fontFamily: fonts.mono }}>
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
      style={[styles.chip, { backgroundColor: active ? c.accent : `${c.accent}12`, borderColor: active ? c.accent : `${c.accent}55` }]}
    >
      <Text style={{ color: active ? c.accentText : c.accent, fontWeight: '700', fontSize: 12, fontFamily: fonts.mono }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ title, message, children }: { title?: string; message?: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={styles.empty}>
      {title ? <Text style={[styles.emptyTitle, { color: c.text, fontFamily: fonts.mono }]}>{title}</Text> : null}
      {message ? <Text style={{ color: c.muted, textAlign: 'center', lineHeight: 21 }}>{message}</Text> : null}
      {children}
    </View>
  );
}

// YourWow + 霓虹青色的 AI + 閃爍游標
export function Logo({ size = 26 }: { size?: number }) {
  const c = useColors();
  return (
    <Text style={{ fontSize: size, fontWeight: '800', color: c.text, fontFamily: fonts.mono, letterSpacing: -0.5 }}>
      YourWow<Text style={[{ color: c.accent }, { textShadowColor: c.accent, textShadowRadius: 12 }]}>AI</Text>
      <Text style={{ color: c.accent2 }}>_</Text>
    </Text>
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
  button: { minHeight: 44, borderRadius: 8, borderWidth: 1, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
});
