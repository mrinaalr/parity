import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lint } from '../src/lint.js';
import { card } from './helpers.js';

const ctx = {
  name: 'alice',
  files: [{ path: 'brief.md', text: 'The stored response is returned byte for byte on a repeat with the same key, always.\nTicket ACME-INTERNAL 4471.' }],
};

test('flags an eight-word span copied from local context, by field', () => {
  const body = card();
  body.constraints = ['The stored response is returned byte for byte on a repeat with the same key.'];
  const flags = lint(body, ctx);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].field, 'constraints[0]');
  assert.equal(flags[0].source, 'brief.md');
});

test('short overlaps and evidence pointers are not flagged', () => {
  const body = card();
  body.evidence = [{ summary: 'A short note.', pointer: 'The stored response is returned byte for byte on a repeat with the same key.' }];
  assert.deepEqual(lint(body, ctx), []);
});

test('denylist hits are flagged whatever the length', () => {
  const body = card();
  body.problem = 'See acme-internal for details.';
  const flags = lint(body, ctx, ['ACME-INTERNAL']);
  assert.equal(flags.length, 1);
  assert.equal(flags[0].source, 'denylist');
});
