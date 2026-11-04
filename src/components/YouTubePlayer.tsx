// YouTube player inside the app (phone). The web build uses YouTubePlayer.web.tsx (a plain iframe).
// The embed sits in a small page with an https base URL: YouTube refuses embeds that come with no referrer.
import { Linking } from 'react-native';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import { embedUrl } from '../data/videos';

const BASE = 'https://www.youtube-nocookie.com';

const page = (id: string) => `<!doctype html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}iframe{position:fixed;inset:0;width:100%;height:100%;border:0}</style>
</head><body>
<iframe src="${embedUrl(id)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
</body></html>`;

export function YouTubePlayer({ id }: { id: string }) {
  // Keep the player in place: links that would replace the page (YouTube logo, "watch on YouTube") open outside.
  const stay = (r: WebViewNavigation & { isTopFrame?: boolean }) => {
    if (r.isTopFrame === false || r.url.startsWith(BASE) || r.url.startsWith('about:')) return true;
    Linking.openURL(r.url).catch(() => {});
    return false;
  };
  return (
    <WebView
      source={{ html: page(id), baseUrl: BASE }}
      originWhitelist={['*']}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      allowsFullscreenVideo
      onShouldStartLoadWithRequest={stay}
      style={{ flex: 1, backgroundColor: '#000' }}
      containerStyle={{ backgroundColor: '#000' }}
    />
  );
}
