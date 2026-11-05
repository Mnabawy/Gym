// Web preview: Google sign-in for Drive needs the phone app.
export const driveSupported = false;
export const DRIVE_USER = 'driveUser';
export const DRIVE_AT = 'driveAt';
export const DRIVE_ERROR = 'driveError';
export const linkDrive = async (): Promise<string | null> => null;
export const unlinkDrive = async () => {};
export const syncDrive = async (_force = false): Promise<'uploaded' | 'skipped' | 'unlinked'> => 'unlinked';
export const fetchDrive = async (): Promise<string | null> => null;
