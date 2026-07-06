# Changelog

All notable changes to this project are documented here.

This file is generated from git release history by `pnpm changelog`.

## [0.2.2] - 2026-07-06

### Changed

- add TailwindCSS v4.3.1 to dependencies in loan-genius and default template (a8d66d6)
- enable type declarations and update `exports` field in package.json (e045644)
- replace `IS_WEAPP` and `IS_H5` with `import.meta.env.VITE_PLUGIN_TARO_TARGET` (c858b5c)
- adjust formatting for consistent code style in `index.tsx` (df0203b)

## [0.2.1] - 2026-07-06

### Changed

- replace `tsgo` with `tsc` for type checking and upgrade to TypeScript 7 (aa2f598)

## [0.2.0] - 2026-07-06

### Added

- Add `pnpm changelog` script and automate changelog updates during release (dd271b2)
- Add .gitattributes file to enforce LF line endings for patch files (6da3423)
- Add Windows CI workflow and refactor path normalization (e8e50d0)

### Changed

- rename to AGENTS.md (8e0c1b2)
- Convert functions to async and replace `npmPack` with `fetchUpstreamTarball` (43345c8)
- Replace `getNpmCommand` with `runNpm` and improve npm CLI resolution (b46ab0b)
- Use platform-specific commands and optimize `replaceGeneratedPackage` (cd83e04)

### Removed

- Remove English READMEs for loan-genius and vite-plugin-taro (97cce8c)

### Fixed

- Use platform-specific `git` command in `publish-packages.ts` (9b912a4)

## [0.1.8] - 2026-06-22

### Changed

- Update README links and add Simplified Chinese README file (b61bbe9)

## [0.1.7] - 2026-06-21

### Added

- Add `release` script for versioning, tagging, and CI-triggered publishing; update README to reflect streamlined release process. (9c1ebbc)

### Changed

- Update GitHub Pages workflow to trigger on version tags (`v*.*.*`) instead of `main` branches (9894c3d)
- Revise READMEs: document Trusted Publishing workflow, clarify release process, and update `pnpm publish:all` usage. (706141c)

## [0.1.6] - 2026-06-21

Initial release.
