const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
function worker() {
  const stored = { settings: { provider:'jev' }, apiKey:'jev-key', cloudflareApiKey:'cf-key' };
  const context = vm.createContext({ URL, Date, chrome: {
    runtime:{onMessage:{addListener(){}}}, action:{onClicked:{addListener(){}}},
    permissions:{contains:async()=>true},
    storage:{local:{get:async()=>({...stored}),set:async v=>Object.assign(stored,v)}}
  } });
  context.importScripts = (...files) => files.forEach(f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'..',f),'utf8'),context));
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../background.js'),'utf8'),context);
  return { context, stored };
}
test('in-flight Jev results are discarded when the user switches to Clef', async()=>{
  const { context, stored } = worker();
  let finish, started;
  const ready = new Promise(r=>{started=r;});
  context.JevApi.detectText = async()=>{started(); return new Promise(r=>{finish=r;});};
  const pending = context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'manual');
  await ready;
  stored.settings = { provider:'cloudflare', cloudflareAccountId:'a'.repeat(32), clefModel:'@cf/cloudflare/clef' };
  delete stored.scoreCache;
  finish({probability:91});
  const result = await pending;
  assert.equal(result.results.length,0);
  const lookup = await context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'lookup');
  assert.equal(lookup.results.length,0);
});

test('cache is isolated by model even if settings are changed outside the options page', async()=>{
  const { context, stored } = worker();
  context.JevApi.detectText = async()=>({probability:91});
  await context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'manual');
  const same = await context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'lookup');
  assert.equal(same.results[0].probability,91);
  stored.settings = {...stored.settings,model:'jev-preview'};
  const other = await context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'lookup');
  assert.equal(other.results.length,0);
});

test('Cloudflare scanning uses its token rather than the saved Jev credential', async()=>{
  const { context, stored } = worker();
  stored.settings = { provider:'cloudflare',cloudflareAccountId:'a'.repeat(32),clefModel:'@cf/cloudflare/clef' };
  let key;
  context.JevApi.detectText = async(_text,selectedKey)=>{key=selectedKey;return {probability:72};};
  const result=await context.analyzeItems([{id:'tweet',text:'long enough reply for a model request'}],'manual');
  assert.equal(result.ok,true);
  assert.equal(result.results[0].probability,72);
  assert.equal(key,'cf-key');
});
