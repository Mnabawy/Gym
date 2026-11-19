import React from 'react';
import { View } from 'react-native';
import { WEEKDAYS_AR } from '../data/program';
import { Card, Pill, Row, Sep, Stepper, SwitchRow, T } from './ui';
import { useSettings } from '../lib/settings';
import { timeAr, toggleDay, WEEK } from '../lib/settingsView';

/** Settings' يومي card: the workout time on the timeline, and work hours as a fixed block (src/lib/dayFixed.ts). */
export function DaySettings() {
  const st = useSettings();
  return (
    <Card>
      <Row label="ميعاد التمرين">
        <Stepper value={st.reminderTime} min={0} max={24 * 60 - 15} step={15} onChange={(v) => st.setQuiet({ reminderTime: v })} label="ميعاد التمرين" format={timeAr} />
      </Row>
      <Sep />
      <SwitchRow label="ساعات الشغل" sub="بتظهر على يومي بلوك ثابت، والوقت الفاضي بيتحسب من غيرها" value={st.workOn} onChange={(v) => st.setQuiet({ workOn: v })} />
      {st.workOn ? (
        <>
          <Row label="من">
            <Stepper value={st.workFrom} min={0} max={st.workTo - 30} step={30} onChange={(v) => st.setQuiet({ workFrom: v })} label="الشغل من" format={timeAr} />
          </Row>
          <Row label="لحد">
            <Stepper value={st.workTo} min={st.workFrom + 30} max={24 * 60 - 30} step={30} onChange={(v) => st.setQuiet({ workTo: v })} label="الشغل لحد" format={timeAr} />
          </Row>
          <Sep />
          <View style={{ padding: 14, gap: 10 }}>
            <T w="medium">أيام الشغل</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {WEEK.map((wd) => (
                <Pill key={wd} label={WEEKDAYS_AR[wd]} on={st.workDays.includes(wd)} onPress={() => st.setQuiet({ workDays: toggleDay(st.workDays, wd) })} />
              ))}
            </View>
          </View>
        </>
      ) : null}
    </Card>
  );
}
