// Opens another app by its Android package (expo-intent-launcher). Needs QUERY_ALL_PACKAGES (app.json) so Android 11+
// lets us find the app's launcher. Not installed (or iPhone, which can't open apps by package): its store page.
import { Linking, Platform } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';

/** Whether this phone can open apps by package (Android only). */
export const canOpenApps = Platform.OS === 'android';

export async function openApp(pkg: string): Promise<void> {
  if (Platform.OS === 'android') {
    try {
      IntentLauncher.openApplication(pkg);
      return;
    } catch {
      // not installed: fall through to the store
    }
    await Linking.openURL(`market://details?id=${pkg}`).catch(() => Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`));
    return;
  }
  await Linking.openURL(`https://play.google.com/store/apps/details?id=${pkg}`).catch(() => {});
}
