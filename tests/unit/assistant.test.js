import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const {
  supported, unsourced, claims, jsonIn,
} = await import('../../dist/main/assistant/guard.js');
const {
  redactKey, estimateTokens, baseProblem, endpoint, explainStatus, hostOf,
} = await import('../../dist/main/assistant/provider.js');
const { whatLeaves } = await import('../../dist/main/assistant/inspector.js');
const { readingFrom, readPostingRequest, researchFrom } = await import('../../dist/main/assistant/tasks.js');
const { sendThrough } = await import('../../dist/main/net/gate.js');

const POSTING = [
  'We are hiring a Staff Engineer for our platform group.',
  'The range for this role is $180,000 to $215,000 depending on experience.',
  'This position is hybrid, three days a week in our Austin office.',
].join('\n\n');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

// --- the gate ------------------------------------------------------------

test('a request with a body is counted, and what went is counted too', async () => {
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response('{"ok":true}', { status: 200 });
  const records = [];
  try {
    await sendThrough('https://api.example.test/v1/messages', 'Asking the assistant', {
      identifyAs: 'cairn', delayMs: 0, timeoutMs: 1000, onRecord: (r) => records.push(r),
    }, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"hello":"there"}' });
  } finally {
    globalThis.fetch = before;
  }
  assert.equal(records.length, 1, 'an assistant request that is not recorded is one the bar cannot count');
  assert.equal(records[0].host, 'api.example.test');
  assert.equal(records[0].reason, 'Asking the assistant');
  assert.equal(records[0].bytes, '{"ok":true}'.length + '{"hello":"there"}'.length,
    'a request carrying a resume must not be recorded as though it sent nothing');
});

test('a model on this machine may be reached over plain http, and nothing else may', async () => {
  const gate = { identifyAs: 'cairn', delayMs: 0, timeoutMs: 100, onRecord: () => {} };
  await assert.rejects(
    () => sendThrough('http://api.example.test/v1/chat/completions', 'test', gate, { method: 'POST' }),
    /only speaks https/,
  );
  const before = globalThis.fetch;
  globalThis.fetch = async () => new Response('{}', { status: 200 });
  try {
    const answer = await sendThrough('http://localhost:11434/v1/models', 'test', gate, { method: 'GET' });
    assert.equal(answer.ok, true, 'a local model is the one case where there is no network to protect');
  } finally {
    globalThis.fetch = before;
  }
});

test('the loopback exception does not let anything else in over http', () => {
  for (const bad of ['http://evil.test', 'http://localhost.evil.test', 'http://127.0.0.1.evil.test']) {
    assert.match(String(baseProblem(bad)), /only speaks https/, `${bad} was let through`);
  }
  for (const good of ['https://api.anthropic.com', 'http://localhost:11434', 'http://127.0.0.1:8080']) {
    assert.equal(baseProblem(good), null, `${good} was refused`);
  }
});

// --- what a model is allowed to have said --------------------------------

test('a fact whose quote is not in the posting is dropped rather than corrected', () => {
  const answered = (json) => readingFrom({ text: JSON.stringify(json), citations: [] }, POSTING);

  const real = answered({
    pay: { quote: 'The range for this role is $180,000 to $215,000 depending on experience.', reading: 'Up to 215k' },
  });
  assert.equal(real.verdicts.length, 1);
  assert.deepEqual(real.dropped, []);

  const invented = answered({
    pay: { quote: 'The range for this role is $250,000 to $310,000.', reading: 'Up to 310k' },
  });
  assert.deepEqual(invented.verdicts, [], 'a quote that is not in the posting was written, not read');
  assert.equal(invented.dropped.length, 1, 'and dropping it silently is the same as believing it');
});

test('the band comes from Cairn’s own parser reading the quote', () => {
  // Not from the figure the model typed: the same code reads every other posting, and
  // a second reader would eventually disagree with the first.
  const read = readingFrom({
    text: JSON.stringify({
      pay: {
        quote: 'The range for this role is $180,000 to $215,000 depending on experience.',
        reading: 'anything at all, and it is not used',
      },
    }),
    citations: [],
  }, POSTING);
  assert.equal(read.pay.min, 180000);
  assert.equal(read.pay.max, 215000);
  assert.equal(read.pay.provenance, 'aggregated', 'a reading is a claim, never an employer’s own figure');
});

