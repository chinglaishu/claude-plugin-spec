import { test } from 'node:test'
import assert from 'node:assert/strict'
import { islandJson } from './build-board.mjs'

// fix round 1 (task-5 review B-5): the JSON island carries prd text (titles, Then lines); a title
// containing </script> or a line terminator must not be able to end the script or break the parse
test('islandJson escapes <, >, & and U+2028/9 so the island is inert inside <script>', () => {
  const raw = { t: '</script><b>&  ' }
  const s = islandJson(raw)
  assert.ok(!s.includes('<') && !s.includes('>') && !s.includes('&'))
  assert.ok(!s.includes(' ') && !s.includes(' '))
  assert.deepEqual(JSON.parse(s), raw)
})
