---
'vite-plugin-taro-runtime': patch
---

Allocate each element’s Style declaration on first access. Keep unstyled attribute reads, template hydration and cloning allocation-free for style storage while preserving style identity, mutations, observer records and native forwarding.
