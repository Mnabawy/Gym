// Web preview: Health Connect is Android only.
export const stepsSupported = false;
export const connectSteps = async (): Promise<'ok' | 'unavailable' | 'update' | 'denied'> => 'unavailable';
export const openStepsSettings = () => {};
export const syncSteps = async (_days = 14): Promise<void> => {};
