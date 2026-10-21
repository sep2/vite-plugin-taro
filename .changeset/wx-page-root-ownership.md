---
'vite-plugin-taro': patch
---

Let WX own native Page-root teardown through its exit transitions. Keep the App/Page outlet logical while React synchronously releases Page state, effects, refs and document ownership. Native content mutations within each Page retain their normal behavior.
