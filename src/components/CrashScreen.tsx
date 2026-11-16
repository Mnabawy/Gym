// What a page shows when it crashed (expo-router `ErrorBoundary` export on the root layout, the tabs, tasks and goals).
// Kept minimal on purpose: no settings store, no storage read while drawing, no animation library — any of those could be
// what crashed. Colors are the fixed light/dark tokens; the error goes to the phone's error log (src/lib/errlog.ts).
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, useColorScheme, View, type TextStyle } from 'react-native';
import { router, type ErrorBoundaryProps } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import Constants from 'expo-constants';
import { font, warm, warmDark } from '../theme';
import { report } from '../lib/errlog';

function appVersion(): string {
  try {
    const c = Constants.expoConfig;
    return [c?.version, c?.android?.versionCode ?? c?.ios?.buildNumber].filter((x) => x != null && x !== '').join(' · ') || '?';
  } catch {
    return '?';
  }
}

/** The text copied by «انسخ التفاصيل». */
export function crashDetails(error: unknown, where: string): string {
  let msg = 'unknown error';
  let stack = '';
  try {
    msg = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    stack = error instanceof Error ? (error.stack ?? '') : '';
  } catch {}
  return [`Brainy ${appVersion()}`, `route: ${where}`, `at: ${new Date().toISOString()}`, msg, stack].filter(Boolean).join('\n');
}

function go(path: '/settings', retry: () => Promise<void>, where: string) {
  // The root layout's boundary stays up over every page until it's cleared: push, then retry so the stack shows again.
  try {
    router.push(path);
  } catch {}
  if (where === 'root') void retry().catch(() => {});
}

function CrashScreen({ error, retry, where }: ErrorBoundaryProps & { where: string }) {
  const t = useColorScheme() === 'dark' ? warmDark : warm;
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    report(error, `crash:${where}`);
  }, [error, where]);

  const txt = (style: TextStyle) => [{ color: t.fg }, font('body'), style];
  const btn = (label: string, onPress: () => void, solid = false) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({ height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: solid ? t.ok : t.okSoft, opacity: pressed ? 0.7 : 1 })}>
      <Text maxFontSizeMultiplier={1.15} numberOfLines={1} style={[font('semi'), { fontSize: 15, color: solid ? t.onOk : t.okText }]}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 48, gap: 8 }}>
        <View style={{ backgroundColor: t.card, borderRadius: 12, padding: 16, gap: 8 }}>
          <Text maxFontSizeMultiplier={1.15} style={txt({ fontSize: 20, ...font('bold') })}>
            حصلت مشكلة في الصفحة دي
          </Text>
          <Text maxFontSizeMultiplier={1.15} style={txt({ fontSize: 15, color: t.mute, lineHeight: 22 })}>
            بياناتك محفوظة على الموبايل. جرّب تاني، ولو المشكلة فضلت انسخ التفاصيل وابعتها.
          </Text>
        </View>
        {btn('جرّب تاني', () => void retry().catch(() => {}), true)}
        {btn(copied ? 'اتنسخت ✓' : 'انسخ التفاصيل', () => {
          Clipboard.setStringAsync(crashDetails(error, where)).then(() => setCopied(true), () => {});
        })}
        {btn('الإعدادات', () => go('/settings', retry, where))}
        <Text maxFontSizeMultiplier={1.15} style={txt({ fontSize: 13, color: t.mute, lineHeight: 19, paddingHorizontal: 4 })}>
          لو بياناتك فيها مشكلة، ترجّع نسخة احتياطية من الإعدادات ← نسخة احتياطية. وسجل الأخطاء في آخر الإعدادات.
        </Text>
      </ScrollView>
    </View>
  );
}

/** An expo-router `ErrorBoundary` for a route, labelled with where it is (for the copied details and the error log). */
export function crashBoundary(where: string) {
  function ErrorBoundary(p: ErrorBoundaryProps) {
    return <CrashScreen {...p} where={where} />;
  }
  return ErrorBoundary;
}
