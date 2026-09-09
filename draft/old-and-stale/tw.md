# Tailwind WXSS HMR Plan

## Status

This document plans development-only Tailwind CSS HMR for the WX target. Production continues to emit one deterministic
`app.wxss`, and H5 continues to use its existing Vite CSS pipeline.

The development target writes physical page stylesheets at their native WeChat paths:

```text
${page.path}.wxss
```

A style update always replaces the complete file. The runtime never injects CSS, evaluates CSS received over HTTP, or appends an
incremental fragment directly to a WXSS file.

## Goals

- Reuse the public `weapp-tailwindcss/generator` implementation for Tailwind v4 generation, candidate validation, incremental
  additions, exact rebuilds after removals, and WeChat selector/style conversion.
- Generate the Tailwind utilities required by each Page module and its reachable component graph.
- Preserve the running App, Page, and React state while WeChat DevTools recompiles a changed page WXSS file.
- Publish CSS before JavaScript when one source edit changes both Tailwind candidates and executable code.
- Keep class rewriting and generated selectors synchronized from one generated `classSet`.
- Support split Tailwind roots such as:

```css
@import 'tailwindcss/theme.css';
@import 'tailwindcss/preflight.css';
@import 'tailwindcss/utilities.css';
```

- Keep production WX and all H5 behavior unchanged.

## Non-goals

- Reusing Vite's browser `__vite__updateStyle()` runtime.
- Sending CSS text through the HMR control protocol.
- Appending `result.incrementalCss` directly to a physical file.
- Reimplementing Tailwind generation, candidate validation, class escaping, or WXSS adaptation.
- Making development output byte-for-byte equal to production output.
- Incrementally patching individual CSS rules inside WeChat DevTools.

## Upstream behavior to reuse

`createWeappTailwindcssGenerator()` exposes the required generation behavior:

```ts
const result = await generator.generate({
    candidates,
    incrementalCache: true,
    scanSources: false,
    target: 'weapp'
});
```

For an addition, the upstream cache generates only missing candidate rules and appends them to its cached result. The returned
`result.css` is still the complete stylesheet. For a removal, upstream detects that the requested candidate set is smaller and performs
an exact full regeneration. Changes to the resolved Tailwind source or its dependencies also create a new cache identity and therefore a
full generation.

The WX development compiler will always write `result.css`. `result.incrementalCss` is diagnostic and optimization metadata only.
Writing that fragment by itself would lose the existing stylesheet after a whole-file replacement.

The upstream Vite serve adapter is not reused for delivery. It targets Vite's browser module graph, rewrites the JavaScript module that
contains `const __vite__css`, and sends Vite WebSocket CSS updates. The WX runtime instead relies on WeChat DevTools observing a physical
WXSS replacement.

## Development stylesheet ownership

Development separates stable global styles from route-dependent styles:

- `app.wxss` contains global application CSS and the stable Tailwind theme/preflight contribution.
- `${page.path}.wxss` contains the generated utilities and page-owned CSS required by that Page module's complete reachable graph.
- A shared component's styles are included in every page stylesheet whose graph reaches that component.
- Vite-discoverable dynamic-import edges participate in the page graph so a lazy component is styled before it first renders.

The initial implementation may retain a common generated prefix in more than one page stylesheet when that is required for correctness.
Removing duplicate theme or preflight output is an output optimization, not part of HMR correctness.

Production retains its existing eager CSS semantics and flattens every contribution into `app.wxss`.

## State model

One development style compiler owns all mutable Tailwind state. It is not distributed across unrelated Vite hooks.

```ts
interface SourceCandidateState {
    candidates: Set<string>;
    revision: number;
}

interface PageStyleState {
    candidates: Set<string>;
    classSet: Set<string>;
    css: string;
    moduleIds: Set<string>;
    revision: number;
}
```

The compiler stores:

- the resolved Tailwind root and dependency fingerprint;
- original source text by module ID;
- extracted candidates by module ID;
- the complete static and dynamic module closure for every page;
- reverse module-to-page membership for invalidation;
- the last successful candidate set, generated CSS, and class set for every page;
- the union of all current page class sets used by WX JavaScript transformation;
- one serialized generation queue and a monotonically increasing source revision.

Candidate extraction always runs against original or pre-class-transform source. It must never scan JavaScript after
`weapp-tailwindcss` has encoded class names.

## Candidate collection

The public generator is reusable, but the upstream Vite adapter's per-file candidate store is internal. The plugin therefore owns a
small candidate index rather than copying the complete upstream HMR adapter.

For every candidate-bearing module:

1. Store its latest source text.
2. Extract and validate its candidates.
3. Replace that module's previous candidate set.
4. Compute the exact added and removed candidates.
5. Find affected pages through the reverse page graph.

The page candidate set is the union of candidates for every module in that page's complete Vite graph closure. Reference counting or
set union must preserve a candidate when it is removed from one module but remains present in another.

