---
name: cut-new-release
description: Prepare a VPT Changesets release and publish through CI when requested. Use for version bumps, patch or prerelease preparation, and publishing a prepared release.
compatibility: Requires Node.js 26+, pnpm 12, and Git. Publishing also requires GitHub CLI access.
---

# Cut New Release

Run repository commands from the repo root (`../../..` relative to this skill).

## Scope

- **Prepare / cut a release:** create a local release commit.
- **Explicitly publish / push:** push the prepared release to `main` for CI publication. An already prepared version goes directly to Publish.
- Honor the requested review and local-test scope; reuse existing evidence for unchanged code. Resolve conflicts with `AGENTS.md` before proceeding.
- Stage explicit task-owned paths. Publication and release tags belong to CI; never publish locally or force-push.

## Prepare

1. Check branch, working-tree ownership, package versions, pending changesets, and npm release state. Preserve the requested bump and channel; ask about conflicting pending bumps or prerelease transitions.
2. Commit the intended implementation changes. Reuse changes already reviewed in the session; investigate additional release scope as needed for accurate notes.
3. Add or consolidate changesets for the net user-visible changes, then run:

   ```sh
   pnpm changeset status
   pnpm release
   ```

4. Confirm the fixed group (`create-vite-taro`, `vite-plugin-taro`, `vite-plugin-taro-runtime`) has the intended version. Review the generated release entries and expected lockfile/prerelease changes; preserve historical entries and generated `dist` files.
5. Complete the agreed local validation, then commit the release files as `release: VERSION`. Stop on known release blockers and keep CI checks intact.
6. Run `pnpm changeset status` after committing and confirm release readiness. Stop here unless publication was requested.

## Release notes

- Write concise Chinese notes for each package, describing net changes since the previous published stable version. For a prerelease, use the previous release in that prerelease line, or stable when starting one.
- Cite verified implementation commit hashes. Include only changes belonging to that package; use `本包无面向用户的变更。` when applicable.
- Include **升级说明** with previous/next versions and the applicable upgrade command. Describe affected users and exact migration steps for public API, default, configuration, or dependency changes.
- For the generator, give the new-project creation command; for the runtime, explain its automatic upgrade with the plugin. Include other migration steps only when required by this release.

## Publish

1. Confirm the prepared version needs publication, Changesets is ready, and the push is a fast-forward from remote `main`.
2. Push to `main`; [publish.yml](../../../.github/workflows/publish.yml) owns package publication, tags, and GitHub Releases.
3. Monitor CI, then verify all three npm versions and the Chinese **升级说明** in their GitHub Releases. Report pending or failed publication accurately; allow registry metadata time to become visible.

## Report

Report the version, commit, validation performed or skipped, and actual publication state. Published-package smoke tests are a separate requested task: [test-published-packages](../test-published-packages/SKILL.md).

Repository references: [release commands](../../../package.json), [version policy](../../../.changeset/config.json), [CI checks](../../../.github/workflows/quality.yml), and [release guide](../../../docs/src/content/docs/references/repository-management.md#发布). Read them when the relevant workflow details are needed.
