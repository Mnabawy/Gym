import React from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Btn, Card, Label, Screen, Sep, T } from '../components/ui';
import { useTheme } from '../theme';

/**
 * GymApp Pro: what the subscription will add. Prepared only (Nov 2026, owner's request): no billing is connected and
 * nothing in the app is locked; the button says it's coming. Price and plans: docs/store-listing.md.
 */
export const PRO_PRICE = '149 جنيه في الشهر';
const FREE = ['تسجيل التمرين والأوزان', 'برنامج من هدفك ومستواك', 'زيادة الأوزان تلقائي', 'الأكل والمشتريات', 'نسخة احتياطية على الموبايل'];
const PRO = ['كوتش يتابعك ويبعتلك برامج', 'نسخة أونلاين من بياناتك', 'كشف الثبات: ليه أوزانك واقفة وتعمل إيه', 'برامج جديدة كل ما تخلص واحد'];

export default function PremiumScreen() {
  const t = useTheme();
  const list = (items: string[], icon: 'checkmark' | 'star') =>
    items.map((x, i) => (
      <View key={x}>
        {i ? <Sep /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 14 }}>
          <Ionicons name={icon} size={16} color={icon === 'star' ? t.warn : t.okText} />
          <T style={{ flex: 1, fontSize: 14 }}>{x}</T>
        </View>
      </View>
    ));
  return (
    <Screen title="GymApp Pro" sub={PRO_PRICE} onBack={() => router.back()}>
      <Label>ببلاش دايماً</Label>
      <Card>{list(FREE, 'checkmark')}</Card>
      <Label>مع Pro</Label>
      <Card>{list(PRO, 'star')}</Card>
      <Btn label="الاشتراك قريب" onPress={() => {}} />
      <T style={{ color: t.mute, fontSize: 12 }}>الاشتراك لسه ما اتفعّلش. كل حاجة في التطبيق شغالة ببلاش دلوقتي.</T>
    </Screen>
  );
}
