// Web preview: no file system to save to on its own, so automatic backups are phone only.
export const autoSupported = false;
export const AUTO_KEY = 'autoBackupAt';
export const AUTO_ERROR_KEY = 'autoBackupError';
export const AUTO_DAYS = 7;
export const AUTO_KEEP = 4;
export type AutoFile = { date: string; name: string };
export const listAutoBackups = (): AutoFile[] => [];
export const readAutoBackup = async (_name: string) => '';
export const runAutoBackup = async (_force = false): Promise<'saved' | 'skipped'> => 'skipped';
export const pickBackupDir = async (): Promise<string | null> => null;
