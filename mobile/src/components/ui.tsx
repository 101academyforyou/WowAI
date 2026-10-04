import { useEffect, useState } from 'react';
import { ActivityIndicator, ActionSheetIOS, Alert, Modal, Platform, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import { fonts, glow, useColors } from '../lib/theme';
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

export function Avatar({ user, size = 34 }: { user: Pick<User, 'username' | 'displayName'>; size?: number }) {
  const c = useColors();
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
// ---- 對話框：iPhone 用原生 Action Sheet／Alert，網頁版用 App 內的科技風對話框 ----

type DialogOption = { label: string; destructive?: boolean };
type DialogRequest = {
  title: string;
  message?: string;
  options: DialogOption[];
  cancelLabel: string | null;
  resolve: (index: number | null) => void;
};

let showWebDialog: ((req: DialogRequest) => void) | null = null;

function openWebDialog(req: Omit<DialogRequest, 'resolve'>): Promise<number | null> {
  return new Promise((resolve) => {
    if (showWebDialog) showWebDialog({ ...req, resolve });
    else resolve(null);
  });
}

// 放在 App 最外層，網頁版的對話框會顯示在這裡
export function DialogHost() {
  const c = useColors();
  const [req, setReq] = useState<DialogRequest | null>(null);
  useEffect(() => {
    showWebDialog = setReq;
    return () => {
      showWebDialog = null;
    };
  }, []);
  if (!req) return null;
  const close = (index: number | null) => {
    setReq(null);
    req.resolve(index);
  };
  return (
    <Modal transparent animationType="fade" visible onRequestClose={() => close(null)}>
      <Pressable style={styles.overlay} onPress={() => close(null)} accessibilityLabel="關閉">
        <Pressable style={[styles.dialog, { backgroundColor: c.surface, borderColor: c.border }, glow(c.accent, 18)]} onPress={() => {}}>
          <Text style={[styles.dialogTitle, { color: c.text }]}>{req.title}</Text>
          {req.message ? <Text style={{ color: c.muted, lineHeight: 21 }}>{req.message}</Text> : null}
          <View style={styles.dialogButtons}>
            {req.options.map((o, i) => (
              <Button key={o.label} title={o.label} variant={o.destructive ? 'danger' : 'primary'} onPress={() => close(i)} />
            ))}
            {req.cancelLabel ? <Button title={req.cancelLabel} onPress={() => close(null)} /> : null}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function chooseOption(title: string, options: string[], { destructiveIndex }: { destructiveIndex?: number } = {}): Promise<number | null> {
  if (Platform.OS === 'web') {
    return openWebDialog({
      title,
      options: options.map((label, i) => ({ label, destructive: i === destructiveIndex })),
      cancelLabel: '取消',
    });
  }
  return new Promise((resolve) => {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { title, options: [...options, '取消'], cancelButtonIndex: options.length, destructiveButtonIndex: destructiveIndex },
        (i) => resolve(i === options.length ? null : i),
      );
    } else {
      Alert.alert(title, undefined, [
        ...options.map((o, i) => ({ text: o, onPress: () => resolve(i) })),
        { text: '取消', style: 'cancel' as const, onPress: () => resolve(null) },
      ]);
    }
  });
}

export function confirmAction(title: string, message: string, confirmText: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return openWebDialog({ title, message, options: [{ label: confirmText, destructive: true }], cancelLabel: '取消' })
      .then((i) => i === 0);
  }
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: '取消', style: 'cancel', onPress: () => resolve(false) },
      { text: confirmText, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export function notify(title: string, message?: string) {
  if (Platform.OS === 'web') openWebDialog({ title, message, options: [{ label: '好' }], cancelLabel: null });
  else Alert.alert(title, message);
}

const styles = StyleSheet.create({
  button: { minHeight: 44, borderRadius: 8, borderWidth: 1, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  buttonText: { fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  avatar: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  chip: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 6, borderWidth: 1 },
  empty: { alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 10 },
  emptyTitle: { fontSize: 20, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  dialog: { width: '100%', maxWidth: 380, borderRadius: 12, borderWidth: 1, padding: 20, gap: 10 },
  dialogTitle: { fontSize: 17, fontWeight: '800', fontFamily: fonts.mono },
  dialogButtons: { gap: 8, marginTop: 8 },
});
