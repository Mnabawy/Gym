import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, Card, INPUT, Pill, Screen, Sep, T } from '../../components/ui';
import { Segmented } from '../../components/GymSwitch';
import { Item } from '../../components/Motion';
import { IDEA_STATUS, IDEA_TYPES, newIdea, sortIdeas, type IdeaType, type NoteIdea } from '../../lib/notebook';
import { readNotebook, saveIdea } from '../../lib/notebookStore';
import { parseNote } from '../../lib/notes';
import { useDataVersion } from '../../lib/bus';
import { useToday } from '../../lib/useToday';
import { tint, useTheme } from '../../theme';

type Shelf = 'open' | 'done' | 'dropped';
const onShelf = (x: NoteIdea, s: Shelf) => (s === 'open' ? x.status === 'idea' || x.status === 'study' : x.status === s);

/**
 * دفتر الأفكار (`/ideas`, from the side menu and فضّي دماغك): write an idea in one line, then open it to add every
 * detail (src/app/ideas/[id].tsx). Open ideas / done / dropped on a segmented control, types as chips. Logic in
 * src/lib/notebook.ts.
 */
export default function IdeasScreen() {
  const t = useTheme();
  useDataVersion((s) => s.v);
  const today = useToday();
  const [text, setText] = useState('');
  const [shelf, setShelf] = useState<Shelf>('open');
  const [type, setType] = useState<IdeaType | null>(null);
  const all = readNotebook();
  const list = sortIdeas(all).filter((x) => onShelf(x, shelf) && (!type || x.type === type));
  const count = (s: Shelf) => all.filter((x) => onShelf(x, s)).length;

  const add = () => {
    if (!text.trim()) return;
    const x = newIdea(text, today, Date.now(), type ? { type } : {});
    saveIdea(x);
    setText('');
    router.push({ pathname: '/ideas/[id]', params: { id: x.id } });
  };

  return (
    <Screen title="دفتر الأفكار" sub="كل فكرة بتفاصيلها، لحد ما تقرر هتبقى إيه" onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4, paddingHorizontal: 12 }}>
        <Ionicons name="bulb-outline" size={20} color="#E0A030" />
        <TextInput
          value={text}
          onChangeText={setText}
          onSubmitEditing={add}
          placeholder="فكرة جديدة…"
          placeholderTextColor={t.mute}
          returnKeyType="done"
          style={[INPUT, { flex: 1, fontSize: 15, color: t.fg, textAlign: 'right', minHeight: 44 }]}
        />
        {text.trim() ? <Btn kind="solid" label="ضيف" onPress={add} /> : null}
      </Card>

      <Segmented options={[['open', `مفتوحة ${count('open')}`], ['done', `اتنفّذت ${count('done')}`], ['dropped', `اتلغت ${count('dropped')}`]] as const} value={shelf} onChange={setShelf} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        <Pill label="الكل" on={!type} onPress={() => setType(null)} />
        {(Object.keys(IDEA_TYPES) as IdeaType[]).map((k) => (
          <Pill key={k} label={IDEA_TYPES[k].label} on={type === k} onPress={() => setType(type === k ? null : k)} />
        ))}
      </View>

      {list.length ? (
        <Card style={{ paddingVertical: 0 }}>
          {list.map((x, i) => {
            const tp = IDEA_TYPES[x.type];
            const first = parseNote(x.note)[0]?.text ?? '';
            const sub = [x.status === 'study' ? IDEA_STATUS.study : '', first || (x.why ? `ليه: ${x.why}` : 'من غير تفاصيل لسه'), x.goal ? 'بقت هدف' : x.task ? 'بقت مهمة' : ''].filter(Boolean).join(' · ');
            return (
              <Item key={x.id}>
                {i ? <Sep /> : null}
                <Pressable onPress={() => router.push({ pathname: '/ideas/[id]', params: { id: x.id } })} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 12, opacity: pressed ? 0.7 : 1 })}>
                  <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: tint(tp.color, 0.16), alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={tp.icon} size={18} color={tp.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <T w="semi" style={{ fontSize: 15 }} numberOfLines={1}>{x.title}</T>
                    <T style={{ fontSize: 12.5, color: t.mute }} numberOfLines={1}>{sub}</T>
                  </View>
                  <Ionicons name="chevron-back" size={16} color={t.mute} />
                </Pressable>
              </Item>
            );
          })}
        </Card>
      ) : (
        <T style={{ fontSize: 14, color: t.mute, textAlign: 'center', marginTop: 24 }}>
          {shelf === 'open' ? 'اكتب أول فكرة فوق، وبعدين افتحها وزوّد تفاصيلها.' : 'مفيش حاجة هنا لسه.'}
        </T>
      )}
    </Screen>
  );
}
