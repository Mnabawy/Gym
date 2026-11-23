// Extends app.json (name, plugins, permissions, scheme all stay there) with the build's identity:
// the git short SHA and the build date go into `extra.build`, read in the app by src/lib/buildInfo.ts.
// No git (or not a repo) → sha 'dev'. Signing / keystore are untouched here.
const { execSync } = require('child_process');

function gitSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: __dirname, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev';
  } catch {
    return 'dev';
  }
}

/** Local date, YYYY-MM-DD. */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...(config.extra || {}),
    build: { sha: gitSha(), date: today() },
  },
});
