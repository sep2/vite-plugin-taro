---
name: cut-new-release
description: Prepare and commit a VPT release using Changesets. Use when asked to cut a new release, prepare a patch release, or bump the release version. Audit net changes from the published baseline and write Chinese release notes with verified migration instructions. Stop after the local release commit; never push unless the user explicitly requests it.
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
- Changesets configuration: `.changeset/config.json`, pending changesets, `.changeset/pre.json`, and saved drafts in `.changeset/pre/` if present
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
4. Identify the published comparison baseline and complete the audit below before drafting notes. Use read-only registry queries when publication or channel state is uncertain; a local release commit is not proof of publication.
5. Reuse and consolidate appropriate pending changesets, including saved prerelease drafts. Add a changeset only for an actual net change not already covered; do not create one merely because a recent commit exists.

## 2. Audit and write Chinese release notes

### Establish the baseline and net changes

Release notes describe the difference users receive, not a list of commits. Complete this audit before running version preparation:

1. **For a stable release, compare against the previous published stable version**, even when promoting a beta. Do not use the most recent beta or local release commit as the stable baseline. For a prerelease, compare against the previous published prerelease in that release line, or the previous stable version when starting a new line.
2. Resolve the baseline to its package tag or verified release commit. Inspect `git log <baseline>..HEAD` for candidates, then `git diff <baseline>..HEAD -- <paths>` for the final behavior. Include package source, manifests, shared build inputs, patches, and resolved dependencies that affect the published package.
3. For every proposed change, verify that its implementation commit is in the release and not already in the baseline. `git merge-base --is-ancestor <fix> <baseline>` succeeding means that fix already shipped; it is not a new fix in this release. A valid hash alone does not prove a change is new.
4. Collapse intermediate implementations and reverts into the **net user-visible result**. Omit a beta-only change followed by a rollback when stable behavior is unchanged. Mention a beta migration separately only if beta users must take action.
5. Audit each public package independently. A fixed version group does not imply shared features or fixes. If runtime source and build inputs are unchanged, do not copy a plugin fix into its notes.
6. Treat existing changelogs and `.changeset/pre/` as draft material, not evidence. Correct or remove superseded, duplicate, already-released, and no-op drafts before versioning. Consolidate each package's upgrade instructions; do not concatenate beta notes into a stable release. Leave historical package changelog entries unchanged unless the user explicitly requests a historical correction.

Keep a short working audit of each included change: package, baseline behavior, new behavior, implementation evidence, affected users, and required action. This audit is for preparation, not the published release body.

### Audit compatibility and migration

- Inspect removed exports and automatic global bindings, changed defaults, config interpretation, output paths, supported environments, and dependency requirements. Check application dependencies as well as direct application usage when global behavior changes.
- For every compatibility change, state **who is affected, what stopped being automatic or changed, and the exact migration**. Verify code/config examples against current implementation and tests; distinguish Vite top-level options from `vpt()` options and identify target-specific steps.
- Never assume a patch bump means no migration. If compatibility findings conflict with the requested release scope, raise them before versioning rather than hide them in a generic upgrade assurance.
- Do not write `无需修改代码或配置` unless every relevant migration path supports that claim. If only some users need changes, name those conditions instead of preceding them with a blanket assurance.
- Do not disguise a removed default as an optional new capability. For example, if `URL` bindings were previously injected and are now opt-in, describe the removal and required configuration for existing users, not just the new `polyfills` option.

### Write concise user-facing notes

Translate or rewrite the changesets from the audit:

- Describe the problem fixed, the capability added, or the behavior users will notice. Lead with compatibility changes when users must act.
- Include a verified implementation commit's short hash with each change description. Remove misleading Changesets-generated release-commit references rather than preserving them blindly.
- Omit internal implementation details, refactoring, tests, coverage, CI, dependency housekeeping, and version synchronization unless they directly affect users. Keep validation evidence in the completion report.
- Keep optional configuration recipes and troubleshooting in documentation. Release notes need only the minimal steps required by this upgrade, not a general installation guide.
- For packages with no user-visible changes, use `本包无面向用户的变更。`; do not invent work to fill an entry.

For example: `12685e7: 修复微信开发者工具点击「编译」后热更新失效的问题（#22）。` Do not expand this into Socket lifecycle or patch-journal implementation details.

Each public package's new entry must have Chinese headings and a **升级说明** section with actual previous/next versions, the applicable upgrade command, and verified migration steps. For generators, distinguish new-project creation from upgrading an existing project; do not tell existing users to regenerate an application. For transitive packages, explain whether a separate upgrade is needed.

**Final editorial check:** Is every bullet new relative to the correct baseline? Does it belong to this package? Does the final code support it? Can an affected user complete the upgrade without guessing? Are assurances contradicted by later instructions? Remove any bullet that only explains development history.

## 3. Prepare versions

Run:

```sh
pnpm release
```

This runs Changesets versioning, refreshes the lockfile, and formats `.changeset`. It does not commit, push, tag, or publish.

Review:

- The three public `package.json` versions agree and match the intended bump/channel.
- Audit each generated entry against the baseline and migration findings again. It must describe net changes, use verified implementation hashes, and have one coherent Chinese **升级说明** section. Generating successfully does not validate the notes.
- Remove copied beta instructions, stale fixes, duplicate headings, and no-change placeholders that contradict actual changes. Replace generated English headings or placeholders only in the new entries; leave historical entries alone.
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
