# Automatic deployment: GitHub → cPanel

Pushing to `main` publishes the site. No manual step in cPanel.

## How it works

cPanel's Git Version Control does **not** pull on its own — "Update from Remote"
and "Deploy HEAD Commit" are buttons someone has to click. Both are exposed over
cPanel's UAPI, so `.github/workflows/deploy.yml` presses them for us:

```
git push  →  GitHub Actions  →  VersionControl/update            (cPanel clone pulls from GitHub)
                             →  VersionControlDeployment/create  (cPanel runs .cpanel.yml)
                             →  copies site files into public_html
```

Two files drive it:

| File | Role |
|---|---|
| `.github/workflows/deploy.yml` | Triggers on push to `main`, calls the cPanel API, waits for the result |
| `.cpanel.yml` | Runs on the server: copies the site into the docroot |

## One-time setup

### 1. Clone the repo inside cPanel

cPanel → **Git Version Control** → *Create* → enable **Clone a Repository**:

- **Clone URL:** `https://github.com/RobinCodes/kocsisagnes.hu.git`
  (the repo is public, so no deploy key or credentials are needed)
- **Repository Path:** `/home/USERNAME/repositories/kocsisagnes.hu`
- **Branch:** `main`

Do **not** clone into `public_html`. The clone is a staging area; `.cpanel.yml`
copies the published files out of it into the docroot. This is what keeps
`estate_manager.pyw`, `__pycache__/`, `.claude/` and `.git/` off the public web.

### 2. Create a cPanel API token

cPanel → **Manage API Tokens** → *Create* → name it e.g. `github-deploy`.
Copy the token now; cPanel shows it only once.

### 3. Add four GitHub secrets

GitHub repo → **Settings** → **Secrets and variables** → **Actions** → *New repository secret*:

| Secret | Value | Example |
|---|---|---|
| `CPANEL_URL` | cPanel base URL **including port** | `https://server42.yourhost.com:2083` |
| `CPANEL_USER` | cPanel username | `kocsisag` |
| `CPANEL_TOKEN` | the token from step 2 | |
| `CPANEL_REPO_ROOT` | the path from step 1 | `/home/kocsisag/repositories/kocsisagnes.hu` |

Secrets are safe in a public repo: they are not exposed to forked pull requests,
and this workflow only runs on pushes to `main`.

### 4. Check the deploy path

`.cpanel.yml` deploys to `$HOME/public_html`. If kocsisagnes.hu is an **addon
domain or subdomain** rather than the account's primary domain, change
`DEPLOYPATH` to that domain's docroot (e.g. `$HOME/kocsisagnes.hu`).

### 5. Try it

Push to `main`, or run it by hand: GitHub → **Actions** → *Deploy to cPanel* →
**Run workflow**. The run log shows the pulled commit, the deploy id, and
success or failure.

## Notes and gotchas

- **`CPANEL_URL` must be reachable from GitHub's runners on port 2083.** Use the
  hosting server's own hostname. If `kocsisagnes.hu` is proxied through
  Cloudflare, the domain name will not work for this — the server hostname will.
- **Deleting a file from the repo does not delete it from the server.** The
  deploy copies over the docroot without `--delete`, deliberately: a blind
  `--delete` on `public_html` would also wipe `cgi-bin`, `.htaccess` and the
  `.well-known/acme-challenge` directory that SSL renewal uses. Remove retired
  files by hand in File Manager.
- **New top-level files are not published automatically.** `.cpanel.yml` lists
  what to publish explicitly. If you add, say, `contact.html` at the repo root,
  add it to the `cp` line — otherwise it stays out of the docroot.
- **The first deploy is the slow one** (`assets/` is ~126 MB). Later deploys use
  rsync and only transfer what changed.
- If the Action fails at *Updating cPanel clone*, the usual cause is that the
  cPanel clone has local commits and can no longer fast-forward — cPanel updates
  with `--ff-only`. Fix it in cPanel → Git Version Control, or delete and
  re-clone the repository.
