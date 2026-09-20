const test=require('node:test');const assert=require('node:assert/strict');const crypto=require('node:crypto');const load=require('./load-ts.cjs');
const core=load('src/lib/whatsapp/core.ts');const messages=load('src/lib/whatsapp/messages.ts');
test('Meta signatures bind the exact raw body, reject altered bytes and missing config',()=>{
 const raw='{"object":"whatsapp_business_account"}';const signature='sha256='+crypto.createHmac('sha256','secret').update(raw).digest('hex');
 assert.ok(core.validMetaSignature(raw,signature,'secret'));assert.equal(core.validMetaSignature(raw+' ',signature,'secret'),false);assert.equal(core.validMetaSignature(raw,signature,''),false);assert.equal(core.equalSecret('a','ab'),false);
});
test('Meta parser validates account and phone and accepts list/button replies',()=>{
 const body={object:'whatsapp_business_account',entry:[{id:'business',changes:[{field:'messages',value:{metadata:{phone_number_id:'phone'},messages:[{id:'wamid.1',from:'919999999999',timestamp:'1788651000',interactive:{list_reply:{id:'personal'}}},{id:'wamid.2',from:'bad',timestamp:'1788651000',text:{body:'Hi'}}],statuses:[{id:'out.1',status:'delivered',timestamp:'1788651001'}]}}]}]};
 const parsed=core.parseMeta(JSON.stringify(body),'phone','business');assert.equal(parsed.messages.length,1);assert.equal(parsed.messages[0].input,'personal');assert.ok(parsed.messages[0].interactive);assert.equal(parsed.statuses.length,1);assert.equal(core.parseMeta(JSON.stringify(body),'other','business').messages.length,0);
});
test('IST timestamps are UTC and half-open boundaries do not conflict',()=>{
  assert.equal(core.slotInstant('2026-09-08','00:15:00'),'2026-09-07T18:45:00.000Z');
  assert.equal(core.slotEndInstant('2026-09-08','23:30:00','00:15:00'),'2026-09-08T18:45:00.000Z');
  assert.throws(()=>core.slotEndInstant('2026-09-08','10:00:00','10:00:00'),/INVALID_SLOT_DURATION/);
 const a={start:'2026-09-08T12:00:00Z',end:'2026-09-08T13:00:00Z'};
 assert.equal(core.overlaps(a,{start:a.end,end:'2026-09-08T14:00:00Z'}),false);
 assert.equal(core.overlaps(a,{start:'2026-09-08T12:59:59Z',end:'2026-09-08T14:00:00Z'}),true);
});
test('retry delays are exponential and bounded; refund boundaries follow published policy',()=>{
 assert.deepEqual([1,2,3,20].map(core.retryDelay),[15,30,60,3600]);
 const now=Date.parse('2026-09-08T00:00:00Z');
 for(const [hours,pct] of [[25,100],[24,50],[12,50],[11,0]]) assert.equal(core.refundPercent(new Date(now+hours*3600000).toISOString(),now),pct);
});
test('interactive controls enforce Meta limits and reject stale choice identifiers',()=>{
 assert.throws(()=>messages.listMessage('x',[]));assert.throws(()=>messages.listMessage('x',Array(11).fill({id:'x',title:'y'})));
 assert.equal(core.selectedChoice({data:{choices:[{id:'a'}]}},'b'),false);
 assert.equal(messages.listMessage('choose',[{id:'a',title:'x'.repeat(40)}]).interactive.action.sections[0].rows[0].title.length,24);
});
test('OAuth token encryption authenticates ciphertext and reads legacy plaintext',()=>{
 const tokens=load('src/lib/google-calendar/token-protection.ts');process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 const encrypted=tokens.protectToken('refresh-secret');assert.notEqual(encrypted,'refresh-secret');assert.equal(tokens.revealToken(encrypted),'refresh-secret');assert.equal(tokens.revealToken('legacy'),'legacy');
 const parts=encrypted.split('.');parts[3]=Buffer.from('tamper').toString('base64');assert.throws(()=>tokens.revealToken(parts.join('.')));delete process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
});
