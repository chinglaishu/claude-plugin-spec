// Where the demo app is served. Tsumiki is a single static page (demo/todo/app), so unlike a real
// project there is no login and no backend — just a static server on a fixed port (serve-app.mjs).
// The test navigates to APP_BASE + '/todo.html'. BOARD_APP_URL overrides for a one-off host.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SPEC = dirname(fileURLToPath(import.meta.url))
const config = JSON.parse(readFileSync(join(SPEC, '_config.json'), 'utf8'))
export const APP_BASE: string = (process.env.BOARD_APP_URL || config.baseUrl || 'http://localhost:4319').replace(/\/+$/, '')

// A FROZEN clock makes the date-derived requirements (R7 overdue/today) deterministic — the golden
// run pins the calendar so the same chips appear every run. The seed's due dates are relative to
// this day.
export const FROZEN_NOW = '2026-08-11T09:00:00.000Z'
