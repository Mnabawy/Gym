import React, { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { Btn, Card, INPUT, Label, Screen, T } from '../../components/ui';
import { Segmented } from '../../components/GymSwitch';
import { NoteEditor } from '../../components/NoteEditor';
import { IDEA_STATUS, IDEA_TYPES, toGoal, toTask, type IdeaStatus, type IdeaType, type NoteIdea } from '../../lib/notebook';
import { deleteIdea, readNotebook, saveIdea } from '../../lib/notebookStore';
import { deleteGoal, readGoals, saveGoal } from '../../lib/goalStore';
import { readTasks, saveTask, writeTasks } from '../../lib/taskStore';
import { atomic } from '../../lib/atomic';
import { PLAN_KINDS, taskId, type PlanKindKey } from '../../lib/tasks';
import { showUndo } from '../../lib/undo';
import { MONTHS_AR } from '../../data/program';
import { useToday } from '../../lib/useToday';
import { useTheme } from '../../theme';

/**
 * One idea in دفتر الأفكار (`/ideas/[id]`): its title, type, status, details (text and points), why, first step, cost
 * and link — saved as you type (half a second after you stop, and when you leave). «حوّلها لهدف / لمهمة» makes it one
 * with the details carried over and links back; a فسحة can go straight on يومي as a plan.
 */
export default function IdeaScreen() {
  const t = useTheme();
  const today = useToday();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [x, setX] = useState<NoteIdea | undefined>(() => readNotebook().find((y) => y.id === id));
  // Saving: half a second after the last change, and whatever is left when the page closes.
  const pending = useRef<NoteIdea | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (pending.current && pending.current.title.trim()) saveIdea(pending.current);
    pending.current = null;
  };
  useEffect(() => flush, []);
  const edit = (patch: Partial<NoteIdea>) => {
    if (!x) return;
    const next = { ...x, ...patch };
    setX(next);
    pending.current = next;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 500);
  };
  const back = () => {
    flush();
    if (router.canGoBack()) router.back();
    else router.replace('/ideas');
  };

  if (!x) {
    return (
      <Screen title="الفكرة" onBack={back}>
        <T style={{ fontSize: 14, color: t.mute, textAlign: 'center', marginTop: 24 }}>الفكرة دي مش موجودة. يمكن اتمسحت.</T>
      </Screen>
    );
  }

  const goal = x.goal ? readGoals().find((g) => g.id === x.goal) : undefined;
  const task = x.task ? readTasks().find((y) => y.id === x.task) : undefined;
  const field = (value: string, key: 'why' | 'first' | 'cost' | 'link', placeholder: string, multi = false) => (
    <TextInput
      value={value}
      onChangeText={(v) => edit({ [key]: v })}
      placeholder={placeholder}
      placeholderTextColor={t.mute}
      multiline={multi}
      style={[INPUT, { fontSize: 15, color: t.fg, textAlign: 'right', minHeight: 44, paddingVertical: multi ? 10 : 0, textAlignVertical: multi ? 'top' : 'center' }]}
    />
  );

  const makeGoal = () => {
    flush();
    const g = toGoal(x, today, Date.now());
    const next = { ...x, goal: g.id, ...(x.status === 'idea' ? { status: 'study' as const } : {}) };
    atomic(() => {
      saveGoal(g);
      saveIdea(next);
    });
    setX(next);
    showUndo('بقت هدف', () =>
      atomic(() => {
        deleteGoal(g.id);
        saveIdea(x);
        setX(x);
      }),
    );
    router.push(`/goals/${g.id}`);
  };
  const makeTask = () => {
    flush();
    const tk = toTask(x, today, taskId());
    const next = { ...x, task: tk.id, ...(x.status === 'idea' ? { status: 'study' as const } : {}) };
    atomic(() => {
      saveTask(tk);
      saveIdea(next);
    });
    setX(next);
    showUndo('بقت مهمة في مهامي', () =>
      atomic(() => {
        writeTasks(readTasks().filter((y) => y.id !== tk.id));
        saveIdea(x);
        setX(x);
      }),
    );
  };
  const remove = () => {
    if (timer.current) clearTimeout(timer.current);
    pending.current = null;
    const undo = deleteIdea(x.id);
    showUndo(`«${x.title}» اتمسحت`, undo);
    if (router.canGoBack()) router.back();
    else router.replace('/ideas');
  };
  const made = `${+x.created.slice(8)} ${MONTHS_AR[+x.created.slice(5, 7) - 1]}`;

  return (
    <Screen title="الفكرة" sub={`اتكتبت ${made} · بتتحفظ لوحدها`} onBack={back}>
      <Card style={{ paddingVertical: 4, paddingHorizontal: 12 }}>
        <TextInput
          value={x.title}
          onChangeText={(v) => edit({ title: v })}
          placeholder="اسم الفكرة"
          placeholderTextColor={t.mute}
          multiline
          style={[INPUT, { fontSize: 21, fontWeight: '700', color: t.fg, textAlign: 'right', minHeight: 48, paddingVertical: 8 }]}
        />
      </Card>

      <Label>النوع</Label>
      <Segmented options={(Object.keys(IDEA_TYPES) as IdeaType[]).map((k) => [k, IDEA_TYPES[k].label] as const)} value={x.type} onChange={(type) => edit({ type })} />
      {x.type === 'fun' ? <Segmented options={(Object.keys(PLAN_KINDS) as PlanKindKey[]).map((k) => [k, PLAN_KINDS[k].label] as const)} value={x.kind ?? 'outing'} onChange={(kind) => edit({ kind })} /> : null}

      <Label>الحالة</Label>
      <Segmented options={(Object.keys(IDEA_STATUS) as IdeaStatus[]).map((k) => [k, IDEA_STATUS[k]] as const)} value={x.status} onChange={(status) => edit({ status })} />

      <Label>التفاصيل</Label>
      <NoteEditor t={t} value={x.note} onChange={(note) => edit({ note })} placeholder="اكتب كل اللي في دماغك عنها: إزاي، فين، مع مين، المشاكل… استخدم «نقاط» للقوايم" />

      <Label>ليه الفكرة دي؟</Label>
      <Card style={{ paddingHorizontal: 12, paddingVertical: 0 }}>{field(x.why, 'why', 'هتفرق معاك في إيه؟', true)}</Card>

      <Label>أول خطوة لو هبدأ</Label>
      <Card style={{ paddingHorizontal: 12, paddingVertical: 0 }}>{field(x.first, 'first', 'أصغر حاجة تتعمل الأول')}</Card>

      <Label>التكلفة واللينك</Label>
      <Card style={{ paddingHorizontal: 12, paddingVertical: 0 }}>
        {field(x.cost, 'cost', 'التكلفة التقريبية (فلوس، وقت…)')}
        <View style={{ height: 0.5, backgroundColor: t.line }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>{field(x.link, 'link', 'لينك (فيديو، مقال، مكان…)')}</View>
          {/^https?:\/\//.test(x.link.trim()) ? (
            <Pressable onPress={() => Linking.openURL(x.link.trim()).catch(() => undefined)} hitSlop={8} accessibilityRole="link" accessibilityLabel="افتح اللينك">
              <Ionicons name="open-outline" size={20} color={t.okText} />
            </Pressable>
          ) : null}
        </View>
      </Card>

      <Label>تبقى إيه؟</Label>
      <View style={{ gap: 8 }}>
        {goal ? <Btn label={`افتح الهدف: ${goal.name}`} onPress={() => router.push(`/goals/${goal.id}`)} /> : <Btn kind="solid" label="حوّلها لهدف (بالتفاصيل)" onPress={makeGoal} />}
        {task ? <Btn label={`في مهامي: ${task.title}`} onPress={() => router.navigate('/tasks')} /> : <Btn label="حوّلها لمهمة" onPress={makeTask} />}
        {x.type === 'fun' ? <Btn label="حطها خطة في يومي" onPress={() => { flush(); router.navigate({ pathname: '/', params: { plan: '1', planKind: x.kind ?? 'outing', planTitle: x.title } }); }} /> : null}
        <Btn kind="danger" label="امسح الفكرة" onPress={remove} />
      </View>
    </Screen>
  );
}
