const test=require('node:test');const assert=require('node:assert/strict');const load=require('./load-ts.cjs');
function query(data){let q; q=new Proxy({}, {get(_,key){if(key==='then')return (resolve,reject)=>Promise.resolve({data,error:null}).then(resolve,reject);return ()=>q;}});return q;}
const therapist={therapist_id:'therapist',oauth_user_id:'user',calendar_id:'primary',timezone:'Asia/Kolkata'};
const booking={id:'00000000-0000-0000-0000-000000000001',booking_version:1,slot_date:'2030-09-08',slot_start_time:'19:00:00',slot_end_time:'19:45:00',fulfillment_status:'PAID_PENDING_SESSION_CREATION'};
const server={check:()=>{},required:()=> 'configured',db:()=>({from:()=>query({access_token:'token',token_expiry:'2099-01-01'})})};
test('Calendar conflict recovers the same event after a lost insert response',async()=>{
 const calls=[];const old=global.fetch;
 global.fetch=async(url,options)=>{calls.push({url,options});return calls.length===1?new Response('{}',{status:404}):calls.length===2?Response.json({calendars:{primary:{busy:[]}}}):calls.length===3?new Response('{}',{status:409}):Response.json({id:'mn00000000000000000000000000000001',hangoutLink:'https://meet.google.com/abc-defg-hij'});};
 try{const api=load('src/lib/google-calendar/whatsapp.ts',{'../whatsapp/server':server});const result=await api.syncCalendar(therapist,booking);assert.ok(result.meet);assert.equal(calls.length,4);const body=JSON.parse(calls[2].options.body);assert.equal(body.summary,'Mannosaar Session');assert.equal(body.id,body.conferenceData.createRequest.requestId);assert.equal(body.start.dateTime,'2030-09-08T13:30:00.000Z');assert.equal(body.attendees,undefined);}finally{global.fetch=old;}
});
test('Calendar success without a ready Meet link remains retryable',async()=>{
 const old=global.fetch;global.fetch=async()=>Response.json({id:'event',conferenceData:{createRequest:{status:{statusCode:'pending'}}}});
 try{const api=load('src/lib/google-calendar/whatsapp.ts',{'../whatsapp/server':server});await assert.rejects(api.syncCalendar(therapist,booking),/GOOGLE_MEET_PENDING/);}finally{global.fetch=old;}
});
test('FreeBusy calendar errors fail closed',async()=>{
 const old=global.fetch;global.fetch=async()=>Response.json({calendars:{primary:{errors:[{reason:'forbidden'}]}}});
 try{const api=load('src/lib/google-calendar/whatsapp.ts',{'../whatsapp/server':server});await assert.rejects(api.freeBusy(therapist,'2030-09-08T00:00:00Z','2030-09-09T00:00:00Z'),/GOOGLE_FREEBUSY_UNAVAILABLE/);}finally{global.fetch=old;}
});
test('cancellation retries treat already-deleted Calendar events as success',async()=>{
 const old=global.fetch;global.fetch=async()=>new Response('',{status:410});
 try{const api=load('src/lib/google-calendar/whatsapp.ts',{'../whatsapp/server':server});assert.equal((await api.syncCalendar(therapist,{...booking,fulfillment_status:'CANCEL_PENDING'})).meet,'');}finally{global.fetch=old;}
});
test('PayU authenticity validates hash, merchant and additional charges',async()=>{
 process.env.PAYU_KEY='merchant';process.env.PAYU_SALT='test-salt';
 const payu=load('src/lib/payu.ts');const api=load('src/lib/payments/whatsapp.ts',{'../whatsapp/server':server});
 const fields={key:'merchant',txnid:'test-txn',amount:'2500.00',productinfo:'Session',firstname:'Patient',email:'patient@example.test',status:'success',additionalCharges:'1.00'};
 fields.hash=payu.buildPayUResponseHash({...fields,salt:'test-salt'});
 assert.equal(await api.validatePayUWebhook(fields),true);assert.equal(await api.validatePayUWebhook({...fields,amount:'1.00'}),false);assert.equal(await api.validatePayUWebhook({...fields,key:'other'}),false);
});
test('availability subtracts Calendar busy, holds, block ranges and enforces four-hour lead time',async()=>{
 const date='2030-09-08';const rows=['10:00','11:00','12:00','13:00'].map((time,i)=>({id:`slot-${i}`,date,start_time:time+':00',end_time:time.slice(0,2)+':45:00',duration_minutes:45}));
 const api=load('src/lib/bookings/availability.ts',{
  '../google-calendar/whatsapp':{freeBusy:async()=>[{start:'2030-09-08T04:30:00Z',end:'2030-09-08T05:15:00Z'}]},
  '../whatsapp/server':{...server,db:()=>({from(table){return query(table==='whatsapp_therapists'?[{...therapist,active:true}]:table==='therapy_slots'?rows:table==='booking_reservations'?[{span:'["2030-09-08 05:30:00+00","2030-09-08 06:15:00+00")',hold:null}]:[{start_date:date,end_date:date,block_type:'time_range',start_time:'12:00:00',end_time:'12:45:00'}]);}})},
 });
 assert.deepEqual((await api.availableSlots('therapist',date)).map(s=>s.id),['slot-3']);
});
test('notification retry never resends an accepted Meta message',async()=>{
 let fetches=0;const old=global.fetch;global.fetch=async()=>{fetches++;throw new Error('should not send');};
 const api=load('src/lib/whatsapp/client.ts',{'./server':{...server,log:()=>{},db:()=>({from(table){return query(table==='whatsapp_sessions'?{id:'session',wa_id:'919999999999',last_message_at:new Date().toISOString()}:{status:'sent',wa_message_id:'wamid.accepted'});}})}});
 try{await api.send({id:'job',dedupe_key:'notice',payload:{session:'session',notice:'Hello'}});assert.equal(fetches,0);}finally{global.fetch=old;}
});
test('ambiguous Meta send is held for review, never blindly retried',async()=>{
 const api=load('src/lib/whatsapp/client.ts',{'./server':{...server,log:()=>{},db:()=>({from(table){return query(table==='whatsapp_sessions'?{id:'session',wa_id:'919999999999',last_message_at:new Date().toISOString()}:{status:'sending',wa_message_id:null});}})}});
 await assert.rejects(api.send({id:'job',dedupe_key:'notice',payload:{session:'session',notice:'Hello'}}),/DELIVERY_UNCERTAIN/);
});
test('free-form conversation replies outside customer-service window are rejected',async()=>{
 const api=load('src/lib/whatsapp/client.ts',{'./server':{...server,log:()=>{},db:()=>({from(table){return query(table==='whatsapp_sessions'?{id:'session',wa_id:'919999999999',last_message_at:'2000-01-01'}:{status:'queued'});}})}});
 await assert.rejects(api.send({id:'job',dedupe_key:'reply',payload:{session:'session',notice:'Hello'}}),/CUSTOMER_WINDOW_EXPIRED/);
});
test('paid booking is not silently placed over a new external Calendar event',async()=>{
 let count=0;const old=global.fetch;global.fetch=async()=>++count===1?new Response('{}',{status:404}):Response.json({calendars:{primary:{busy:[{start:'2030-09-08T13:30:00Z',end:'2030-09-08T14:15:00Z'}]}}});
 try{const api=load('src/lib/google-calendar/whatsapp.ts',{'../whatsapp/server':server});await assert.rejects(api.syncCalendar(therapist,booking),/GOOGLE_SLOT_BECAME_BUSY/);assert.equal(count,2);}finally{global.fetch=old;}
});
