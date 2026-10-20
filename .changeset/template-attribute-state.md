---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Limit pre-mutation attribute classification to template rendering. WX and TT DOM attribute updates preserve shared logical mutation and observer behavior while avoiding prop and handler enumeration.
