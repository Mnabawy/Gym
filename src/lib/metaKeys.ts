// Which meta keys belong to this phone only: never part of the data a backup carries over or a safety copy compares.

/** Meta keys that belong to this phone: backup bookkeeping, small UI state, error log, scheduled reminders. */
const LOCAL_META = new Set(['device', 'lastBackup', 'autoBackupAt', 'autoBackupError', 'dbRecovered', 'errLog', 'reminders.applied', 'metaVersion']);
/** Phone-only keys a backup from the older Brainy build may carry (its sync, Google link, UI state): ignored the same way. */
const OLD_LOCAL = new Set(['driveUser', 'driveName', 'drivePhoto', 'driveFileId', 'driveAt', 'driveAtMs', 'driveSig', 'driveError', 'welcomeDone', 'verse.last', 'section', 'focusState', 'taskSpace', 'calendar.source']);
const OLD_PREFIX = 'sync.';
export const isLocalMeta = (k: string) => k.startsWith(OLD_PREFIX) || LOCAL_META.has(k) || OLD_LOCAL.has(k);
