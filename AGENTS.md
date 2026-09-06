# Agent guidelines

## Design

- Favor simple, readable architecture over compatibility or minimal patches. Unify overlapping behavior and remove redundant code.
- Use small, descriptive, composable functions. Separate concerns, keep code DRY, and avoid over-engineering.
- Prefer declarative, functional code. Minimize side effects and mutable state; keep mutation local.
- Base all logic on evidence; never write defensive code.
- Consider performance and analyze Big-O complexity.

## Code style

- Use TypeScript v7 in strict mode with `tsc`, not `tsgo`. Prefer `import type` for type-only imports.
- No broad casts, especially `as any` or `as never`. Narrow assertions such as `as const` are allowed.
- No default arguments in functions or React components. Always use braces for conditional blocks.
- Use comments; document and justify every mutable state.
- Use 4 spaces, single quotes, and no trailing commas. Apply fixes with Biome.
- Use kebab-case filenames, PascalCase React components, and camelCase functions and variables. Hooks must start with `use`.
- If a file has exactly one export, its filename must match that export in kebab-case.

## Workflow

- Other sessions may be editing this workspace. Ignore unrelated changes; never modify or stage others' unstaged, staged, or untracked work.
- Resolve conflicts only in files you modified. For conflicts elsewhere, stop and ask the user.
- Keep bash timeouts at 30 seconds or less.
- If a user instruction conflicts with any `AGENTS.md` rule, ask for explicit confirmation before overriding it.
- Use npm commands in user-facing docs and pnpm for repository development instructions.

## Workspace

pnpm v11 monorepo integrating Vite 8, React 19, and Taro for WeChat (`wx`), Alipay (`zfb`), and H5 (`h5`). Node.js v26+ runs TypeScript natively.

Under `packages/`:

- `vite-plugin-taro`: published Vite plugin; source in `src`, output in `dist`, README files synced during build.
- `create-vite-taro`: published project generator; templates in `templates/default`.
- `taro-runtime`: published as `vite-plugin-taro-runtime`; bundles the Taro runtime, React renderer/framework runtime, and WX/ZFB/H5 entries from pinned, patched dependencies.
- `loan-genius`: sample app for `h5`, `wx`, and `zfb`.
- `native-comp-demo`: native custom-component fixture for `wx` and `zfb`.
- `hmr-stress-demo`: deep React tree HMR fixture for `wx` and `zfb`; automated IDE harness is WX-only.
- `towxml-stream-demo`: native Towxml streaming fixture for `wx` only.

`patches/` contains pnpm patches for the Taro 4.2.1 inputs used to build the runtime.

## Commands

See root `package.json` for all scripts.

- Build plugin/runtime: `pnpm build:plugin` / `pnpm prepare:taro`.
- Build or develop an app: `pnpm build:<app>:<target>` / `pnpm dev:<app>:<target>`; supported targets are listed above. Dev commands enable hot reload.
- Typecheck: `pnpm typecheck:plugin` or `pnpm typecheck:<app>`.
- HMR stress edits: `pnpm stress:hmr-stress-demo` (paced) or `pnpm stress:hmr-stress-demo:burst` (rapid).
- H5 preview: `pnpm preview:loan-genius:h5`.
- Biome: `pnpm lint` (check) / `pnpm format` (safe fixes).

## Generated files

- Never edit `packages/vite-plugin-taro/dist` manually; rebuild with `pnpm build:plugin`.
- Never edit `packages/taro-runtime/dist` manually. Edit `patches/*@4.2.1*.patch`, run `pnpm install`, then rebuild with `pnpm prepare:taro`.
