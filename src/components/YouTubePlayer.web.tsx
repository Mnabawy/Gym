// YouTube player for the web build: a plain iframe (react-native-webview doesn't run on web).
import { embedUrl } from '../data/videos';

export function YouTubePlayer({ id }: { id: string }) {
  return (
    <iframe
      src={embedUrl(id)}
      title="YouTube"
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      style={{ border: 0, width: '100%', height: '100%', display: 'block', background: '#000' }}
    />
  );
}
