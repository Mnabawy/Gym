#!/bin/sh
# Brings this copy up to date with GitHub's master, safely, then installs packages.
#   npm run update            update only
#   npm run update -- --build update, rebuild the native project if needed, and install the release build on the phone
# Nothing is lost: local edits go to `git stash`, local commits to a backup branch.
set -e
cd "$(dirname "$0")/.."

echo "⬇️  بجيب آخر نسخة من GitHub…"
git fetch origin

# Edits to tracked files (usually package-lock.json after npm install) would block the pull: put them aside.
if ! git diff --quiet || ! git diff --cached --quiet; then
  git stash push -m "قبل التحديث $(date '+%Y-%m-%d %H:%M')" >/dev/null
  echo "📦 حطيت تعديلاتك المحلية على جنب (git stash list)"
fi

# The default branch is master (main was renamed): switch to it and follow origin/master.
if git show-ref --verify --quiet refs/heads/master; then
  git checkout -q master
else
  git checkout -q -b master origin/master
fi
git branch -q --set-upstream-to=origin/master master

before=$(git rev-parse HEAD)
if ! git merge -q --ff-only origin/master 2>/dev/null; then
  # This copy has commits GitHub doesn't: keep them on a backup branch, then match GitHub.
  backup="backup-$(date '+%Y%m%d-%H%M%S')"
  git branch "$backup"
  git reset -q --hard origin/master
  echo "🗂  كان فيه commits محلية، اتحفظت في الفرع $backup"
fi
after=$(git rev-parse HEAD)

if [ "$before" = "$after" ]; then
  echo "✅ عندك آخر نسخة بالفعل ($(git log -1 --format=%h))"
else
  echo "✅ اتحدّث: $(git log -1 --format='%h %s')"
fi

echo "📥 بنزّل الباكدجات…"
npm install --no-audit --no-fund --loglevel=error
# npm may rewrite the lock file; keep it as on GitHub so the next update is clean.
git checkout -q -- package-lock.json 2>/dev/null || true

if [ "$1" = "--build" ]; then
  # Native settings or packages changed since the last build: regenerate the Android project.
  if [ "$before" != "$after" ] && git diff --name-only "$before" "$after" | grep -qE '^(package\.json|app\.json|app\.config\.)'; then
    echo "🔧 فيه تغيير في الإعدادات أو الباكدجات، ببني مشروع أندرويد من جديد…"
    npx expo prebuild --platform android --clean
  fi
  npx expo run:android --variant release
else
  echo "👉 عشان تبني وتنزّل على الموبايل: npm run update -- --build"
fi
