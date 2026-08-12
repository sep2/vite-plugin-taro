---
name: test-published-packages
description: Validates the latest published create-vite-taro and vite-plugin-taro packages from npm in a fresh disposable project, including npm provenance, installation, WX production build, and WeChat DevTools HMR state retention. Use after publishing new package versions or when asked to test npm latest independently from the workspace.
compatibility: Requires Node.js, npm, WeChat DevTools, wechatide, and a valid manageable WeChat Mini Program AppID.
---

# Test Published Packages

Validate npm artifacts, never workspace source or workspace-linked dependencies. The decisive HMR assertion is that a visible source edit reaches the live WeChat page while pre-existing React state remains unchanged.

## Inputs and fixed names

Use these defaults unless the user provides alternatives:

- npm packages: `create-vite-taro` and `vite-plugin-taro`
- npm tag: `latest`
- disposable project: `/tmp/vpt-published-packages-test`
- `wechatide` client: `Pi`
- AppID source: `<repository-root>/packages/loan-genius/.env.local`
- source edit: `src/pages/home/index.tsx`

Do not modify the repository. Keep all generated files, installs, source edits, and build output inside the disposable project.

## 1. Establish npm identity

Record the registry versions before creating anything:

```bash
npm view create-vite-taro@latest version
npm view vite-plugin-taro@latest version
```

Both versions must exist. Record them separately; do not assume they are equal.

## 2. Create a genuinely fresh npm project

Delete only the fixed disposable directory, then invoke npm's published creator:

```bash
rm -rf /tmp/vpt-published-packages-test
cd /tmp
npm create vite-taro@latest vpt-published-packages-test
cd /tmp/vpt-published-packages-test
npm install
```

Verify the generated `package.json`, `vite.config.ts`, and `.env.local` use current public names (`vpt`, `VptTarget`, and `VITE_VPT_*`). Confirm the installed plugin version:

```bash
npm ls vite-plugin-taro --depth=0
```

The resolved version must match `npm view vite-plugin-taro@latest version`. Reject workspace links, local paths, `file:`, and `link:` resolutions.

## 3. Supply the fixed test AppID

Always read the test AppID from the repository's fixed `packages/loan-genius/.env.local` location and overwrite the disposable project's `.env.local` with the normalized key:

```text
VITE_VPT_WECHAT_APP_ID=<appid>
```

The fixed repository fixture authorizes this reuse. Do not ask the user for permission or AppID selection, and do not call `get_user_appids`. Fail at this stage if the source file or a valid `VITE_VPT_WECHAT_APP_ID` value is unavailable. Never print the AppID value in the final response or logs you summarize.

## 4. Validate static package behavior

Run:

```bash
npm run typecheck
npm run build:wx
```

Read `dist/wx/project.config.json` before opening DevTools. Its `appid` must be present, non-empty, and not `touristappid`; `compileType` must be `miniprogram`.

## 5. Prepare WeChat DevTools

This skill delegates WeChat operations to the repository's `miniprogram-dev-skill`. Read its `SKILL.md`, current `skill.yaml`, and the initializer, automator, and debugger scene instructions before invoking `wechatide`.

At session start, directly run exactly one status check using the version from `skill.yaml`; do not ask the user to authorize DevTools before invoking it:

```bash
wechatide -c Pi -t check_devtools_status --skill-version <current-skill-version>
```

The command owns DevTools startup and automatic client authorization. Continue only when the result has an `openid` and no version warning.

## 6. Start published development mode

Run the generated project's script from its own directory and capture its PID and log. Remove the production output first so stale files cannot satisfy the development-output checks. A tool timeout must be at most 30 seconds, so use a background process and poll its log:

```bash
cd /tmp/vpt-published-packages-test
rm -rf dist/wx
npm run dev:wx > /tmp/vpt-published-packages-test-vite.log 2>&1 &
echo $! > /tmp/vpt-published-packages-test-vite.pid
```

Wait until the log contains `WeChat DevTools`. Fail if Vite exits or readiness does not appear promptly. Record any port fallback as diagnostic information, but it is not itself a failure.

