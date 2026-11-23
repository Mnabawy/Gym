import { Redirect } from 'expo-router';

/** The app opens on the workout (the gym's first page). */
export default function Index() {
  return <Redirect href="/workout" />;
}
