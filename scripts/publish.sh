#!/bin/bash
#
# Publishes the site from this clone into the docroot.
#
# Single source of truth for "what gets published": .cpanel.yml calls this,
# and so does scripts/cpanel-cron-deploy.sh, so the two cannot drift.
#
# The list is an explicit allowlist because this repo root mixes site files
# with dev tooling (estate_manager.pyw, __pycache__/, *.md, .claude/) that
# must never reach the public web. Adding a new top-level site file means
# adding it here.

set -euo pipefail

DEPLOYPATH="${DEPLOYPATH:-$HOME/public_html}"

cd "$(dirname "$0")/.."
mkdir -p "$DEPLOYPATH"

# rsync only transfers what changed (assets/ is ~126MB, so a full copy on
# every push would be slow); cp is the fallback if the host has no rsync.
rsync -a --omit-dir-times assets data en hu masszazs "$DEPLOYPATH/" \
  || cp -R assets data en hu masszazs "$DEPLOYPATH/"

cp -f index.html robots.txt sitemap.xml styles.css shared.js bot-defense.js \
      privacy_policy_2026.pdf "$DEPLOYPATH/"
