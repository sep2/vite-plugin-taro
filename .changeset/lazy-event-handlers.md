---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Allocate event-handler tables on first mutable access. Keep listener queries, propagation and native subscription checks lazy while preserving handler identity, HTML aliases, once listeners and callback replacement.
