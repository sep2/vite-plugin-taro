---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Require explicit Page-root selection and child-context forwarding on Mini renderer hosts. TT and template hosts use the standard root and preserve parent context; WX retains Page-local creation.