test('whitespace may differ between the posting and the quote, and nothing else may', () => {
  assert.equal(supported('This position is hybrid,   three days a week\nin our Austin office.', POSTING), true);
  assert.equal(supported('This position is remote.', POSTING), false);
  assert.equal(supported('the', POSTING), false, 'a quote too short to be evidence is not evidence');
});

test('a note is sourced whole or refused whole', () => {
  const cited = [{ url: 'https://example.test/about', title: 'About', quoted: '' }];
  const good = researchFrom({
    text: 'They build warehouse software, according to example.test.',
    citations: cited,
  });
  assert.ok('note' in good);

  const half = researchFrom({
    text: 'They build warehouse software, according to example.test. They are about to be acquired.',
    citations: cited,
  });
  assert.ok('refused' in half, 'half sourced is the harder one to read, because nothing marks which half');

  const none = researchFrom({ text: 'They are a great place to work.', citations: [] });
  assert.ok('refused' in none, 'a provider that returned no source cannot have grounded anything');
});

test('the sentences worth checking in a draft are listed, never judged', () => {
  const found = claims('I led the migration in 2019.\nI enjoy this kind of work.\nWe cut latency by 40%.');
  assert.equal(found.length, 2, 'a sentence with a figure or a year is one somebody has to check');
  assert.ok(found.every((one) => /\d/.test(one)));
});

test('JSON is read out of a reply however it was wrapped', () => {
  assert.deepEqual(jsonIn('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(jsonIn('Here you go: {"a":1} -- hope that helps'), { a: 1 });
  assert.equal(jsonIn('I could not do that.'), null, 'a reply in the wrong shape is not half read');
});

// --- what leaves ---------------------------------------------------------

test('the inspector shows the payload in full and never the key', () => {
  const request = readPostingRequest(POSTING, 'claude-opus-5', 'high');
  const leaving = whatLeaves('read-posting', request, {
    id: 'anthropic', kind: 'anthropic', base: 'https://api.anthropic.com', model: 'claude-opus-5',
    keyHeld: true, effort: 'high', quiet: [], addedAt: '',
  }, 'zz-not-a-real-key-value', 'https://example.test/pricing');

  assert.equal(leaving.host, 'api.anthropic.com');
  assert.equal(leaving.messages[0].content, POSTING, 'the posting is shown whole, not summarised');
  assert.ok(leaving.system.length > 0);
  assert.doesNotMatch(JSON.stringify(leaving), /not-a-real-key-value/, 'the key must never reach the interface');
  assert.match(leaving.key, /^zz-/);
  assert.ok(leaving.estimatedTokens > 0);
});

test('a key is never shown past its first three characters', () => {
  for (const key of ['zz-not-a-real-key-either-and-long', 'short', 'ab']) {
    const shown = redactKey(key);
    assert.equal(shown.replace(/•/g, ''), key.slice(0, 3),
      'everything but the first three characters has to be dots');
    assert.ok(shown.length <= 15, 'and the length must not give the key away either');
  }
  assert.equal(redactKey(''), 'none');
});

test('a reading asks for the sentence word for word, because that is what the guard checks', () => {
  const request = readPostingRequest(POSTING, 'm', 'high');
  assert.match(request.system, /exactly/i);
  assert.equal(estimateTokens(request) > 0, true);
});

// --- the wiring ----------------------------------------------------------

test('nothing but the ask panel can send to a provider', () => {
  // The interface hands over a ticket, never a payload, so what goes is exactly what
  // was shown. A screen that called send itself could send something else.
  const offenders = walk('src/renderer')
    .filter((file) => !file.endsWith(join('components', 'ask.ts')))
    .filter((file) => /assistant\s*\.\s*(send|prepare)\s*\(/.test(readFileSync(file, 'utf8')))
    .map((file) => file.replace('src/renderer/', ''));
  assert.deepEqual(offenders, [], 'these reach a provider without going through the panel that shows what leaves');
});

test('what is sent is built in the main process and held there', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /pending\.set\(ticket/, 'the request has to be held, or the ticket means nothing');
  assert.match(handlers, /pending\.delete\(ticket\)/, 'a ticket must be spent, or one inspection sends twice');
  const send = /ipcMain\.handle\('assistant:send'[\s\S]*?\n {2}\}\);/.exec(handlers);
  assert.ok(send !== null);
  assert.match(send[0], /recordAssistantRun\(run\)/, 'a request that is not recorded is one the log cannot show');
});

test('the assistant reaches the network through the gate and nowhere else', () => {
  for (const file of walk('src/main/assistant')) {
    const body = readFileSync(file, 'utf8');
    assert.ok(!/(?<![.\w])fetch\s*\(/.test(body), `${file} calls fetch directly`);
  }
  const adapters = ['src/main/assistant/anthropic.ts', 'src/main/assistant/openai.ts'];
  for (const file of adapters) {
    assert.match(readFileSync(file, 'utf8'), /sendThrough\(/, `${file} does not go through the gate`);
  }
});

test('nothing pure shares a module with anything that imports electron', () => {
  // A pure module that imports electron cannot be loaded by the suite at all, which is
  // how three of these ended up untested.
  for (const file of ['guard.ts', 'provider.ts', 'inspector.ts', 'tasks.ts', 'run.ts']) {
    const body = readFileSync(join('src/main/assistant', file), 'utf8');
    assert.ok(!/from 'electron'/.test(body), `${file} imports electron, so none of it can be tested`);
  }
});

test('the key is sealed before it is written, and the vault never holds one in clear', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  const save = /ipcMain\.handle\('assistant:save'[\s\S]*?\n {2}\}\);/.exec(handlers);
  assert.ok(save !== null);
  assert.match(save[0], /seal\(key\)/, 'a key written straight into the vault is locked once, not twice');

  const keys = readFileSync('src/main/assistant/keys.ts', 'utf8');
  assert.match(keys, /basic_text|REAL/, 'a stand-in for a keychain is not a keychain');
  assert.match(keys, /isEncryptionAvailable/);
});

test('a provider that cannot cite is never asked to research anybody', () => {
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /!canGround\(provider\)/,
    'research through a provider with no sources is a confident paragraph nobody can check');
  const pipeline = readFileSync('src/renderer/views/pipeline.ts', 'utf8');
  assert.match(pipeline, /!ready \|\| !grounded/, 'and the button should be absent, not disabled');
});

