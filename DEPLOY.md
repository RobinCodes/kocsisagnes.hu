# Automatic deployment: GitHub → cPanel

Pushing to `main` publishes the site, within about a minute.

## How it works

A cron job on the cPanel host polls GitHub once a minute. When `origin/main`
moves, it resets the clone and runs `scripts/publish.sh`, which copies the site
into `public_html`.

```
git push  →  GitHub                                    (nothing else to click)
             cron on the host, every minute
               → git fetch + reset --hard origin/main
               → scripts/publish.sh   → copies the site into public_html
```

This needs **no API token, no SSH, and no cPanel Git Version Control
registration** — just a clone and a crontab line.

| File | Role |
|---|---|
| `scripts/publish.sh` | Defines what gets published. The single source of truth. |
| `scripts/cpanel-cron-deploy.sh` | Runs from cron: polls, resets, calls `publish.sh` |
| `.cpanel.yml` | Calls `publish.sh`, so cPanel's *Deploy HEAD Commit* button still works |
| `.github/workflows/deploy.yml` | Optional instant-deploy path; skips itself unless `CPANEL_TOKEN` is set |

Both deploy paths call the same `publish.sh`, so they cannot drift apart.

## One-time setup

Open cPanel → **Terminal** and paste:

```sh
git clone https://github.com/RobinCodes/kocsisagnes.hu.git ~/repositories/kocsisagnes.hu

(crontab -l 2>/dev/null; \
 echo '* * * * * /bin/bash $HOME/repositories/kocsisagnes.hu/scripts/cpanel-cron-deploy.sh') \
 | crontab -
```

This account's server (`jadis.23net.hu`) also has SSH open on port 22, so the
same two commands work over a normal SSH session if Terminal is unavailable.

Watch the first run with:

```sh
tail -f ~/logs/kocsisagnes-deploy.log
```

The first deploy is the slow one — `assets/` is ~126 MB. Later deploys use
rsync and only transfer what changed.

## Optional: instant deploys

If cPanel ever exposes **Manage API Tokens** (under *Security*), create one and
add four repository secrets — `CPANEL_URL` (`https://jadis.23net.hu:2083`),
`CPANEL_USER` (`kocsshu1`), `CPANEL_TOKEN`, `CPANEL_REPO_ROOT`
(`/home/kocsshu1/repositories/kocsisagnes.hu`). All but the token are already set.

The workflow then deploys on push instead of waiting for cron, using cPanel's
UAPI over port 2083. Remove the cron entry if you switch, so the two do not
both publish.

## Notes and gotchas

- **New top-level files are not published automatically.** `publish.sh` lists
  what to publish explicitly, because this repo root mixes site files with dev
  tooling — `estate_manager.pyw`, `__pycache__/`, the `.md` docs and `.claude/`
  must never reach the public web. If you add, say, `contact.html` at the repo
  root, add it to the `cp -f` line or it stays out of the docroot.
- **Deleting a file from the repo does not delete it from the server.** The copy
  runs without `--delete`, deliberately: a blind delete on `public_html` would
  also wipe `cgi-bin` and the `.well-known/acme-challenge` directory that SSL
  renewal uses. Remove retired files by hand in File Manager.
- **The clone must not live in `public_html`.** It holds `.git/`, which would be
  readable over the web. `~/repositories/` keeps it out of the docroot.
- **`deployed-commit.txt` in the docroot** records what is currently published.
  The cron job compares against it, which is what lets a wiped `public_html` or
  a half-finished publish self-heal on the next tick.
- `publish.sh` falls back to `cp` if the host has no `rsync`; the fallback is
  tested and logs a `rsync: command not found` line when it triggers.
