#!/bin/bash
#
# kocsisagnes.hu — cPanel cron deploy
#
# Polls GitHub for new commits on main and publishes the site when it finds
# one. Needs no API token and no cPanel Git Version Control registration —
# just this clone and a cron entry. Install from cPanel's Terminal:
#
#   (crontab -l 2>/dev/null; echo '* * * * * /bin/bash $HOME/repositories/kocsisagnes.hu/scripts/cpanel-cron-deploy.sh') | crontab -
#
# The whole body lives inside main() on purpose: bash parses a function
# completely before running it, so the `git reset` below cannot corrupt the
# shell that is executing this file if a push happens to rewrite this script.

main() {
  set -euo pipefail

  REPO="$HOME/repositories/kocsisagnes.hu"
  DOCROOT="$HOME/public_html"
  BRANCH="main"
  LOG="$HOME/logs/kocsisagnes-deploy.log"
  LOCK="$HOME/tmp/kocsisagnes-deploy.lock"

  mkdir -p "$(dirname "$LOG")" "$(dirname "$LOCK")"

  log() { printf '%s  %s\n' "$(date '+%F %T')" "$*" >>"$LOG"; }

  # A slow publish plus a per-minute cron would otherwise overlap.
  if command -v flock >/dev/null 2>&1; then
    exec 9>"$LOCK"
    flock -n 9 || exit 0
  fi

  if [ ! -d "$REPO/.git" ]; then
    log "ERROR: no clone at $REPO"
    exit 1
  fi
  cd "$REPO"

  git fetch -q --prune origin "$BRANCH" || { log "ERROR: git fetch failed"; exit 1; }

  LOCAL="$(git rev-parse HEAD)"
  REMOTE="$(git rev-parse "origin/$BRANCH")"
  PUBLISHED="$(cat "$DOCROOT/deployed-commit.txt" 2>/dev/null | tr -d '[:space:]' || true)"

  # Idle only when the clone is current AND the docroot already serves that
  # same commit. Comparing against the docroot as well is what makes a fresh
  # clone, an emptied public_html, or a half-finished deploy self-heal —
  # checking HEAD alone would leave an unpublished site looking perfectly
  # healthy forever. Exit silently so the log does not gain a line a minute.
  if [ "$LOCAL" = "$REMOTE" ] && [ "$PUBLISHED" = "$REMOTE" ]; then
    exit 0
  fi

  if [ "$LOCAL" != "$REMOTE" ]; then
    log "new commit $(git rev-parse --short "$REMOTE") (was $(git rev-parse --short "$LOCAL"))"
  else
    log "docroot out of sync (serving ${PUBLISHED:-nothing}) — republishing $(git rev-parse --short "$REMOTE")"
  fi

  # Reset rather than pull: this clone is a deploy artefact, never an editing
  # surface, so discarding any local state is always the right move.
  git reset -q --hard "origin/$BRANCH"

  if ! DEPLOYPATH="$DOCROOT" /bin/bash scripts/publish.sh >>"$LOG" 2>&1; then
    log "ERROR: publish.sh failed"
    exit 1
  fi

  # Written last, so a crash mid-publish leaves a stale marker and the next
  # run republishes rather than assuming success.
  git rev-parse HEAD >"$DOCROOT/deployed-commit.txt"
  log "deployed $(git rev-parse --short HEAD)"
}

main "$@"
