import { Redirect } from 'expo-router';
import { storage } from '../lib/storage';
import { needsSetup, SETUP_KEY } from '../lib/template';

/** The app opens on the workout (the gym's first page); the very first time, with nothing logged, on the setup. */
export default function Index() {
  return <Redirect href={needsSetup(storage.getMeta(SETUP_KEY), storage.trainedDays().length) ? '/setup' : '/workout'} />;
}
