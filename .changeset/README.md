# Releases

Changesets 3 owns versions and package changelogs. The three public packages form one fixed version group; apps, docs, and the root workspace are private.

1. Run `pnpm changeset` to record user-facing changes and their patch/minor/major bumps.
2. Run `pnpm changeset status` to review the pending version plan.
3. Run `pnpm release` to apply the plan, refresh the lockfile, and format release state.
4. Review and commit the changed release files, then push `main`.

`pnpm release` only prepares files. It does not commit, tag, push, or publish. GitHub Actions publishes unpublished versions through npm Trusted Publishing, creates package tags and GitHub Releases, and deploys documentation. Pending changesets wait for local versioning; no release PRs are created. An ordinary push with all versions already on npm does not publish.

The migration starts in beta mode at `0.7.1-beta.1`; a patch changeset continues at `0.7.1-beta.2`. During beta mode, versioning archives consumed changesets under `pre/` for the stable changelog. Run `pnpm changeset pre exit` followed by `pnpm release` to prepare the stable version. For a later beta cycle, run `pnpm changeset pre enter beta` once before preparing versions.

Never run a publish command locally. For local artifact validation, build the runtime/plugin and run `pnpm test:release`.

See [repository maintenance](../docs/src/content/docs/references/repository-management.md) and the [Changesets prerelease guide](https://changesets.dev/guide/prereleases).
