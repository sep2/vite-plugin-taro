---
"vite-plugin-taro": patch
---

小程序开发模式通过压缩器保留 Fast Refresh 所需的函数名称，在保持压缩的同时输出 ES2018 兼容代码，避免同名类生成静态初始化块。