CSS files are tracked separately from TS, TSX, JS, JSX, and framework-generated modules. A Tailwind root, CSS-first directive, imported
stylesheet, or generator dependency change is runtime-affecting and invalidates every page that uses that root. It does not use the
addition-only fast path.

Candidate synchronization for one file is serialized by revision. A slower extraction from an older edit must not overwrite a newer
candidate set.

## Page generation algorithm

For each affected page, the compiler performs the following transaction:

1. Wait for all candidate extraction associated with the current source revision.
2. Recompute the page's complete module closure when graph edges changed.
3. Compute the exact page candidate union.
4. Validate candidates through the upstream generator.
5. Generate WX CSS with `incrementalCache: true`, `scanSources: false`, and `target: 'weapp'`.
6. Combine generated Tailwind CSS with the page's transformed ordinary CSS contributions.
7. Validate the final output as WXSS.
8. Replace `${page.path}.wxss` with the complete generated stylesheet.
9. Commit the page's candidate set, CSS, class set, and revision in memory.
10. Recompute the global runtime class-set union.
11. Allow the matching JavaScript HMR update to be published.

Generation is serialized initially because the upstream incremental cache is process-global. Edit coalescing may skip an obsolete queued
revision before generation begins, but an in-progress result is committed only if its revision is still current.

### Additions

If the exact new set is a superset of the cached candidate set, upstream can compile only the missing candidates. The compiler still
replaces the whole page WXSS with `result.css`.

### Removals

The compiler always passes the exact current candidate set. It does not preserve deleted development CSS. Upstream detects removed
candidates, performs a complete regeneration, and returns a stylesheet without the removed rules.

This deliberately does not use the upstream Vite adapter's default `generator.hmr.preserveDeletedCss: true` policy. Whole-file WeChat
replacement makes exact deletion straightforward and avoids stale CSS accumulating during long development sessions.

### Tailwind source changes

Changes to the Tailwind root, split imports, CSS-first directives, theme values, plugins, or registered generator dependencies invalidate
all page style states. The compiler resolves the Tailwind source again and regenerates every page from exact candidates.

## Incremental cache isolation

In `weapp-tailwindcss` 5.1.16, the public incremental cache key includes the resolved Tailwind source, project root, dependency
fingerprint, target, and style options. It does not include the output page or route. Multiple pages generated from the same Tailwind root
therefore contend for the same cache entry.

This does not compromise correctness: a differing candidate set causes upstream to regenerate a correct complete result. It can reduce
incremental performance when generation alternates between pages, especially for shared-component edits that invalidate several pages.

The implementation must not manufacture page identity by adding comments to Tailwind source or by changing unrelated style options.
The preferred upstream improvement is one of:

```ts
incrementalCache: {
    scope: page.path
}
```

or a cache owned by each `createWeappTailwindcssGenerator()` instance. With either design, the plugin retains one generator/cache scope
per page. Until upstream exposes page isolation, generation remains serialized and cache locality is treated as an optional optimization.
The measured full-generation fallback is acceptable for correctness.

## Class transformation consistency

WX class rewriting and page WXSS generation are one transaction:

- The page's generated `classSet` defines the selectors available in that page WXSS.
- The union of all current page class sets is passed to the upstream JS/template transformer.
- A JavaScript update that introduces a new encoded class cannot be published until every affected page WXSS containing its selector has
  been written successfully.
- Removing a class from one page does not remove it from the runtime union while another page still uses it.
- Class encoding remains build-time behavior; the React/Taro renderer performs no runtime rewriting.

A shared module update may affect several pages. All affected WXSS transactions must succeed before publishing the shared JavaScript
update. Partial style publication followed by a shared JS update is forbidden.

## HMR ordering

### Tailwind candidate and JavaScript change

```text
read newest source revision
    → extract and validate candidates
    → regenerate every affected page
    → replace affected page WXSS files
    → commit the new runtime class-set union
    → compile and publish update.js
    → evaluate accepted HMR boundaries
    → perform React Refresh
```

### CSS-only change

```text
read newest CSS revision
    → resolve affected Tailwind/CSS dependencies
    → regenerate affected page WXSS files
    → replace complete files
    → stop
```

A CSS-only edit does not publish `update.js`, invalidate a JavaScript acceptance boundary, or request a hard refresh.

### Native graph change

A change that adds or removes an App/Page entry, changes native configuration, or changes an unsupported graph boundary continues to use
the complete native rebuild path. Tailwind HMR does not attempt to hide a required native rebuild.

## File publication

The output writer uses the same canonical native path planner as production and companion-asset generation. It must not derive a second
route-to-file mapping.

Each page stylesheet replacement is written through the development output writer. The replacement must:

- stay within the generated WeChat project;
- finish before JavaScript update publication;
- preserve the last successful file when generation or validation fails;
- avoid exposing a truncated intermediate file;
- produce a filesystem event that WeChat DevTools observes reliably.

Use a same-directory temporary file followed by replacement unless DevTools validation proves that rename-based replacement is not
observed. Any alternative must retain the no-truncated-file guarantee.

