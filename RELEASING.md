# Releasing Mnema

This is the process for cutting a release of the Mnema open core. Releases are
**tagged, immutable, and signed** — the public `main` is not force-pushed, and a
released tag is never moved or deleted once it's out.

Only the maintainer cuts releases (see [MAINTAINERS.md](./MAINTAINERS.md) and
[GOVERNANCE.md](./GOVERNANCE.md)).

## Versioning

Releases follow [Semantic Versioning](https://semver.org/): `vMAJOR.MINOR.PATCH`.

- **PATCH** — bug fixes, no API/behavior change for self-hosters.
- **MINOR** — backwards-compatible features.
- **MAJOR** — breaking changes (config, schema requiring manual steps, removed
  behavior). Call these out clearly in the changelog.

## Cutting a release

1. **Update the changelog.** In [CHANGELOG.md](./CHANGELOG.md), move the entries
   under `[Unreleased]` into a new `[vX.Y.Z] — YYYY-MM-DD` section, leave a fresh
   empty `[Unreleased]`, and update the compare/tag links at the bottom. Follow
   [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

2. **Land the changelog change on `main`** (through the normal review flow) so
   the tag points at a commit that already describes the release.

3. **Cut an annotated, signed tag on `main`.** The tag must be annotated (not
   lightweight) and GPG- or SSH-signed:

   ```bash
   git checkout main && git pull
   git tag -s vX.Y.Z -m "Mnema vX.Y.Z"
   git tag -v vX.Y.Z        # verify the signature before pushing
   ```

   If you sign with SSH, make sure git is configured for it once:

   ```bash
   git config gpg.format ssh
   git config user.signingkey ~/.ssh/id_ed25519.pub
   ```

4. **Push the tag.**

   ```bash
   git push origin vX.Y.Z
   ```

   > **Tags are immutable.** Never move, re-tag, or delete a released tag. If
   > something's wrong, cut a new patch release (`vX.Y.(Z+1)`) — don't rewrite
   > history. Self-hosters and integrators pin to these tags and trust that they
   > never change.

5. **Create the GitHub Release** from the tag: on the repo, **Releases** → **Draft
   a new release** → choose the existing `vX.Y.Z` tag → title `vX.Y.Z` → paste
   that version's changelog section as the notes → **Publish**.

## For self-hosters

**Pin to a release tag**, don't track `main`. Check out the tag you want and
build from it:

```bash
git fetch --tags
git checkout vX.Y.Z
docker compose up -d --build
```

Upgrade by checking out a newer tag and rebuilding. Security fixes land on the
latest release — see [SECURITY.md](./SECURITY.md).