Before opening the project in DevTools, make sure the freshly generated `dist/wx` is ready:

- the directory exists;
- `app.json`, `app.js`, `pages/home/index.js`, and `project.config.json` exist and are non-empty;
- `project.config.json` is valid JSON with a present, non-empty, non-`touristappid` `appid` and `compileType: "miniprogram"`;
- the recorded Vite process is still running.

Only after every output check passes, open exactly this output:

```bash
wechatide -c Pi -t open_project_window --project /tmp/vpt-published-packages-test/dist/wx
```

Wait for `automation_runtime_info` to report `pages/home/index`. A first cold automator timeout may be followed by one `simulator_refresh` and one bounded retry; collect console evidence if it still fails.

## 7. Prove HMR preserves state

The default template contains a React counter rendered through a native component. Use runtime evidence rather than screenshots alone.

1. Read page data with `automation_page_action --action getData` and locate the node whose `nn` is `native-counter`; record its initial `count`.
2. Trigger the native component's `increment` event through the rendered `component` node:

```bash
wechatide -c Pi -t automation_element_action \
  --project /tmp/vpt-published-packages-test/dist/wx \
  --selector component \
  --action trigger \
  --type increment
```

3. Poll page data until the native-counter count is exactly initial + 1.
4. Copy `src/pages/home/index.tsx` to a backup in the disposable project.
5. Replace exactly one visible text literal with a unique test literal. Make the replacement deterministic and assert the old literal occurs exactly once before writing.
6. Poll `dist/wx/hmr/patches.js` until it contains the unique literal. This proves the published dev host emitted a patch.
7. Poll live page data until both are true in the same observation:
   - the unique text is present;
   - native-counter `count` is still initial + 1.
8. Restore the source from backup in a `finally` path.
9. Poll until the original text returns and the count still equals initial + 1.
10. Query console content with:

```bash
wechatide -c Pi -t get_app_console_content \
  --project /tmp/vpt-published-packages-test/dist/wx \
  --command "grep -i -E 'error|fail|warn|exception'"
```

The corrected HMR validation passes only if patch publication, live text replacement, state retention, source restoration, restored live text, and clean console all pass.

Use `automation_evaluate` only for bounded read-only tree traversal. A suitable traversal recursively visits `page.data.root.cn`, identifies `nn === 'native-counter'`, and searches text nodes by their `v` value. Do not mutate runtime state through evaluate.

## 8. Cleanup always

Cleanup is mandatory on success, failure, or interruption:

1. Restore edited source if a backup exists.
2. Close only the disposable project window:

```bash
wechatide -c Pi -t close_project_window --project /tmp/vpt-published-packages-test/dist/wx
```

3. Terminate the recorded npm/Vite process tree gracefully, then force only remaining recorded children if necessary.
4. Confirm no process command or cwd references `/tmp/vpt-published-packages-test`.
5. Do not quit all WeChat DevTools unless the user explicitly requests it.
6. Do not delete the disposable project by default; retain it for diagnosis. Delete it only when requested or before the next fresh run.
7. Confirm the repository working tree was not changed. Never restore or discard unrelated user changes.

## Failure handling

- Report the exact failed stage and command/tool evidence.
- Do not call a partial HMR check a pass.
- Installation audit findings are diagnostics; distinguish them from package functional validation.
- Do not request DevTools authorization in advance. If automatic authorization cannot produce an `openid` or DevTools requires unavoidable interactive approval, stop and report the environment blocker.
- If a test fails after the source edit, restore source and perform cleanup before reporting.
- Never silently substitute local workspace builds for npm packages.

## Final report

Keep the result concise and include:

- published creator and plugin versions;
- fresh creation and install result;
- installed plugin provenance/version;
- typecheck and WX build result;
- DevTools route reached;
- HMR patch observed;
- state before interaction, after interaction, after edit, and after restoration;
- console result;
- cleanup result;
- any non-blocking npm audit diagnostics.