The HTTP/control channel carries only revision and status metadata. It never carries CSS source.

## Failure and concurrency rules

- Tailwind generation, ordinary CSS transformation, or WXSS validation failure leaves the previous page styles and JavaScript update in
  place and reports the error through the development diagnostics channel.
- A failed shared-component style transaction publishes none of the associated JavaScript update.
- Obsolete queued revisions are discarded before generation where possible.
- A completed obsolete generation result is not committed over a newer revision.
- Deleting a source module removes its candidates before affected pages regenerate.
- Deleting a page clears its style state through the native rebuild path.
- Generator dependency changes invalidate the resolved Tailwind source before any page regeneration begins.
- The last successful CSS and class-set union remain active after failure so retained application state stays internally consistent.

## Implementation stages

### 1. Extract a production-independent generator service

- Resolve the plugin-owned Tailwind source through `weapp-tailwindcss/generator`.
- Generate WX-compatible CSS from an explicit candidate set.
- Return complete CSS, `classSet`, dependencies, and whether upstream returned an incremental fragment.
- Register generator dependencies with Vite's watcher.
- Keep the current production CSS pipeline and H5 plugin unchanged.

### 2. Add the candidate and page graph index

- Track source text and candidates by stable Vite module ID.
- Build complete static and Vite-discoverable dynamic closures per Page module.
- Maintain reverse module-to-page membership.
- Handle additions, updates, deletions, and graph-edge changes.
- Serialize extraction by revision.

### 3. Generate physical page WXSS

- Replace empty development page WXSS assets with generated content.
- Combine Tailwind output and ordinary page CSS.
- Rewrite the complete file for additions and removals.
- Preserve production's single `app.wxss` output.

### 4. Integrate the HMR scheduler

- Make candidate synchronization and CSS generation prerequisites of JS update publication.
- Update the JS/template transformer with the committed runtime class-set union.
- Suppress JS delivery for CSS-only changes.
- Coalesce rapid edits without committing stale output.

### 5. Improve upstream cache scoping

- Propose a public per-generator or caller-supplied incremental cache scope upstream.
- Add page-scoped generators when that capability is available.
- Retain exact whole-file regeneration as the correctness fallback.

### 6. Remove temporary production-only CSS handling from development

The current `generateBundle` WXSS compatibility finalizer only serves final bundle output. Development page generation must produce fully
adapted WXSS directly and must not depend on that finalizer. Remove any development coupling to it after page generation is active. The
production finalizer remains until the upstream split-import adaptation defect is fixed or the production pipeline also moves to the
owned generator service.

## Tests

### Unit tests

- Added candidates return a complete stylesheet containing old and new rules.
- Removed candidates disappear after full regeneration.
- A candidate shared by two modules remains when only one module removes it.
- Page closures include shared components and discoverable dynamic imports.
- A shared-component edit invalidates every importing page and no unrelated page.
- Older asynchronous extraction results cannot overwrite a newer revision.
- Cross-page cache contention never returns another page's CSS.
- Split Tailwind imports produce adapted WXSS with no unresolved imports.
- Generated WXSS contains no unsupported `rem`, `@property`, `:where`, browser-escaped utility selectors, or empty custom properties.
- Runtime class-set union updates correctly after page additions and removals.
- A generation failure preserves the previous CSS, class set, and revision.

### Vite integration tests

- Initial development output contains non-empty `${page.path}.wxss` files.
- Adding a class to one page rewrites its WXSS before its JS update is published.
- Removing that class removes the selector from the rewritten file.
- Editing a shared component rewrites all affected page files before shared JS publication.
- A CSS-only edit writes WXSS without creating `update.js`.
- Rapid consecutive edits publish only the newest coherent CSS/JS revision.
- Tailwind root or theme changes regenerate every page.
- Generator dependency files are registered with the watcher.
- Production still emits only `app.wxss` plus empty page stylesheets.
- H5 output and CSS HMR remain unchanged.

### WeChat DevTools validation

- Keep component state, page state, and the App-owned React root alive while a page WXSS file is replaced.
- Add a previously unseen utility and verify that it applies without a hard refresh.
- Remove a utility and verify that its rule disappears.
- Edit a shared component and navigate between every affected page.
- Exercise input interaction before and after CSS HMR.
- Confirm that split Tailwind imports compile without WXSS timeout or syntax errors.
- Confirm that the chosen whole-file replacement method is observed consistently by DevTools.

## Completion criteria

The feature is complete when:

1. A TSX edit can add or remove a Tailwind utility without restarting the App or Page.
2. Every affected `${page.path}.wxss` is a complete, valid, current stylesheet.
3. CSS is committed before JavaScript that references its encoded selectors.
4. CSS-only edits do not enter JavaScript HMR.
5. Shared components update every affected page coherently.
6. Failed or stale generations never replace the last successful CSS/JS pair.
7. Production WX and H5 behavior remain unchanged.
8. WeChat DevTools validation demonstrates retained React state and correct visual updates.