// --- what ships ----------------------------------------------------------

test('the shipped provider list carries no key and nowhere to put one', () => {
  const body = readFileSync('defaults/assistants.json', 'utf8');
  assert.doesNotMatch(body, /"(apiKey|api_key|token|secret|password|authorization|headers)"/i);
  assert.doesNotMatch(body, /sk-|\/home\/|\/Users\//, 'a key or a path out of a home directory');
});

test('every shipped provider is reachable, and only a local one over plain http', () => {
  const { providers } = JSON.parse(readFileSync('defaults/assistants.json', 'utf8'));
  assert.ok(providers.length >= 4);
  for (const one of providers) {
    if (one.base === '') continue;
    assert.equal(baseProblem(one.base), null, `${one.id} would not be allowed`);
    assert.ok(['anthropic', 'openai-compatible'].includes(one.kind), `${one.id} speaks nothing Cairn knows`);
  }
  assert.ok(providers.some((one) => one.id === 'custom' && one.base === ''),
    'somebody has to be able to point Cairn at a provider it has never heard of');
});

test('Cairn ships no price table, on purpose', () => {
  // A figure that is quietly a year old is worse than none, and the panel says so.
  const body = readFileSync('defaults/assistants.json', 'utf8');
  assert.doesNotMatch(body, /"(price|prices|perMillion|inputCost|outputCost)"/i);
  for (const one of JSON.parse(body).providers) {
    assert.ok(!('price' in one), `${one.id} ships a price`);
  }
});

test('the addresses and statuses are said in words a person can act on', () => {
  assert.equal(endpoint('https://api.example.test/', '/v1/models'), 'https://api.example.test/v1/models');
  assert.equal(hostOf('https://api.example.test/v1'), 'api.example.test');
  assert.match(explainStatus(401, 'api.example.test'), /key/i);
  assert.match(explainStatus(429, 'api.example.test'), /minute/i);
  assert.doesNotMatch(explainStatus(500, 'api.example.test'), /^\d/, 'a bare status reads as a fault in Cairn');
});

test('an empty note is not a sourced note', () => {
  assert.deepEqual(unsourced('', [{ url: 'https://example.test' }]), []);
  assert.equal(unsourced('A sentence long enough to need a source behind it.', []).length, 1);
});

test('there is one provider, and switching does not leave the old one behind', () => {
  // An upsert keyed on the provider's name left two rows and a SELECT ... LIMIT 1 with
  // nothing to order by, so which one was live was whichever the database handed back.
  const repo = readFileSync('src/main/repo.ts', 'utf8');
  const save = /saveAssistantProvider\([\s\S]*?\n {2}\}/.exec(repo);
  assert.ok(save !== null);
  assert.match(save[0], /DELETE FROM assistant_provider/, 'the row has to be replaced, not added to');
  assert.match(save[0], /before\.id === provider\.id \? existing : ''/,
    'a key belongs to one provider and must not be carried to another');
});

test('an assistant that cannot be asked anything is not offered anywhere', () => {
  // A provider row appears the moment somebody touches the chooser, which is not the
  // same as having a key and a model.
  const handlers = readFileSync('src/main/ipc/handlers.ts', 'utf8');
  assert.match(handlers, /ready: provider !== null && provider\.model\.trim\(\) !== ''/);
  for (const view of ['documents.ts', 'answers.ts', 'pipeline.ts']) {
    const body = readFileSync(join('src/renderer/views', view), 'utf8');
    assert.match(body, /\bready\b/, `${view} decides on something other than whether a provider row exists`);
  }
});

test('a reading is drawn where it was asked for, and not redrawn away', () => {
  // Redrawing the view after an answer rebuilds the card, which closes it and takes the
  // answer with it -- so pressing the button appeared to do nothing at all.
  const requisitions = readFileSync('src/renderer/views/requisitions.ts', 'utf8');
  const readButton = /function readButton\([\s\S]*?\n\}/.exec(requisitions);
  assert.ok(readButton !== null);
  assert.ok(!/\brefresh\(\)/.test(readButton[0]),
    'a redraw here throws away the answer it was drawn to show');
  assert.match(readButton[0], /\.payline/, 'the band on the row has to be written in place instead');
});

test('reading a lead twice replaces the first reading rather than stacking it', () => {
  const requisitions = readFileSync('src/renderer/views/requisitions.ts', 'utf8');
  assert.match(requisitions, /readByAssistant/, 'a reading has to be tellable from a rule’s verdict');
  assert.match(requisitions, /querySelectorAll\('\.readrow'\)/, 'and the old one has to come off the card');
});

test('the payload is not on screen while the screen is being shared', () => {
  // The panel shows the posting and the employer in full, which is the one thing
  // masking exists to keep off a call. Turning masking off is one press.
  const ask = readFileSync('src/renderer/components/ask.ts', 'utf8');
  assert.match(ask, /screenShareOn\(\)/, 'the panel ignores masking and shows everything anyway');
  assert.match(ask, /Turn masking off/, 'and it has to say how to read it');
});

test('the panel that says what Cairn never does accounts for an assistant', () => {
  // It says Cairn does not send your search criteria anywhere. With a provider brought,
  // the posting and the skills you listed do go somewhere, and that panel is the app's
  // own claim about itself -- the one piece of text that must never be out of date.
  const privacy = readFileSync('src/renderer/views/privacy.ts', 'utf8');
  const panel = /'What Cairn never does'[\s\S]*?\n {2}\);/.exec(privacy);
  assert.ok(panel !== null, 'the panel is not where this check thought it was');
  assert.match(panel[0], /assistant === null/, 'it says the same thing whether one is set up or not');
  assert.match(panel[0], /shown to you/, 'and it has to say what protects you when one is');
});
