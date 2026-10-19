---
'vite-plugin-taro-runtime': patch
---

Move existing siblings through a single native insertion while retaining logical node identity, React state, refs, and events. Template rendering continues to synchronize the complete final child order.

WX DOM custom components receive the native `moved` lifecycle during same-parent reordering. Genuine deletion continues to fire `detached`, and cross-parent movement retains its removal/insertion lifecycle.
