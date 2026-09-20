const test=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
process.env.WHATSAPP_BOOKING_ENABLED='true';
const therapist={therapist_id:'therapist-a',display_name:'Therapist A',focus:'Relationships'};
const slot={id:'slot-a',date:'2030-09-08',start_time:'19:00:00',end_time:'19:45:00',duration_minutes:45};
function harness(state='START',data={}){
 const session={id:'session-a',wa_id:'919999999999',state,data,expires_at:new Date(Date.now()+7200000).toISOString(),last_message_at:new Date().toISOString()};
 const effects=[];let reply;let seq=0;
 function db(){return {from(table){let query; const respond=()=>{
  if(table==='whatsapp_sessions')return {data:session};
  if(table==='whatsapp_messages')return {data:{status:'received'}};
  if(table==='pricing_config')return {data:[{session_type:'personal',price:2500,currency:'INR'}]};
  if(table==='booking_holds')return {data:null};
  return {data:null};
 };query=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve(respond()).then(resolve,reject);return ()=>query;}});return query;}};}
 const api=load('src/lib/whatsapp/conversation.ts',{
  '../bookings/availability':{availableSlots:async()=>[slot],therapists:async()=>[therapist]},
  '../payments/whatsapp':{preparePayment:async()=>{effects.push('payment');return 'https://example.test/pay/token';}},
  './server':{db,check:()=>{},origin:()=> 'https://example.test',rpc:async(name,args)=>{
   effects.push(name);
   if(name==='wa_hold')return {id:'hold-a',slot_id:'slot-a',status:'ACTIVE',expires_at:new Date(Date.now()+600000).toISOString()};
   if(name==='wa_commit_conversation'){session.state=args.p_state;session.data=args.p_data;reply=args.p_reply;}
  }},
 });
 return {session,effects,get reply(){return reply;},async input(input,interactive=false){await api.converse({id:`job-${++seq}`,payload:{id:`message-${seq}`,session:'session-a',from:session.wa_id,input,interactive,timestamp:String(Math.floor(Date.now()/1000))}});}};
}
test('complete deterministic service → therapist → date → slot → details → review → payment flow',async()=>{
 const h=harness();
 for(const [input,state] of [['book','SELECT_SERVICE'],['personal','SELECT_THERAPIST'],['therapist-a','SELECT_DATE'],['2030-09-08','SELECT_TIME'],['slot-a','COLLECT_NAME'],['Patient','COLLECT_EMAIL'],['patient@example.test','REVIEW_BOOKING'],['pay','AWAITING_PAYMENT']]){
  await h.input(input);assert.equal(h.session.state,state,input);
 }
 assert.equal(h.effects.filter(x=>x==='wa_hold').length,1);assert.equal(h.effects.filter(x=>x==='payment').length,1);assert.match(h.reply.text.body,/https:\/\/example.test\/pay/);
});
test('arbitrary therapist identifiers and stale interactive replies do not advance state',async()=>{
 const h=harness();await h.input('book');await h.input('personal');await h.input('attacker-id',true);assert.equal(h.session.state,'SELECT_THERAPIST');assert.ok(!h.effects.includes('wa_hold'));
});
test('invalid email is rejected without creating payment or holding a slot',async()=>{
 const h=harness('COLLECT_EMAIL',{service:'personal',therapist:'therapist-a',slot:'slot-a'});await h.input('not-an-email');assert.equal(h.session.state,'COLLECT_EMAIL');assert.ok(!h.effects.includes('payment'));
});
test('hello resumes an incomplete conversation and expiry returns to service selection',async()=>{
 const h=harness('COLLECT_NAME');await h.input('hello');assert.equal(h.session.state,'COLLECT_NAME');assert.match(h.reply.text.body,/name/);
 h.session.expires_at='2000-01-01';await h.input('Patient');assert.equal(h.session.state,'SELECT_SERVICE');
});
