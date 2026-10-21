---
'vite-plugin-taro': patch
'vite-plugin-taro-runtime': patch
---

Separate Mini Page mounting from Taro's onLoad lifecycle. VPT prepares and mounts Pages through a shared mount function; Taro delivers load after the React commit and retains lifecycle ordering and teardown. WX Component Pages mount during attached and deliver native onLoad on the same mounted instance. Template Pages compose mounting and load delivery during native onLoad.
