import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
const pg = new PGlite({ extensions: { btree_gist } });
const sql = async (query, params=[]) => (await pg.query(query,params)).rows;
let therapist, s1, s2, slots;
test.before(async () => {
 await pg.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create function auth.uid() returns uuid language sql as 'select null::uuid';`);
 await pg.exec(await readFile('database-schema.sql','utf8'));
 for (const file of ['add-payment-status.sql','add-booking-details.sql','add-bundle-sessions.sql','add-payu-payment-contexts.sql','20260905_whatsapp_booking.sql']) await pg.exec(await readFile(`scripts/migrations/${file}`,'utf8'));
 therapist=(await sql(`insert into users(email,name,role) values('therapist@example.test','Therapist','admin') returning id`))[0].id;
 await sql(`insert into whatsapp_therapists(therapist_id,oauth_user_id,display_name,active) values($1,$1,'Therapist',true)`,[therapist]);
 s1=(await sql(`insert into whatsapp_sessions(wa_id) values('919000000001') returning id`))[0].id;
 s2=(await sql(`insert into whatsapp_sessions(wa_id) values('919000000002') returning id`))[0].id;
 slots=await sql(`insert into therapy_slots(date,start_time,end_time,therapist_id) select current_date+10,t::time,(t::time+interval '45 minutes')::time,$1 from unnest(array['10:00','10:15','11:00','12:00','13:00','14:00','15:00','16:00']) t returning *`,[therapist]);
});
test.after(async()=>pg.close());
let hold, booking;
test('competing overlapping hold requests: exactly one succeeds',async()=>{
 const outcomes=await Promise.allSettled([sql(`select * from wa_hold($1,$2,'hold-a')`,[s1,slots[0].id]),sql(`select * from wa_hold($1,$2,'hold-b')`,[s2,slots[1].id])]);
 assert.equal(outcomes.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(outcomes.find(r=>r.status==='rejected').reason.code,'23P01');
 hold=outcomes.find(r=>r.status==='fulfilled').value[0];
 assert.equal((await sql(`select * from wa_hold($1,$2,'hold-a')`,[s1,slots[0].id]))[0].id,hold.id);
});
test('overnight slots reserve through the following day', async () => {
 const duration = (await sql(`select extract(epoch from upper(wa_slot_span('2030-09-08', '23:30'::time, '00:15'::time)) - lower(wa_slot_span('2030-09-08', '23:30'::time, '00:15'::time))) duration`))[0].duration;
 assert.equal(Number(duration), 45 * 60);
 await assert.rejects(
  sql(`select wa_slot_span('2030-09-08', '10:00'::time, '10:00'::time)`),
  /INVALID_THERAPY_SLOT_DURATION/
 );
});
test('website insert cannot bypass an active WhatsApp hold',async()=>{
 await assert.rejects(sql(`insert into bookings(user_id,slot_id,session_type) values($1,$2,'personal')`,[therapist,slots[1].id]),{code:'23P01'});
});
test('patient identity is stable and an unverified email cannot claim an account',async()=>{
 const a=(await sql(`select wa_patient($1,'Patient') id`,[s1]))[0].id;
 const b=(await sql(`select wa_patient($1,'Patient') id`,[s1]))[0].id;
 assert.equal(a,b); assert.notEqual(a,therapist);
 assert.equal((await sql(`select email from users where id=$1`,[a]))[0].email,null);
 await sql(`insert into whatsapp_payments(txnid,hold_id,session_id,user_id,amount,service,token_hash,checkout) values('txn-a',$1,$2,$3,2500,'personal','hash-a','{}')`,[hold.id,s1,a]);
});
test('payment failure stays unconfirmed, later verified success converts once',async()=>{
 await sql(`select wa_payment_result('txn-a','failure','provider-a',2500,'fail-a')`);
 assert.equal((await sql(`select count(*)::int n from bookings where booking_source='WHATSAPP'`))[0].n,0);
 await assert.rejects(sql(`select wa_payment_result('txn-a','success','provider-a',1,'bad-amount')`),/AMOUNT_MISMATCH/);
 await sql(`select wa_payment_result('txn-a','success','provider-a',2500,'success-a')`);
 await sql(`select wa_payment_result('txn-a','success','provider-a',2500,'success-a')`);
 const rows=await sql(`select * from bookings where booking_source='WHATSAPP'`);assert.equal(rows.length,1);booking=rows[0];
 assert.equal(booking.fulfillment_status,'PAID_PENDING_SESSION_CREATION');
 assert.equal((await sql(`select status from booking_holds where id=$1`,[hold.id]))[0].status,'CONVERTED');
 assert.equal((await sql(`select count(*)::int n from background_jobs where type='CALENDAR'`))[0].n,1);
});
test('Meet failure retains payment and reservation; successful retry schedules reminders once',async()=>{
 await assert.rejects(sql(`select wa_finish_calendar($1,1,'event','primary','',array[1440,60])`,[booking.id]),/MEET_NOT_READY/);
 assert.equal((await sql(`select payment_status from bookings where id=$1`,[booking.id]))[0].payment_status,'completed');
 await sql(`select wa_finish_calendar($1,1,'event','primary','https://meet.google.com/abc-defg-hij',array[1440,60])`,[booking.id]);
 await sql(`select wa_finish_calendar($1,1,'event','primary','https://meet.google.com/abc-defg-hij',array[1440,60])`,[booking.id]);
 assert.equal((await sql(`select count(*)::int n from background_jobs where dedupe_key like 'reminder:%'`))[0].n,2);
});
test('reschedule secures both slots until Calendar is safely updated',async()=>{
 const h=(await sql(`select * from wa_hold($1,$2,'move-a')`,[s1,slots[2].id]))[0];
 await assert.rejects(sql(`select wa_manage($1,$2,'reschedule',$3)`,[s2,booking.id,h.id]),/FORBIDDEN/);
 await sql(`select wa_manage($1,$2,'reschedule',$3)`,[s1,booking.id,h.id]);
 await sql(`select wa_manage($1,$2,'reschedule',$3)`,[s1,booking.id,h.id]);
 assert.equal((await sql(`select count(*)::int n from booking_reservations where booking_id=$1 or hold_id=$2`,[booking.id,h.id]))[0].n,2);
 await assert.rejects(sql(`select * from wa_hold($1,$2,'steal-old')`,[s2,slots[0].id]));
 await assert.rejects(sql(`select * from wa_hold($1,$2,'steal-new')`,[s2,slots[2].id]));
 await sql(`select wa_finish_calendar($1,2,'event','primary','https://meet.google.com/abc-defg-hij')`,[booking.id]);
 assert.equal((await sql(`select slot_id from bookings where id=$1`,[booking.id]))[0].slot_id,slots[2].id);
 assert.equal((await sql(`select count(*)::int n from booking_reservations where booking_id=$1`,[booking.id]))[0].n,1);
});
test('cancellation reserves until Calendar deletion and creates one refund request',async()=>{
 await sql(`select wa_manage($1,$2,'cancel')`,[s1,booking.id]);
 await sql(`select wa_manage($1,$2,'cancel')`,[s1,booking.id]);
 assert.equal((await sql(`select count(*)::int n from booking_reservations where booking_id=$1`,[booking.id]))[0].n,1);
 await sql(`select wa_finish_calendar($1,3,'event','primary','')`,[booking.id]);
 assert.equal((await sql(`select status from bookings where id=$1`,[booking.id]))[0].status,'cancelled');
 assert.equal((await sql(`select count(*)::int n from booking_reservations where booking_id=$1`,[booking.id]))[0].n,0);
 assert.equal((await sql(`select amount from whatsapp_refund_requests where booking_id=$1`,[booking.id]))[0].amount,'2500.00');
});
test('expired holds release inventory; late payment records full refund without booking',async()=>{
 const h=(await sql(`select * from wa_hold($1,$2,'expire-a')`,[s1,slots[3].id]))[0];
 const uid=(await sql(`select wa_patient($1,'Patient') id`,[s1]))[0].id;
 await sql(`insert into whatsapp_payments(txnid,hold_id,session_id,user_id,amount,service,token_hash,checkout) values('txn-late',$1,$2,$3,2500,'personal','hash-late','{}')`,[h.id,s1,uid]);
 await sql(`update booking_holds set expires_at=now()-interval '1 second' where id=$1`,[h.id]);
 await sql(`select wa_expire_holds()`);
 await sql(`select * from wa_hold($1,$2,'replacement')`,[s2,slots[3].id]);
 await sql(`select wa_payment_result('txn-late','success','late-provider',2500,'late-event')`);
 assert.equal((await sql(`select status from whatsapp_payments where txnid='txn-late'`))[0].status,'REFUND_PENDING');
 assert.equal((await sql(`select count(*)::int n from bookings where booking_source='WHATSAPP'`))[0].n,1);
});
test('Meta replay is deduped and session plus reply are committed atomically',async()=>{
 const messages=JSON.stringify([{id:'wamid.in',from:'919000000001',timestamp:String(Math.floor(Date.now()/1000)),input:'book',interactive:false}]);
 await sql(`select wa_ingest($1,'[]')`,[messages]);await sql(`select wa_ingest($1,'[]')`,[messages]);
 assert.equal((await sql(`select count(*)::int n from background_jobs where dedupe_key='in:wamid.in'`))[0].n,1);
 await sql(`select wa_commit_conversation($1,'wamid.in','SELECT_SERVICE','{}','{"type":"text","text":{"body":"hello"}}',now())`,[s1]);
 await sql(`select wa_commit_conversation($1,'wamid.in','START','{}','{}',now())`,[s1]);
 assert.equal((await sql(`select state from whatsapp_sessions where id=$1`,[s1]))[0].state,'SELECT_SERVICE');
 assert.equal((await sql(`select count(*)::int n from background_jobs where dedupe_key='reply:wamid.in'`))[0].n,1);
});
test('worker leases prevent concurrent cron workers',async()=>{
 const a='10000000-0000-0000-0000-000000000001',b='10000000-0000-0000-0000-000000000002';
 assert.equal((await sql(`select wa_worker_acquire($1) acquired`,[a]))[0].acquired,true);
 assert.equal((await sql(`select wa_worker_acquire($1) acquired`,[b]))[0].acquired,false);
 await sql(`select wa_worker_release($1)`,[b]);
 assert.equal((await sql(`select wa_worker_acquire($1) acquired`,[b]))[0].acquired,false);
 await sql(`select wa_worker_release($1)`,[a]);
});
test('browser roles cannot read private tables or call booking RPCs',async()=>{
 await pg.exec('set role anon');
 await assert.rejects(sql('select * from whatsapp_sessions'),{code:'42501'});
 await assert.rejects(sql('select * from bookings'),{code:'42501'});
 await assert.rejects(sql(`select * from wa_hold($1,$2,'attack')`,[s1,slots[4].id]),{code:'42501'});
 await pg.exec('reset role');
});
test('website bundles reserve every session and conflicting bundles roll back completely',async()=>{
 await assert.rejects(sql(`insert into bookings(user_id,slot_id,session_type,session_dates) values($1,$2,'personal',$3)`,[therapist,slots[4].id,JSON.stringify([{slot_id:slots[4].id},{slot_id:slots[3].id}])]),{code:'23P01'});
 assert.equal((await sql(`select count(*)::int n from booking_reservations where slot_id=$1`,[slots[4].id]))[0].n,0);
 const b=(await sql(`insert into bookings(user_id,slot_id,session_type,session_dates) values($1,$2,'personal',$3) returning id`,[therapist,slots[4].id,JSON.stringify([{slot_id:slots[4].id},{slot_id:slots[5].id}])]))[0];
 assert.equal((await sql(`select count(*)::int n from booking_reservations where booking_id=$1`,[b.id]))[0].n,2);
 await assert.rejects(sql(`select * from wa_hold($1,$2,'bundle-conflict')`,[s1,slots[5].id]),{code:'23P01'});
});
test('job claim keeps retrying inbound messages ordered per conversation',async()=>{
 await sql(`update background_jobs set status='DONE'`);
 await sql(`select wa_enqueue('ordered-1','INBOUND','{"session":"ordered"}')`);
 await sql(`select wa_enqueue('ordered-2','INBOUND','{"session":"ordered"}')`);
 await sql(`update background_jobs set next_attempt_at=now()+interval '1 hour' where dedupe_key='ordered-1'`);
 const owner='10000000-0000-0000-0000-000000000003';
 await sql(`select wa_worker_acquire($1)`,[owner]);
 assert.equal((await sql(`select * from wa_claim_job($1)`,[owner])).length,0);
 await sql(`update background_jobs set next_attempt_at=now() where dedupe_key='ordered-1'`);
 assert.equal((await sql(`select * from wa_claim_job($1)`,[owner]))[0].dedupe_key,'ordered-1');
 await sql(`select wa_worker_release($1)`,[owner]);
});
test('delivery callbacks arriving before send persistence are reconciled and never downgraded',async()=>{
 await sql(`insert into whatsapp_messages(dedupe_key,direction,status) values('early-delivery','OUT','sending')`);
 await sql(`select wa_ingest('[]','[{"id":"early.waid","status":"read"}]')`);
 await sql(`select wa_mark_sent('early-delivery','early.waid')`);
 assert.equal((await sql(`select status from whatsapp_messages where dedupe_key='early-delivery'`))[0].status,'read');
 await sql(`select wa_ingest('[]','[{"id":"early.waid","status":"sent"},{"id":"early.waid","status":"failed","error_code":"131000"}]')`);
 assert.equal((await sql(`select status from whatsapp_messages where dedupe_key='early-delivery'`))[0].status,'read');
});
