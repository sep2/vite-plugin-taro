# Dependency patch series

pnpm applies one combined patch to each package version. We maintain **8 feature patches across 5 packages**, with explicit application order in [`series.json`](./series.json). The files in `series/` are authoritative; `generated/` is reproducible installation output.

## Feature inventory

| Package | Ordered feature patches | Purpose |
| --- | --- | --- |
| `@tarojs/plugin-html@4.2.1` | `01-html-display-defaults` | Populate upstream HTML inline/block element sets without the Taro compiler rewriting installed files. |
| `@tarojs/plugin-framework-react@4.2.1` | `01-react19-root-api` | Select `createRoot` by renderer capability instead of a React 18 version-string check. |
| | `02-mini-app-page-rendering` | Keep one React App tree, broadcast App data to native Pages, project Page children through an outlet, and seed App/Page data in the same initial native batch. |
| | `03-h5-router-container` | Give H5 Page children a dedicated `taro_router` container so routing CSS does not target unrelated App siblings. |
| `@tarojs/react@4.2.1` | `01-react19-reconciler` | Adapt event priorities, host configuration, commit updates, root error callbacks, and reconciler helpers to React 19. |
| | `02-app-page-outlet-projection` | Mark the outlet's ancestor branch after each React commit so recursive native components forward the Page slot exactly once. |
| `@tarojs/runtime@4.2.1` | `01-mini-app-page-rendering` | Make the App host a scheduler, separate `app.*` and `page.*` updates, and keep Page roots out of App serialization. These changes form one coordinated feature, not independent per-file patches. |
| `canvas-confetti@1.9.4` | `01-canvas-confetti-enhancements` | Keep all existing confetti enhancements together: rotation/tilt controls, frame-clock repeat emission, cached path drawing, and DOMMatrix input normalization. Source, browser and module builds stay aligned. |

React 19 support spans the renderer and framework packages. Mini App/Page rendering spans the runtime, renderer and framework packages; their corresponding patches must stay coordinated. The series are maintenance boundaries, **not independently selectable runtime features**.

This split preserves the previous patched package bytes. It does not implement synchronous first-frame rendering: the existing initial App/Page data batch still uses Taro's asynchronous scheduler.

## Compose and install

After the initial `pnpm install`, run:

```sh
pnpm patches:build
pnpm install
pnpm prepare:taro
pnpm build:plugin
```

To work on one package:

```sh
pnpm patches:build @tarojs/runtime@4.2.1
```

The composer:

1. Uses `pnpm patch --ignore-existing` to extract the pristine version into a temporary directory, reusing pnpm's package cache.
2. Records the upstream tree in a temporary Git index; no commits or Git identity are required.
3. Applies each feature with `git apply --index`, in manifest order. Conflicts fail immediately.
4. Generates one upstream-relative diff, including additions, deletions and binary changes, with deterministic Git diff settings.
5. Removes temporary package trees. Only after every selected series succeeds does build mode write the combined patches.

It deliberately does not call `pnpm patch-commit`: pnpm registration is already declared in `pnpm-workspace.yaml`, and composition must not reinstall dependencies or rewrite that configuration. `pnpm install` refreshes the lockfile after generated patch contents change. Like ordinary `pnpm patch`, extraction records ignored patch-session bookkeeping under `node_modules`.

Commit the feature patches, generated patches, manifest/configuration changes and refreshed lockfile together. Normal installs and CI consume the committed combined files. There is **no install hook**, no second patch pass over `node_modules`, and no manual editing of runtime build output.

## Edit or add a feature

A feature diff is relative to upstream **plus all preceding features**, not to the final installed package. Do not concatenate diffs or generate a feature from an already fully patched dependency.

For example, editing the runtime's first feature (Bash example; use an absolute temporary path outside the repository):

```sh
repo="$PWD"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
pnpm patch @tarojs/runtime@4.2.1 --ignore-existing --edit-dir "$work/package"
git -C "$work/package" init --quiet --object-format=sha1
git -C "$work/package" -c core.autocrlf=false add --force --all

# For a later feature, apply all earlier feature files here with git apply --index.
base="$(git -C "$work/package" write-tree)"
feature="$repo/patches/series/@tarojs__runtime@4.2.1/01-mini-app-page-rendering.patch"
git -C "$work/package" apply --index "$feature"

# Edit the extracted package files now. For a new feature, omit the preceding apply.
# Do not apply subsequent features before capturing this feature's diff.
git -C "$work/package" -c core.autocrlf=false add --force --all
git -C "$work/package" diff --cached --binary --full-index \
  --no-color --no-ext-diff --no-textconv --no-renames \
  --src-prefix=a/ --dst-prefix=b/ "$base" -- > "$feature"

pnpm patches:build @tarojs/runtime@4.2.1
pnpm install
```

Register new feature files in `series.json` at their intended position. Recompose the full series: edits to an earlier feature may require rebasing later features. Keep descriptions in this inventory aligned with the series.

## Verify

```sh
pnpm patches:check
pnpm typecheck:scripts
node --test scripts/compose-patch-series.test.ts
```

Check mode recomposes from pristine upstream and compares bytes. It does not rewrite generated patches, workspace configuration or the lockfile. CI runs it after frozen installation on Linux and Windows. Patch files are forced to LF in `.gitattributes`; the temporary index disables host clean filters and newline conversion so upstream contents remain unchanged.
