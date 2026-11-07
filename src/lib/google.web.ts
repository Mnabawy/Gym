// Web preview: Google sign-in needs the phone app.
export const googleSupported = false;
export const GOOGLE_USER = 'driveUser';
export const GOOGLE_NAME = 'driveName';
export const GOOGLE_PHOTO = 'drivePhoto';
export const googleIdToken = async (): Promise<string | null> => null;
export const linkGoogle = async (): Promise<string | null> => null;
export const unlinkGoogle = async () => {};
