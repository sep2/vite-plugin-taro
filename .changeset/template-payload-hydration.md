---
'vite-plugin-taro-runtime': patch
---

Create lazy hydration callbacks only when preparing template payloads, reducing Mini DOM node allocations while preserving final-state serialization.
