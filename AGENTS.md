# Rule 0

When designing a feature, I don't care about compatibility. I want the best architecture with the best readability but
best simplicity. Do not over-engineering. I don't want many moving parts with duplicated slop code.
If the new features intersect with old behaviors, design it more general that the new features cover broader cases so
the old codes are no longer needed. You should never propose "minimalistic change". Suggest as elegant and simply as possible.
Never be conservative, always be progressive.

# Global rules

## Programming Paradigms
- Compose functions, build abstractions, separate concerns, but not over-engineering.
- Minimize side effects.
- Prefer functional programming but keep performance in mind. Keep mutable states local or as less as possible.
- Analyze O-notion complexity.
- Keep it DRY.
- Choose declarative programming over imperative programming.

## Code styles

- Prefer small descriptive composable functions. Do NOT write mega functions.
- Should use comments. Especially EVERY mutable states must be documented and explained and be justified.
- TypeScript v7 strict mode. Use `tsc`, not `tsgo`.
- Prefer `import type` for type-only imports.
- Do not use wide type casts. In particular, never use `as any` or `as never`.
  but narrow down cast like `as const` is allowed.
- Do not use default arguments in functions or React components.
- 4 spaces, single quotes, no trailing commas. Use biome to fix files directly.
- File names are kebab-case.
- React components are PascalCase.
- Functions and variables are camelCase.
- Hooks are camelCase and must start with `use`.
- If a file has exactly one export, the file name must match that export in kebab-case.

## Git
Multiple pi sessions may be running in this cwd at the same time, each modifying different files.
Git operations that touch unstaged, staged, or untracked files outside your own changes will stomp on other sessions' work.
Resolve conflicts only in files you modified.
If a conflict is in a file you did not modify, abort and ask the user.
Ignore unrelated files' changes.

## bash timeout
bash timeout should never be longer than 60 seconds.

# User Override
If the user's instructions conflict with any rule in AGENTS.md files, ask for explicit confirmation before overriding. Only then execute their instructions.

# Monorepo context

This repository is a pnpm v11 workspace for `vite-plugin-taro`, a Vite 8 / React 19 / Taro integration that builds
shared apps for WeChat Mini Program (`wx`) and H5 targets.

- `packages/vite-plugin-taro`: publishable Vite plugin package. Source lives in `src`, build output is `dist`, and
  package README files are synced during build.
- `packages/create-vite-taro`: publishable project generator package (`create-vite-taro`) with templates under
  `templates/default`.
- `packages/taro-react`: generated React 19-compatible fork of `@tarojs/react`, published as `vite-plugin-taro-react`.
- `packages/taro-plugin-framework-react`: generated React 19-compatible fork of `@tarojs/plugin-framework-react`,
  published as `vite-plugin-taro-plugin-framework-react`.
- `packages/loan-genius`: sample app used to test the plugin against `h5` and `wx` targets.
- `packages/native-comp-demo`: wx-only development project for native custom-component integration.
- `packages/hmr-stress-demo`: wx-only deep React tree fixture for paced and burst HMR stress tests.
- `patches`: local patches applied to upstream Taro 4.2.0 packages when regenerating the generated packages.

Node.js v26+ is available and can execute TypeScript natively.

# Commands

- `pnpm prepare:taro`: regenerate patched Taro packages from upstream npm tarballs and local patch files.
- `pnpm build:plugin`: build `packages/vite-plugin-taro`.
- `pnpm build:native-comp-demo:wx`: build the native-component project.
- `pnpm dev:native-comp-demo:wx`: start the native-component project with hot reload.
- `pnpm build:hmr-stress-demo:wx`: build the deep-tree HMR stress fixture.
- `pnpm dev:hmr-stress-demo:wx`: start the deep-tree HMR stress fixture with hot reload.
- `pnpm stress:hmr-stress-demo`: publish paced source edits against the running stress fixture.
- `pnpm stress:hmr-stress-demo:burst`: publish a rapid source-edit burst against the running stress fixture.
- `pnpm typecheck:plugin`: typecheck plugin.
- `pnpm typecheck:loan-genius`: typecheck loan-genius.
- `pnpm typecheck:native-comp-demo`: typecheck native-comp-demo.
- `pnpm typecheck:hmr-stress-demo`: typecheck hmr-stress-demo.
- `pnpm lint`: run Biome checks.
- `pnpm format`: run Biome checks with safe writes.
- `pnpm build:loan-genius:h5`: build the sample H5 target.
- `pnpm build:loan-genius:wx`: build the sample WeChat Mini Program target.
- `pnpm dev:loan-genius:h5`: run the sample H5 dev server.
- `pnpm dev:loan-genius:wx`: start the sample WeChat Mini Program target with hot reload.
- `pnpm preview:loan-genius:h5`: preview the built sample H5 target.
- `pnpm changelog`: regenerate `CHANGELOG.md` from git release tags.
- `pnpm publish:dry`: validate the release without publishing.
- `pnpm publish:all`: publish public packages in dependency order.
- `pnpm version:bump <version|major|minor|patch|premajor|preminor|prepatch|prerelease>`: bump every package version and
  the generated template's `vite-plugin-taro` dependency. Use `--dry-run` to preview changes and `--preid <id>` for
  prerelease bumps.
- `pnpm release <version|major|minor|patch|premajor|preminor|prepatch|prerelease>`: bump versions, regenerate
  `CHANGELOG.md` for the release, validate publishable packages, create the release commit/tag, and push unless
  `--no-push` is used. Use `--dry-run` to preview and `--preid <id>` for prerelease bumps.

# Generated files and packages

- User-facing documentation should show npm commands by default. Keep repository contributor/development instructions on
  pnpm.
- Do not manually edit `packages/vite-plugin-taro/dist`; rebuild it with `pnpm build:plugin`.
- Do not manually edit `CHANGELOG.md`; regenerate it with `pnpm changelog`, or let `pnpm release ...` update it for a
  release.
- Do not manually edit generated Taro package implementation files under `packages/taro-react` or
  `packages/taro-plugin-framework-react`. Change the relevant file in `patches/*@4.2.0-react19.patch`, then run
  `pnpm prepare:taro`.
- The generated Taro package `package.json` and `README.md` files are local metadata and are preserved by
  `pnpm prepare:taro`.
