# Changelog

All notable changes to this project are documented here.

This file is generated from git release history by `pnpm changelog`.

## [0.3.1] - 2026-07-12

### Changed

- add test step to publish and windows workflows (f6af81a)

### Fixed

- handle optional `project.private.config.json` in WX companion assets and improve error handling for missing sources (f3a7b2f)

## [0.3.0] - 2026-07-12

### Changed

- add braces for conditional blocks in WX virtual modules for improved readability and structure (9453397)
- add spacing for improved readability in WX target modules (fd5ab3c)
- rename and relocate `miniprogram-dev-skill` files to `.agents` for improved organization and consistency (202a5d2)
- rename `sample` build scripts to `loan-genius` in workflows for improved clarity and alignment (bca5632)
- rename `sample` scripts and references to `loan-genius` for clarity and consistency in project structure (daa17fd)
- implement initial structure and configuration for `shadcn-demo` package with Taro integration (701202c)
- add `shadcn-demo` package with initial configuration and dependencies (8804d99)
- rename and relocate WX dev-server modules for clearer organization and improved maintainability (89b71af)
- rename and relocate `FullBuildScheduler` module for improved separation of concerns in WX dev-server implementation (6d00b2e)
- specify `assert.fail` argument as `Error` type for stricter type safety (8a80291)
- introduce `SerializedTaskQueue` and `FullBuildScheduler` for streamlined task coordination and WX development session refactor (e06e901)
- relocate and rename React Refresh virtual module for WX runtime and clean up unused TypeScript directive (56af8b9)
- relocate Taro CSS declarations to runtime-specific module for improved encapsulation (c618b69)
- enable `noUnusedLocals` and `noUnusedParameters` in tsconfig for stricter code checks (746b6ab)
- replace `export type` with `type` and adjust imports for cleaner code consistency throughout modules (c9cb60f)
- standardize plugin naming conventions in CSS and directive plugins (fe69f2c)
- consolidate target-specific configs into primary plugin modules and remove redundant modules (e6b6a55)
- extract Taro runtime resolution into new `taro-runtime` plugin and clean up redundant code (de57730)
- rename `virtual-module.ts` to `virtual-modules.ts` and update references for consistency (ebc911e)
- move `package-paths` logic into `utils/packages` for improved modularity and simplify runtime path resolution (a09cb11)
- move `module-paths` and `output-writer` utilities into shared `utils` and `filesystem` modules for cleaner code organization (f4a8736)
- consolidate WX dev-server and runtime state handling with immutable state transitions and ownership-based updates (45487d6)
- simplify WX dev-server by replacing `initialBundleReady` with `Promise.withResolvers` for cleaner initialization (a112c7f)
- streamline WX update client and server with improved timeout handling, request scheduling, and task execution (d3b2cc6)
- refactor (3f3f256)
- refine HMR probe results and architecture with clarified slot usage, output handling, and ownership details (418a385)
- simplify WX update client state by removing `sessionId` and unused commands, and streamline state transitions (9c62813)
- streamline WX dev-server output handling by replacing file writes with `publishBatch` and refactoring helpers (eb97791)
- remove unused `version` and `fullBuild` properties from `WxHotUpdateBridge` for cleaner runtime definition (efac009)
- remove unused `stampWxFullBuild` function from WX dev-server bundle output (9bce19b)
- replace `reactRefresh` checks with `development` flag for WX module context consistency (4d80279)
- simplify build context by replacing `BuildBehavior` with `development` flag (8b1c908)
- add unit tests for WX update client and server state transitions, and refactor WX update protocol server (2e89854)
- replace `WxPatchJournal` with `WxUpdateProtocolServer` for improved hot update handling and streamlined WeChat HMR implementation (b18fc3f)
- add detailed WX HMR probe results and architecture documentation for improved visibility into runtime, protocol, and state-preservation handling (a875046)
- rewrite WX HMR architecture guide to detail Rolldown runtime, protocol, and React Refresh integration (af482a7)
- enhance WX bundle output with default initialization for `__VITE_PLUGIN_TARO_WX__` object (145b6cb)
- update README.zh.md to clarify H5 script references as "Web Development Server" (a79d60f)
- update READMEs to reflect improved hot reload support across WeChat Mini Program and streamlined development scripts (440e753)
- update README.zh.md to clarify hot reload and Taro capabilities (5489381)
- improve WeChat Mini Program template with updated hot reload defaults and clearer documentation (18984f0)
- adjust WX config defaults and dev script for compatibility improvements (c0e8c34)
- remove commented-out `simulatorType` field from Vite config (a1d702b)
- migrate WX React Refresh handling to `transformWithOxc` and add unit test (0a47d76)
- update `@types/node` to 26.1.1 and adjust dependencies across packages (22841a4)
- update dependencies, including TypeScript to 7.0.2 and various package versions across the workspace (eea5879)
- simplify WX template builder usage by removing cached instance allocation (c41b608)
- update `vite` and `@vitejs/plugin-react` dependencies across packages (038bb95)
- improve error logging in WX dev-server session and enhance JS compatibility handling with refined chunk transformation logic (76d963a)
- replace `transform` with `transformWithOxc` in WX dev-server for JS compatibility handling (b499086)
- add syntax transformations for WX dev-server to ensure compatibility and enhance module handling (349fdb1)
- add unit test for `stampWxFullBuild` and remove nullish assignment from WX dev-server (02337eb)
- enhance WX dev-server session with custom `printUrls`, improve path handling, and add `picocolors` dependency (40479c5)
- better architecture (251f7db)
- split WX runtime into `rolldown-runtime` and `page-refresh-runtime`, improve modularity and simplify implementations (0a35536)
- extract CSS pipeline logic into `CssPipeline` class, update `BuildContext` for improved modularity, and unify WX/H5 target plugin structure (2bb8c10)
- format `emitWechatAssets` method for consistency and readability (7affbf7)
- simplify WX plugin by removing unused config and aligning with `BuildContext` standard (5cafe1f)
- update WX development session to leverage `BuildContext`, streamline config handling, and simplify runtime class name transformation (2cd1e09)
- unify `BuildContext` usage in WX modules, simplify structure, and standardize context references (154437b)
- update `BuildContext` references, streamline H5/WX Vite config creation, and align minify logic with context behavior (39b4e3f)
- update `BuildContext` usage in conditional directives plugin and tests for clarity and consistency (3a8062d)
- better arch (5610a98)
- streamline WX build/runtime implementation, unify global API, and enhance output handling (2ac3b40)
- add unit tests for conditional directives plugin to validate transformations and edge cases (195813c)
- simplify H5 Vite config creation by replacing `isProd` with direct environment flag (42dec9b)
- remove unused `isProd` constant from Vite Taro constants file (26ec15d)
- restructure Taro CSS plugin to unify runtime transformation and streamline WX support (c801518)
- add conditional directives plugin and simplify supported directive logic in documentation (8966c29)
- enhance WX development flow with incremental module graph, React Refresh, and HMR improvements (6e2e526)
- extract `createWechatProjectConfig` for clearer WX project configuration handling and enable hot reload (61cb4bf)
- integrate React plugin into main plugin creation logic and remove redundant H5-specific inclusion (f70e9bb)
- simplify H5 target plugin creation by directly returning plugin array (945ccb5)
- update WX target plugin creation to support multiple plugins (fe4e420)
- Revert "chore: implement finalized WX HMR runtime, session management, and snapshot creation" (4e0d4dd)
- add detailed architecture document for WX HMR replacement, outlining goals, workflows, and implementation plan (69269bc)
- implement finalized WX HMR runtime, session management, and snapshot creation (1ec0dbd)
- remove WX HMR draft documentation for cleanup and clarity (daf3eba)
- replace WX HMR draft with concise implementation summary, focusing on architecture, workflows, and runtime behavior (2f92857)
- add `wxDevRuntimeImportPath` constant for WeChat dev runtime (af64362)
- refactor plugin structure and simplify H5/WX target implementations (3766f00)
- rename `appComponentImport` to `appComponentFile` in build context type definition (6888def)
- use `toImportPath` for resolving app component import path in H5 target (cd24f47)
- document finalized WX HMR implementation details and update scripts and dependencies (f7f9763)
- replace wx HMR draft with finalized implementation plan, detailing architecture, workflows, and runtime behaviors (44c1fd4)
- simplify WeChat project config generation by reducing settings in `projectPrivateConfigJson` (aa2a03f)
- remove `project.private.config.json` from WeChat project config generation (1384fde)
- remove `vite build --watch` from WeChat dev scripts for simplicity and consistency (a8f241b)
- simplify WeChat project config generation by using `context.projectConfigJson` (622e3d3)
- add `react-refresh` and `@types/react-refresh` to dependencies (f77ff15)
- add `@types/react-refresh` to devDependencies for type support (4559b9d)
- add `@types/react-refresh` to devDependencies for type support (0d497f5)
- add `project.private.config.json` with `urlCheck` setting and update WeChat project config generation (597f44a)
- replace wx HMR draft with comprehensive implementation plan detailing architecture, workflows, and runtime behaviors (0d37ae7)
- remove wx HMR draft implementation notes for clarity and consistency with renamed file structure (356d521)
- extract `createPageComponentFile` utility for improved modularity in page path resolution (b2144ac)
- refactor WX runtime handling and JS transformation for improved clarity and modularity (433c8cb)
- rename and export `transformConditionalDirectives` as `transformTaroConditionalDirectives` for clarity and reusability (d0f46fe)
- overhaul wx HMR documentation with detailed architecture, process workflows, and runtime behaviors (077ef4b)
- disable `urlCheck` in Vite config for improved flexibility during development (9ec4530)
- update references and documentation to consistently replace "DevTools" with "微信开发者工具" and refine descriptions of tool usage and functionality (53af4f9)
- add foundational documentation for miniprogram-dev-skill including project setup, automation tools, and cloud integration usage (04647c2)
- add comprehensive agent reasoning and action guidelines to AGENTS.md (6b801d8)
- rename wx HMR implementation plan file for clarity (34c5a5b)
- remove redundant `box-border` style from compute-header container for cleaner layout (101d0ea)
- apply global box-sizing for consistent layout handling (d04a3e9)
- add `box-border` style to compute-header container for consistent box model handling (e1eb5a5)
- refactor Loan Calculator to functional components with hooks, centralized state management, and improved modularity (c66b642)
- refine wx HMR implementation plan with updated payload responsibilities, transport details, and terminology adjustments (157e544)
- refine wx HMR implementation plan with clarified `hmr/update.js` responsibilities, payload handling, and terminology adjustments (0efc5ff)
- streamline wx HMR implementation plan by removing redundant runtime details and clarifying file responsibilities (64bf685)
- refine wx HMR implementation plan with updated runtime handling, module organization, and target-agnostic HMR plugin design (2835ff8)
- refine wx HMR implementation plan with updated runtime responsibilities, initial snapshot handling, and stable artifact rules (b3cf685)
- refine wx HMR implementation plan to standardize source edit delivery via `hmr/update.js` (241c1a1)
- refine wx HMR implementation plan with updated terminology, clarified scope rules, and improved file responsibilities (df37b15)
- update Vite config to disable skyline render and enable compile hot reload (7733866)
- remove redundant validation steps from wx HMR implementation plan (8edbedc)
- clarify application source vs. React component HMR handling in implementation plan (1cf42d9)
- streamline wx HMR implementation plan, refine HMR file responsibilities, and clarify React Refresh identity rules (6adc76d)
- condense wx HMR implementation plan, clarify React Refresh integration, and refine fallback strategies (b75a077)
- rewrite wx HMR implementation plan with improved architecture, execution transport rationale, and clear fallback rules (a9d5070)
- refine wx HMR implementation plan with updated file organization and module ID guidelines (3a7f95b)
- refine React vs. Mini Program update handling in HMR implementation plan (3152c0f)
- draft implementation plan for WeChat Mini Program HMR with Vite integration (65c8566)
- ensure React runtime `initNativeApi` hook registers before Taro initialization (34b3f66)
- set custom navigation style in Vite config for Mini Program compatibility (7d61c01)
- enable `flex` scrolling in calculator pages for improved layout handling (0688171)
- reorder imports in calculator page for consistency (e8b8089)
- streamline CSS imports and update H5 shim for better modularity (f548e05)
- remove `virtual:taro/css` imports and update CSS handling for improved modularity (ba4bee2)
- update CSS imports to align with Tailwind v4 and Taro runtime changes (f34ad3c)
- update CSS imports to ensure proper layering for Taro and Tailwind integration (ca44d0a)
- refine Tailwind entry import check in `shouldGenerateTailwindCss` (deecb85)
- align documentation with updated Web terminology and styling guidelines (86a725e)
- refine README.zh.md for improved hot reload description and cleanup (dfb87a8)
- update README.zh.md to include Taro 4 and Web support (c289c99)
- update README.zh.md for Web terminology alignment and Skyline guidance (e673545)
- update documentation and CSS imports for Taro and Tailwind integration (42d7295)
- update README.md for improved Tailwind setup and streamlined feature descriptions (1dbbbda)
- update README.zh.md for improved Tailwind setup and Skyline support (49f4d9c)
- add Lightning CSS visitor to handle pseudo-elements in WX build (be6e298)
- replace TailwindCSS adapter with custom Taro CSS pipeline (21d58f4)
- update H5 CSS handling and package exports (08299fd)
- remove TailwindCSS dependency and improve H5 component CSS handling (5ccaa33)
- adjust resolveId function formatting for readability (0e6e72d)

### Fixed

- ensure CSS3 single-colon pseudo-elements compatibility for WeChat Mini Program (6d9f079)
- address WeChat DevTools compilation issue by cleaning up virtual module comments (29e19d3)
- include template env file (eb5b224)

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
