import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CATEGORIES, categoryOf } from '../lib/categories';
import { fonts, useColors } from '../lib/theme';
import { tr } from '../lib/i18n';

function CategoryChip({ slug, label, icon, active, count, onPress }: {
  slug: string; label: string; icon?: React.ComponentProps<typeof Ionicons>['name']; active: boolean; count?: number; onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      key={slug}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.chip, {
        backgroundColor: active ? c.accent : c.surface,
        borderColor: active ? c.accent : c.border,
        opacity: pressed ? 0.75 : 1,
      }]}
    >
      {icon ? <Ionicons name={icon} size={15} color={active ? c.accentText : c.accent} /> : null}
      <Text style={[styles.label, { color: active ? c.accentText : c.text }]}>{label}</Text>
      {count ? <Text style={[styles.count, { color: active ? c.accentText : c.muted }]}>{count}</Text> : null}
    </Pressable>
  );
}

// 瀏覽用：橫向捲動的分類列，第一個是「全部」
export function CategoryFilter({ value, counts, onChange }: { value: string; counts?: Record<string, number>; onChange: (slug: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      <CategoryChip slug="" label={tr('全部', 'All')} icon="sparkles-outline" active={!value} onPress={() => onChange('')} />
      {CATEGORIES.map((cat) => (
        <CategoryChip
          key={cat.slug}
          slug={cat.slug}
          label={cat.label}
          icon={cat.icon}
          count={counts?.[cat.slug]}
          active={value === cat.slug}
          onPress={() => onChange(value === cat.slug ? '' : cat.slug)}
        />
      ))}
    </ScrollView>
  );
}

// 分享／編輯用：可複選，最多 max 個
export function CategoryPicker({ value, max, onChange }: { value: string[]; max: number; onChange: (slugs: string[]) => void }) {
  return (
    <View style={styles.wrap}>
      {CATEGORIES.map((cat) => {
        const active = value.includes(cat.slug);
        return (
          <CategoryChip
            key={cat.slug}
            slug={cat.slug}
            label={cat.label}
            icon={cat.icon}
            active={active}
            onPress={() => {
              if (active) onChange(value.filter((s) => s !== cat.slug));
              else if (value.length < max) onChange([...value, cat.slug]);
            }}
          />
        );
      })}
    </View>
  );
}

// 貼文上的分類標籤（點了到探索頁看同類作品）
export function CategoryBadges({ slugs, other, onPress }: { slugs: string[]; other?: string; onPress: (slug: string) => void }) {
  const c = useColors();
  return (
    <View style={styles.wrap}>
      {slugs.map((slug) => {
        const cat = categoryOf(slug);
        if (!cat) return null;
        return (
          <Pressable key={slug} onPress={() => onPress(slug)} style={[styles.badge, { borderColor: c.border, backgroundColor: c.surface }]} accessibilityRole="link">
            <Ionicons name={cat.icon} size={13} color={c.accent} />
            <Text style={{ color: c.text, fontSize: 12, fontWeight: '600' }}>{slug === 'other' && other ? other : cat.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, borderWidth: 1 },
  label: { fontSize: 13, fontWeight: '700' },
  count: { fontSize: 12, fontFamily: fonts.mono },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, borderWidth: 1 },
});
