// Your account: one-tap Google sign-in (welcome screen, account page). It's who you are for Supabase sync (cloud.ts),
// which signs in with the id token this gives. Setup (Android + Web clients): docs/supabase-setup.md. Web: google.web.ts.
// The meta keys keep their old names (from when this was the Drive backup) so phones that signed in back then stay in.
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useDataVersion } from './bus';
import { storage } from './storage';

export const googleSupported = true;
/** Meta keys: signed-in email, your Google name and photo (side menu). */
export const GOOGLE_USER = 'driveUser';
export const GOOGLE_NAME = 'driveName';
export const GOOGLE_PHOTO = 'drivePhoto';

let configured = false;
function setup() {
  if (configured) return;
  // The web client id is what makes Google hand out an id token.
  GoogleSignin.configure({ webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || undefined });
  configured = true;
}

/** Google id token for the saved account (Supabase sign-in), or null when not signed in or no web client id is set. */
export async function googleIdToken(): Promise<string | null> {
  setup();
  if (!storage.getMeta(GOOGLE_USER)) return null;
  const r = await GoogleSignin.signInSilently();
  return r.type === 'success' ? r.data.idToken : null;
}

/** Signs in with Google. Returns the email, or null if cancelled. */
export async function linkGoogle(): Promise<string | null> {
  setup();
  try {
    await GoogleSignin.hasPlayServices();
    const r = await GoogleSignin.signIn();
    if (r.type !== 'success') return null;
    storage.setMeta(GOOGLE_USER, r.data.user.email);
    storage.setMeta(GOOGLE_NAME, r.data.user.givenName ?? r.data.user.name ?? '');
    storage.setMeta(GOOGLE_PHOTO, r.data.user.photo ?? '');
    return r.data.user.email;
  } catch (e) {
    if ((e as { code?: string }).code === statusCodes.SIGN_IN_CANCELLED) return null;
    throw e;
  }
}

export async function unlinkGoogle() {
  setup();
  try {
    await GoogleSignin.signOut();
  } catch {}
  for (const k of [GOOGLE_USER, GOOGLE_NAME, GOOGLE_PHOTO]) storage.setMeta(k, '');
  useDataVersion.getState().bump();
}
