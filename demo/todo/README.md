# Tsumiki — specboard's own demo

A small, real task tracker (tasks with sub-tasks, roll-up completion, a leaves-only counter, smart
views, due-date chips) that specboard uses to explain itself. Small enough to read its whole spec in
a minute; rich enough that testing it is meaningful — five of its eight requirements read a value the
app *derives*, the kind that drifts silently.

- **The app** — [app/todo.html](app/todo.html) (one self-contained page) and its requirement list
  [app/requirements.html](app/requirements.html).
- **The spec** — [spec/todo/prd.md](spec/todo/prd.md) (the 8 requirements) and
  [spec/todo/test.spec.ts](spec/todo/test.spec.ts) (one flow that proves them all).
- **The narration** — [spec/todo/narration.json](spec/todo/narration.json) turns any recorded run
  into a subtitled, voiced video (see `tools/narrate-run.mjs` in the plugin).

## Run it

```bash
npm run setup      # vendor the specboard board code into this folder (one time)
npm install        # playwright
node serve-app.mjs &   # serve the app on http://localhost:4319
npm run board      # the specboard board for this project
npm run e2e        # the proving flow
```

`spec/_config.json` points the board and the tests at the app on port 4319. The flow pins a frozen
clock (`?now=`) so the date-derived chips are deterministic.
