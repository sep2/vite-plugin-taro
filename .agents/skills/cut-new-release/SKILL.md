---
name: cut-new-release
description: Prepare and commit a VPT release using Changesets. Use when asked to cut a new release, prepare a patch release, or bump the release version. Write Chinese release notes with explicit upgrade instructions. Stop after the local release commit; never push unless the user explicitly requests it.
compatibility: Requires Node.js 26+, pnpm 11, and Git. GitHub CLI is needed only for explicitly requested remote release verification or editing published release notes.
---

# Cut New Release

## Boundaries

- **Default outcome: prepare release files and create a local commit. Do not push.** A request to “release” or “cut a release” does not authorize pushing.
- Never publish packages locally or manually create release tags. Pushing prepared versions to `main` triggers CI publication, so require an explicit push instruction.
- Write the new release notes in **Chinese**, including a **升级说明** section.
- Do not modify or stage another session's changes. Stage explicit release paths, never `git add .`.
- Keep shell timeouts at 30 seconds or less. Split validation commands into separate calls as needed.

## Repository context

Run commands from the repository root, identified by `git rev-parse --show-toplevel`. All paths below are relative to that root, not the skill directory.

Read the current sources of truth before preparing a release:

- Root scripts: `package.json`
- Changesets configuration: `.changeset/config.json`, pending changesets, and `.changeset/pre.json` if present
- Publication workflow: `.github/workflows/publish.yml`
- Quality workflow: `.github/workflows/quality.yml`
- Repository release documentation: `docs/src/content/docs/references/repository-management.md`

The public packages form one fixed version group:

- `vite-plugin-taro`
- `vite-plugin-taro-runtime` in `packages/taro-runtime`
- `create-vite-taro`

Private workspaces do not participate. The generator derives its generated plugin dependency from its own version; do not separately bump the template dependency.

## 1. Inspect and plan

1. Check `git status --short`, branch, recent commits, and current package versions.
2. Inspect pending changesets and run `pnpm changeset status` before versioning.
3. Confirm the requested bump and channel. A patch release increments the stable patch version unless the user requests a prerelease. Do not silently exit prerelease mode or override a pending minor/major bump.
4. Reuse an appropriate pending changeset. If none exists, add one describing the actual unreleased changes and requested bump.
5. Compare with published versions when needed using read-only registry queries. A local release commit is not proof of publication.

## 2. Write Chinese release notes

Translate or write the changeset before running version preparation. Keep change descriptions short and relevant to package users:

- Describe the problem fixed, the capability added, or the behavior users will notice.
- Include the corresponding short commit hash with each change description for traceability. Verify it with Git; preserve valid Changesets-generated commit references when translating or shortening notes. Reference the implementation commit, not the release-version commit.
- Omit internal implementation details, refactoring, test additions/counts, coverage, CI changes, and release bookkeeping unless they directly affect how users use or upgrade the package.
- Mention dependency changes only when they affect compatibility, security, behavior, or required user actions; omit routine fixed-group version synchronization.
- Keep validation evidence in the completion report, not the release notes.

For example: `12685e7: 修复微信开发者工具点击「编译」后热更新失效的问题（#22）。` Do not expand this into Socket lifecycle, patch-journal, or regression-test implementation details.

Include this section in each public package's new changelog entry so CI-generated GitHub Release bodies contain it:

```markdown
### 升级说明

无需额外操作。从 `PREVIOUS` 升级到 `NEXT` 无需修改代码或配置。
```

Replace the placeholders with actual versions. Use this wording only when no migration actions are required. Otherwise list the concrete code, configuration, command, or environment changes users must make.

For packages with no user-visible changes, use `本包无面向用户的变更。` rather than filling the description with version synchronization details. Do not attribute another package's fix to an unchanged package.

## 3. Prepare versions

Run:

```sh
pnpm release
```

This runs Changesets versioning, refreshes the lockfile, and formats `.changeset`. It does not commit, push, tag, or publish.

Review:

- The three public `package.json` versions agree and match the intended bump/channel.
- Each new package `CHANGELOG.md` entry has Chinese headings and content, including **升级说明**, and contains only user-relevant change descriptions with verified commit hashes.
- Replace generated English placeholders such as `Patch Changes` or `No changes in this release.` only in the new entries; leave historical entries alone.
- The consumed changeset is removed as expected; prerelease state changes are intentional.
- Any lockfile changes are expected. An unchanged lockfile is valid for workspace-only version bumps.
- Do not manually edit or stage generated `dist` files.

## 4. Validate

Run the repository's release checks in this order, using separate calls where needed:

```sh
pnpm prepare:taro
pnpm build:plugin
pnpm typecheck
pnpm test
pnpm test:coverage
```

`pnpm test` includes release artifact tests and plugin tests. Check that coverage meets the current CI thresholds. Run sample builds required by the current quality workflow when relevant to the changes being released.

Run `pnpm lint` and `git diff --check`. If repository-wide lint fails, identify the exact failures. Do not fix unrelated files just to make the release clean or claim lint passed. Release files must pass their applicable formatting checks; disclose any confirmed pre-existing failures.

If a release-related build, test, or typecheck fails, stop before committing and report the blocker. Do not publish or alter CI checks to bypass it.

## 5. Commit and stop

1. Review the complete release diff and status again.
2. Stage only the consumed changeset, changed package manifests/changelogs, and any expected lockfile or prerelease-state changes.
3. Create a commit such as `release: NEXT`.
4. Verify the resulting commit and working-tree status. Check Changesets readiness after the commit, using `pnpm changeset status --output <temporary-file>` and reviewing the output. On `main`, checking status after consuming changesets but before committing can report uncommitted package changes without a changeset; do not add a new changeset merely to suppress that diagnostic.
5. Report the version, commit hash, checks, and **“Not pushed; not published.”** Do not claim the working tree is clean if unrelated changes remain.

**Stop here unless the user explicitly requests a push.**

## Only after an explicit push request

- Verify the remote branch has not diverged; never force-push a release.
- Push the prepared commit to `main`. Let `.github/workflows/publish.yml` publish packages and create tags and GitHub Releases.
- Monitor the run and verify all three published package versions and GitHub Release bodies. Distinguish local preparation, CI publication, registry visibility, and documentation deployment.
- Verify the Chinese **升级说明** appears in the actual GitHub Release notes, not merely in a chat response. If the user requests a notes correction after publication, preserve the existing body and edit the release notes through GitHub; do not republish packages or recreate tags.
- Registry metadata may lag CI publication. Report discrepancies accurately; do not retry publication solely because one metadata query is stale.
