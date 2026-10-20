---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Keep scope lookup and epoch-based caching on template nodes. WX and TT DOM nodes return undefined from `_scope` and `getNearestCtx(node)` and skip context-invalidation root walks during child mutations and Page/component lifecycle changes.
