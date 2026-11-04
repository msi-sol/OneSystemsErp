// Exercise the actual framework wire format, including React's decode guard.
// Run with: node --conditions=react-server --test tests/unit/boq-upload-transport.test.cjs
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { encodeReply } = require('next/dist/compiled/react-server-dom-webpack/client.node');
const { decodeReply } = require('next/dist/compiled/react-server-dom-webpack/server.node');

for (const size of [800_000, 8 * 1024 * 1024]) {
test(`multipart preserves a ${size}-byte XLSX beyond positional-string limits`, async () => {
  const bytes = Buffer.alloc(size, 65);
  // This was the production request shape that failed before our action ran.
  await assert.rejects(
    async () => decodeReply(await encodeReply(['', bytes.toString('base64'), 'Completed.xlsx']), {}),
    /Maximum array nesting exceeded/,
  );

  const form = new FormData();
  form.set('projectId', '');
  form.set('file', new File([bytes], 'Completed.xlsx'));
  const [decoded] = await decodeReply(await encodeReply([form]), {});
  assert.equal(decoded.get('projectId'), '');
  assert.equal(decoded.get('file').name, 'Completed.xlsx');
  assert.deepEqual(Buffer.from(await decoded.get('file').arrayBuffer()), bytes);
});
}
