---
'vite-plugin-taro-runtime': patch
---

Use direct indexed traversal for subtree event-index cleanup, preserving SID/ID deletion order and move semantics while avoiding per-node traversal callbacks.
