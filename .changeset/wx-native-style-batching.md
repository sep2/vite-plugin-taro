---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Batch WX DOM native style forwarding within each synchronous React style update. Serialize and assign the final CSS once while preserving logical mutations, MutationObserver old values, style conversions, and immediate standalone imperative updates.
