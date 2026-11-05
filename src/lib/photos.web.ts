// Web preview: progress photos need the phone's storage, so they're phone only.
export const photosSupported = false;
export type Photo = { date: string; uri: string; name: string };
export const addPhoto = async (_from: 'camera' | 'library') => false;
export const listPhotos = (): Photo[] => [];
export const deletePhoto = (_p: Photo) => {};
export const exportPhotos = async (): Promise<{ name: string; data: string }[]> => [];
export const importPhotos = (_list: readonly { name: string; data: string }[]) => 0;
