// Optional live smoke test. Uses the ignored local .env; never prints credentials.
const fs = require('node:fs');
const api = require('../api.js');
const env = Object.fromEntries(fs.readFileSync(require('node:path').join(__dirname,'../.env'),'utf8').trim().split('\n').map(line=>{const at=line.indexOf('=');return [line.slice(0,at),line.slice(at+1)];}));
(async()=>{
 const results=[];
 for(const model of ['@cf/cloudflare/clef','@cf/cloudflare/clef-flash']){
  const cfg={...api.DEFAULT_API_SETTINGS,provider:'cloudflare',cloudflareAccountId:env.CLOUDFLARE_ACCOUNT_ID,clefModel:model};
  const start=Date.now();
  const result=await api.detectText('这个思路很有启发，关键不是工具有多强，而是如何建立自己的方法论。',env.CLOUDFLARE_CLEF_API_TOKEN,cfg,{maxRetries:0,timeoutMs:30000});
  results.push({requestedModel:model,...result,ms:Date.now()-start});
 }
 fs.writeFileSync(require('node:path').join(__dirname,'clef-live-result.json'),JSON.stringify({checkedAt:new Date().toISOString(),results},null,2)+'\n','utf8');
 console.log(JSON.stringify(results));
})().catch(error=>{console.error(error.message);process.exitCode=1;});
