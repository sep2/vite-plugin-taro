---
'vite-plugin-taro': patch
---

Recover Mini Program HMR after DevTools Compile restarts the App runtime. Announce the build on socket open and rebuild whenever patches have been published since its baseline, regardless of acknowledgements or retained history. Skip patch execution before the socket opens. Send reports only while the native socket is open.
