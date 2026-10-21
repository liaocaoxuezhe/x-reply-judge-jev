const test = require('node:test');
const assert = require('node:assert/strict');
const api = require('../api.js');
const cfg = { ...api.DEFAULT_API_SETTINGS, provider: 'cloudflare', cloudflareAccountId: 'a'.repeat(32), clefModel: '@cf/cloudflare/clef' };
const response = (body) => ({ ok: true, status: 200, json: async () => body });

test('Clef routes to the account endpoint with its model selector and unwraps the REST result', async () => {
  let request;
  const result = await api.detectText('这是需要判断的中文原文。', 'cf-key', cfg, { fetch: async (url, init) => {
    request = { url, init };
    return response({ success: true, errors: [], result: { model: 'clef', answers: { ai_generated: { type: 'noul', noul: 0.72 } } } });
  } });
  assert.equal(request.url, `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/ai/run/@cf/cloudflare/clef`);
  assert.equal(request.init.headers.Authorization, 'Bearer cf-key');
  assert.deepEqual(JSON.parse(request.init.body), { model: 'clef', state: '这是需要判断的中文原文。', questions: { ai_generated: { type: 'noul', instructions: cfg.instructions } } });
  assert.deepEqual(result, { probability: 72, model: 'clef' });
});

test('Clef Flash selects both the correct route and request model', async () => {
  await api.detectText('text', 'k', { ...cfg, clefModel: '@cf/cloudflare/clef-flash' }, { fetch: async (url, init) => {
    assert.match(url, /\/clef-flash$/);
    assert.equal(JSON.parse(init.body).model, 'clef-flash');
    return response({ success: true, result: { answers: { ai_generated: { type: 'noul', noul: 0 } } } });
  } });
});

test('Cloudflare API-level errors surface rather than becoming missing probability errors', async () => {
  await assert.rejects(api.detectText('text', 'k', cfg, { fetch: async () => response({ success: false, errors: [{ code: 10000, message: 'Authentication error' }] }) }), /Authentication error/);
});

test('invalid account or unsupported Clef model fails before sending a credential', async () => {
  let called = false;
  for (const bad of [{ cloudflareAccountId: '' }, { cloudflareAccountId: '../other' }, { clefModel: 'unknown' }]) {
    await assert.rejects(api.detectText('text', 'secret', { ...cfg, ...bad }, { fetch: async () => { called = true; } }), /account|model/i);
  }
  assert.equal(called, false);
});
