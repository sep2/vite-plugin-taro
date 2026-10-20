---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Use SDK-provided event target datasets for WX and TT DOM rendering. WX node creation skips native SID metadata writes. Native event data remains correct for ID-less targets and duplicate IDs, while template events retain logical-index resolution and shared event batching, normalization and form handling.
