import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toText, findPhrase, countMentions } from '../../dist/main/screening/text.js';

test('a double-escaped description still yields its text', () => {
  // The failure this exists for: some boards escape their HTML twice, so stripping
  // tags first finds none and the entities stay in the text -- including the dash in
  // the middle of a pay range, which is how a board full of ranges reports none.
  const doubled = '&lt;div&gt;Base pay is $150,000 &amp;mdash; $180,000 a year.&lt;/div&gt;';
  const text = toText(doubled);
  assert.ok(!text.includes('&lt;'), 'entities survived');
  assert.ok(!text.includes('<div>'), 'tags survived');
  assert.match(text, /\$150,000 — \$180,000/);
});

test('ordinary html is unchanged in meaning', () => {
  assert.equal(toText('<p>Hello <b>there</b></p>'), 'Hello there');
});

test('script and style content never reaches the text', () => {
  const text = toText('<p>Real</p><script>var secret = 1;</script><style>.a{}</style>');
  assert.equal(text, 'Real');
  assert.ok(!text.includes('secret'));
});

test('a phrase is quoted with the sentence it sat in', () => {
  const found = findPhrase('We are remote first. You must be onsite two days a week. Apply now.', ['onsite']);
  assert.ok(found);
  assert.equal(found.evidence, 'You must be onsite two days a week.');
});

test('mentions are counted and never thresholded', () => {
  const counts = countMentions('Kubernetes, then more Kubernetes, and some Terraform.', ['Kubernetes', 'Terraform', 'Ruby']);
  assert.deepEqual(counts, { Kubernetes: 2, Terraform: 1 });
});

test('extraction is bounded and cannot spin', () => {
  const pathological = '&amp;'.repeat(500);
  assert.doesNotThrow(() => toText(pathological));
});
