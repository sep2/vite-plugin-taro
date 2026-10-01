---
'vite-plugin-taro': patch
---

Vite、Rolldown 或 `vite-plugin-taro-runtime` 的实际版本与 VPT 验证的版本不一致时，通过 `vpt:deps` 插件使用 Vite 的日志器输出兼容性警告，不再抛错阻止构建或开发服务器启动。运行时版本与 VPT 自身的发布版本比较，适用于工作区和已发布包；多个依赖版本不一致时会分别提示，全部匹配时保持静默。依赖固定版本与项目模板不变，仍建议统一构建器与热更新运行时版本。
