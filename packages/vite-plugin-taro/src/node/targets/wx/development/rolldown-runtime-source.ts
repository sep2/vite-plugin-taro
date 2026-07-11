/**
 * Self-contained source injected into Rolldown's DevEngine as the WX module bootstrap runtime.
 *
 * This TypeScript module runs in Node and only exports source text. The exported JavaScript becomes
 * `runtime.js`, executes before every application module, and therefore cannot import Taro, React,
 * or any module that depends on the runtime it is creating.
 */
export const wxRolldownRuntimeSource = `
var BaseDevRuntime = DevRuntime;
class WxHotContext {
  callbacks = [];
  data = {};
  _internal = { updateStyle() {}, removeStyle() {} };
  constructor(moduleId) { this.moduleId = moduleId; }
  accept(...args) {
    if (args.length === 0) {
      this.callbacks.push({ deps: this.moduleId, callback: undefined });
    } else if (args.length === 1 && typeof args[0] === 'function') {
      this.callbacks.push({ deps: this.moduleId, callback: args[0] });
    } else if (args.length === 1) {
      this.callbacks.push({ deps: args[0], callback: undefined });
    } else {
      this.callbacks.push({ deps: args[0], callback: args[1] });
    }
  }
  acceptExports(_exports, callback) { this.accept(callback); }
  dispose() {}
  prune() {}
  invalidate() {}
  on() {}
  off() {}
  send() {}
}
class WxDevRuntime extends BaseDevRuntime {
  contexts = new Map();
  patchedModules = new Set();
  applyingPatch = false;

  createEsmInitializer = (id, initialize, _deduplicate, result) => () => {
    if (!initialize) return result;
    if (!this.applyingPatch && this.patchedModules.has(id)) {
      initialize = undefined;
      return result;
    }
    const callback = initialize;
    initialize = undefined;
    result = callback(id);
    if (this.applyingPatch) this.patchedModules.add(id);
    return result;
  };

  createCjsInitializer = (id, initialize, _deduplicate, module) => () => {
    if (module) return module.exports;
    if (!this.applyingPatch && this.patchedModules.has(id)) return this.loadExports(id);
    module = { exports: {} };
    initialize(module.exports, module, id);
    if (this.applyingPatch) this.patchedModules.add(id);
    return module.exports;
  };

  createModuleHotContext(moduleId) {
    const previous = this.contexts.get(moduleId);
    const context = new WxHotContext(moduleId);
    if (previous) {
      context.callbacks = previous.callbacks;
      context.data = previous.data;
    }
    this.contexts.set(moduleId, context);
    return context;
  }

  beginPatch() { this.applyingPatch = true; }
  endPatch() { this.applyingPatch = false; }

  applyUpdates(boundaries) {
    for (const [boundary, acceptedVia] of boundaries) {
      const context = this.contexts.get(boundary);
      if (!context) continue;
      const callbacks = [...context.callbacks];
      if (boundary === acceptedVia) context.callbacks = [];
      for (const { deps, callback } of callbacks) {
        if (!callback) continue;
        if (Array.isArray(deps)) {
          if (deps.includes(acceptedVia)) callback(deps.map((id) => this.loadExports(id)));
        } else if (deps === acceptedVia) {
          callback(this.loadExports(acceptedVia));
        }
      }
    }
  }
}
globalThis.__VITE_PLUGIN_TARO_WX__ = { version: 0, ready: false };
globalThis.__rolldown_runtime__ = new WxDevRuntime(undefined, 'vite-plugin-taro-wx');
`
