# Pre-push test hook — setup

The site now has a **pre-push git hook** that runs the smoke tests
(`scripts/smoke-test.js`) automatically. If any test fails, the push is
blocked so broken code never leaves your machine.

Files involved:

- `.githooks/pre-push` — the hook (version-controlled, shared with anyone who clones).
- `scripts/smoke-test.js` — the tests it runs.
- `package.json` — adds `npm test` and `npm run install-hooks`.

## One-time setup (run in your terminal, from the project folder)

A partial `.git` folder was created but couldn't be finished from the
assistant's sandbox, so start clean. Open **Git Bash** or **PowerShell** in
`C:\1ClaudeProject\ArsenalEPLPrediction` and run:

### PowerShell
```powershell
Remove-Item -Recurse -Force .git                 # remove the broken partial repo
Remove-Item -Force scripts\_mounttest.json       # remove leftover probe file
git init
git config core.hooksPath .githooks   # activate the hook
git add .
git commit -m "Initial commit: Arsenal Predictor + pre-push smoke tests"
```

### Git Bash
```sh
rm -rf .git
rm -f scripts/_mounttest.json
git init
git config core.hooksPath .githooks
git add .
git commit -m "Initial commit: Arsenal Predictor + pre-push smoke tests"
```

Then connect your remote and push (the hook runs here):
```sh
git remote add origin <your-repo-url>
git push -u origin main
```

## How it behaves

- On every `git push`, the hook runs `node scripts/smoke-test.js`.
- Tests pass → push proceeds.
- Tests fail → push is aborted with the failing checks listed.
- Emergency bypass: `git push --no-verify`.

## Requirements

- **Node.js 18+** on your PATH (the tests use the built-in `fetch`).
- Internet access to your Supabase project (the tests hit the live backend
  and clean up after themselves).

## Run the tests manually anytime

```sh
npm test
```

> Note: `.githooks/pre-push` must stay executable. On Windows this is handled
> automatically. On macOS/Linux, run `chmod +x .githooks/pre-push` once.
