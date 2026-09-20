-- Apply after existing booking details/payment/bundle/pricing migrations. Entire rollout is atomic.
begin;
set local search_path=public,extensions,pg_temp;
create extension if not exists btree_gist;
alter table public.bookings add column if not exists booking_source text not null default 'WEB' check (booking_source in ('WEB','WHATSAPP','ADMIN'));
alter table public.bookings add column if not exists fulfillment_status text not null default 'LEGACY' check (fulfillment_status in ('LEGACY','PAID_PENDING_SESSION_CREATION','CONFIRMED','RESCHEDULE_PENDING','CANCEL_PENDING','CANCELLED'));
alter table public.bookings add column if not exists google_calendar_id text;
alter table public.bookings add column if not exists google_oauth_user_id uuid references public.users(id);
alter table public.bookings add column if not exists booking_version integer not null default 1;
alter table public.users add column if not exists wa_id text unique;
-- Email is not an authentication assertion when supplied via WhatsApp.
alter table public.users alter column email drop not null;
create table public.whatsapp_therapists (
 therapist_id uuid primary key, oauth_user_id uuid not null references public.users(id),
 display_name text not null, focus text not null default '', calendar_id text not null default 'primary',
 services text[] not null default array['personal','couple'], active boolean not null default false,
 timezone text not null default 'Asia/Kolkata' check (timezone='Asia/Kolkata'), unique(oauth_user_id,calendar_id)
);
create table public.whatsapp_sessions (
 id uuid primary key default gen_random_uuid(), wa_id text not null unique check(wa_id ~ '^[0-9]{7,15}$'),
 user_id uuid references public.users(id), state text not null default 'START', data jsonb not null default '{}',
 last_message_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '2 hours',
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.booking_holds (
 id uuid primary key default gen_random_uuid(), session_id uuid not null references public.whatsapp_sessions(id),
 slot_id uuid not null references public.therapy_slots(id), therapist_id uuid not null,
 slot_start timestamptz not null, slot_end timestamptz not null, expires_at timestamptz not null,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','CONVERTED','EXPIRED','RELEASED','RESCHEDULE')),
 idempotency_key text not null unique, booking_id uuid references public.bookings(id), created_at timestamptz not null default now(), check(slot_end>slot_start)
);
create table public.booking_reservations (
 id uuid primary key default gen_random_uuid(), therapist_id uuid not null, slot_id uuid not null references public.therapy_slots(id),
 span tstzrange not null, hold_id uuid references public.booking_holds(id), booking_id uuid references public.bookings(id) on delete cascade,
 check((hold_id is null) <> (booking_id is null)),
 exclude using gist (therapist_id with =, span with &&)
);
create index on public.booking_reservations(booking_id);
create index on public.booking_reservations(hold_id);
create index on public.booking_holds(expires_at) where status='ACTIVE';
create index on public.booking_holds(session_id);
create index on public.bookings(booking_source,slot_date);
create table public.whatsapp_messages (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique, wa_message_id text unique,
 session_id uuid references public.whatsapp_sessions(id), booking_id uuid references public.bookings(id),
 direction text not null check(direction in ('IN','OUT')), message_type text not null default 'text',
 status text not null default 'queued', error_code text, template_name text,
 created_at timestamptz not null default now(), delivered_at timestamptz, read_at timestamptz
);
create index on public.whatsapp_messages(booking_id,created_at);
create table public.whatsapp_delivery_events (
 wa_message_id text not null, status text not null, error_code text, created_at timestamptz not null default now(),
 primary key(wa_message_id,status)
);
create table public.whatsapp_payments (
 txnid text primary key, hold_id uuid not null unique references public.booking_holds(id), session_id uuid not null references public.whatsapp_sessions(id),
 user_id uuid not null references public.users(id), amount numeric(10,2) not null check(amount>0), currency text not null default 'INR' check(currency='INR'),
 service text not null check(service in ('personal','couple')), token_hash text not null unique,
 checkout jsonb not null, status text not null default 'CREATED' check(status in ('CREATED','PENDING','SUCCESS','FAILED','REFUND_PENDING','REFUNDED')),
 provider_id text, booking_id uuid references public.bookings(id), created_at timestamptz not null default now()
);
create table public.payment_events (
 id uuid primary key default gen_random_uuid(), dedupe_key text not null unique,
 txnid text not null references public.whatsapp_payments(txnid), status text not null, created_at timestamptz not null default now()
);
create table public.whatsapp_refund_requests (
 id uuid primary key default gen_random_uuid(), txnid text not null unique references public.whatsapp_payments(txnid),
 booking_id uuid references public.bookings(id), amount numeric(10,2) not null,
 reason text not null, status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','REFUNDED','REJECTED')),
 created_at timestamptz not null default now()
);
create table public.background_jobs (
 id uuid primary key default gen_random_uuid(), sequence bigint generated always as identity unique, dedupe_key text not null unique, type text not null, payload jsonb not null,
 status text not null default 'PENDING' check(status in ('PENDING','RUNNING','DONE','DEAD')),
 attempts integer not null default 0, max_attempts integer not null default 8,
 next_attempt_at timestamptz not null default now(), last_error text, locked_until timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.background_jobs(status,next_attempt_at);
create table public.whatsapp_worker_lease (id integer primary key check(id=1), owner uuid, expires_at timestamptz);
insert into public.whatsapp_worker_lease(id) values(1);

-- A slot whose end clock-time is earlier than its start clock-time crosses
-- midnight. Store its reservation as a single UTC range that ends the next
-- calendar day. Equal times are invalid for a therapy slot and are rejected
-- explicitly instead of silently creating a 24-hour reservation.
create function public.wa_slot_span(p_date date,p_start time,p_end time) returns tstzrange
language plpgsql immutable strict set search_path=pg_catalog as $$
begin
 if p_start=p_end then
  raise exception 'INVALID_THERAPY_SLOT_DURATION: start_time and end_time are identical';
 end if;
 return tstzrange(
  (p_date+p_start) at time zone 'Asia/Kolkata',
  (p_date+p_end+case when p_end<p_start then interval '1 day' else interval '0' end) at time zone 'Asia/Kolkata',
  '[)'
 );
end $$;

create function public.wa_enqueue(p_key text,p_type text,p_payload jsonb,p_at timestamptz default now()) returns void
language sql security definer set search_path=public,pg_temp as $$
 insert into background_jobs(dedupe_key,type,payload,next_attempt_at) values(p_key,p_type,p_payload,p_at) on conflict(dedupe_key) do nothing;
$$;
create function public.wa_expire_holds() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update booking_holds set status='EXPIRED' where status='ACTIVE' and expires_at<=now();
 delete from booking_reservations r using booking_holds h where r.hold_id=h.id and h.status in ('EXPIRED','RELEASED');
end $$;
-- This trigger is the common booking boundary for website, admin, WhatsApp and bundles.
create function public.wa_reserve_booking() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare s therapy_slots; sid uuid; slot_ids uuid[];
begin
 if TG_OP='UPDATE' and new.slot_id is not distinct from old.slot_id and new.session_dates is not distinct from old.session_dates and new.status=old.status then return new; end if;
 perform wa_expire_holds();
 delete from booking_reservations where booking_id=new.id;
 if new.status not in ('pending','confirmed') then return new; end if;
 slot_ids:=array[new.slot_id];
 if jsonb_typeof(new.session_dates)='array' then
  select array_agg(distinct x) into slot_ids from (
   select new.slot_id x union select coalesce(e->>'slot_id',e->>'slotId')::uuid from jsonb_array_elements(new.session_dates) e
  ) q where x is not null;
 end if;
 foreach sid in array slot_ids loop
  select * into strict s from therapy_slots where id=sid;
  if s.is_blocked then raise exception 'SLOT_BLOCKED'; end if;
  insert into booking_reservations(therapist_id,slot_id,span,booking_id)
  values(s.therapist_id,s.id,wa_slot_span(s.date,s.start_time,s.end_time),new.id);
 end loop;
 return new;
end $$;
create trigger wa_reserve_booking after insert or update of slot_id,session_dates,status on public.bookings for each row execute function public.wa_reserve_booking();
-- Backfill through the same invariant; abort safely if any existing overlaps exist.
do $$ declare b bookings; s therapy_slots; sid uuid; ids uuid[]; begin
 for b in select * from bookings where status in ('pending','confirmed') loop
  ids:=array[b.slot_id];
  if jsonb_typeof(b.session_dates)='array' then
   select array_agg(distinct x) into ids from (select b.slot_id x union select coalesce(e->>'slot_id',e->>'slotId')::uuid from jsonb_array_elements(b.session_dates) e) q where x is not null;
  end if;
  foreach sid in array ids loop
   select * into strict s from therapy_slots where id=sid;
   insert into booking_reservations(therapist_id,slot_id,span,booking_id) values(s.therapist_id,s.id,wa_slot_span(s.date,s.start_time,s.end_time),b.id);
  end loop;
 end loop;
end $$;
create function public.wa_hold(p_session uuid,p_slot uuid,p_key text) returns booking_holds language plpgsql security definer set search_path=public,pg_temp as $$
declare h booking_holds; s therapy_slots;
begin
 perform 1 from whatsapp_sessions where id=p_session for update;
 select * into h from booking_holds where idempotency_key=p_key;
 if found then return h; end if;
 perform wa_expire_holds();
 if exists(select 1 from booking_holds where session_id=p_session and status in ('ACTIVE','RESCHEDULE')) then raise exception 'ACTIVE_HOLD_EXISTS'; end if;
 select * into strict s from therapy_slots where id=p_slot for update;
 if not s.is_available or s.is_blocked or (s.date+s.start_time) at time zone 'Asia/Kolkata' < now()+interval '4 hours' then raise exception 'SLOT_UNAVAILABLE'; end if;
 if not exists(select 1 from whatsapp_therapists where therapist_id=s.therapist_id and active) then raise exception 'THERAPIST_UNAVAILABLE'; end if;
 if exists(select 1 from block_schedules where s.date between start_date and end_date and (block_type='full_day' or (s.start_time<end_time and start_time<s.end_time))) then raise exception 'SLOT_BLOCKED'; end if;
 insert into booking_holds(session_id,slot_id,therapist_id,slot_start,slot_end,expires_at,idempotency_key)
 values(p_session,s.id,s.therapist_id,lower(wa_slot_span(s.date,s.start_time,s.end_time)),upper(wa_slot_span(s.date,s.start_time,s.end_time)),now()+interval '10 minutes',p_key) returning * into h;
 insert into booking_reservations(therapist_id,slot_id,span,hold_id) values(s.therapist_id,s.id,tstzrange(h.slot_start,h.slot_end,'[)'),h.id);
 return h;
end $$;
create function public.wa_patient(p_session uuid,p_name text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare s whatsapp_sessions; uid uuid;
begin
 select * into strict s from whatsapp_sessions where id=p_session for update;
 if s.user_id is not null then return s.user_id; end if;
 -- Only a verified WhatsApp identity can be matched; profile phone/email are not verified identity proofs.
 insert into users(wa_id,name,phone_number,role) values(s.wa_id,p_name,s.wa_id,'user') on conflict(wa_id) do update set wa_id=excluded.wa_id returning id into uid;
 update whatsapp_sessions set user_id=uid where id=s.id;
 return uid;
end $$;
create function public.wa_ingest(p_messages jsonb,p_statuses jsonb) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare m jsonb; sid uuid; mid uuid; msg_key text;
begin
 for m in select * from jsonb_array_elements(p_messages) loop
  insert into whatsapp_sessions(wa_id,last_message_at) values(m->>'from',to_timestamp((m->>'timestamp')::double precision)) on conflict(wa_id) do nothing;
  select id into sid from whatsapp_sessions where wa_id=m->>'from';
  if (select count(*) from whatsapp_messages where session_id=sid and direction='IN' and created_at>now()-interval '1 minute')>=30 then continue; end if;
  insert into whatsapp_messages(dedupe_key,wa_message_id,session_id,direction,status)
  values('in:'||(m->>'id'),m->>'id',sid,'IN','received') on conflict do nothing returning id into mid;
  if mid is not null then
   perform wa_enqueue('in:'||(m->>'id'),'INBOUND',m||jsonb_build_object('session',sid));
  end if;
 end loop;
 for m in select * from jsonb_array_elements(p_statuses) loop
  insert into whatsapp_delivery_events(wa_message_id,status,error_code) values(m->>'id',m->>'status',m->>'error_code') on conflict do nothing;
  update whatsapp_messages set
   status=case when status='read' then status when status='delivered' and m->>'status' in ('sent','failed') then status else m->>'status' end,
   delivered_at=case when m->>'status'='delivered' then now() else delivered_at end,
   read_at=case when m->>'status'='read' then now() else read_at end,error_code=m->>'error_code'
  where wa_message_id=m->>'id' returning dedupe_key into msg_key;
  if m->>'status'='failed' and exists(select 1 from whatsapp_messages where dedupe_key=msg_key and status='failed') and m->>'error_code' in ('131000','131016','130429','131056') then
   update background_jobs set status='PENDING',next_attempt_at=now()+interval '1 minute'
   where dedupe_key=msg_key and type='NOTIFY' and status='DONE' and attempts<max_attempts;
   if found then update whatsapp_messages set wa_message_id=null,status='queued' where dedupe_key=msg_key; end if;
  end if;
 end loop;
end $$;
create function public.wa_commit_conversation(p_session uuid,p_message text,p_state text,p_data jsonb,p_reply jsonb,p_timestamp timestamptz,p_ttl integer default 120) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if exists(select 1 from whatsapp_messages where wa_message_id=p_message and status='processed') then return; end if;
 update whatsapp_sessions set state=p_state,data=p_data,last_message_at=greatest(last_message_at,p_timestamp),expires_at=now()+make_interval(mins=>least(1440,greatest(10,p_ttl))),updated_at=now() where id=p_session;
 perform wa_enqueue('reply:'||p_message,'SEND',jsonb_build_object('session',p_session,'message',p_reply));
 update whatsapp_messages set status='processed' where wa_message_id=p_message;
end $$;
create function public.wa_payment_result(p_txnid text,p_status text,p_provider text,p_amount numeric,p_event text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare p whatsapp_payments; h booking_holds; s therapy_slots; u users; bid uuid;
begin
 select * into strict p from whatsapp_payments where txnid=p_txnid for update;
 if p.amount<>p_amount then raise exception 'AMOUNT_MISMATCH'; end if;
 insert into payment_events(dedupe_key,txnid,status) values(p_event,p_txnid,p_status) on conflict do nothing;
 if p.status in ('SUCCESS','REFUND_PENDING','REFUNDED') then return; end if;
 if p_status<>'success' then
  if p_status='failure' then update whatsapp_payments set status='FAILED' where txnid=p_txnid;
  else update whatsapp_payments set status='PENDING' where txnid=p_txnid; end if;
  return;
 end if;
 select * into strict h from booking_holds where id=p.hold_id for update;
 if h.status<>'ACTIVE' or h.expires_at<=now() then
  update whatsapp_payments set status='REFUND_PENDING',provider_id=p_provider where txnid=p_txnid;
  insert into whatsapp_refund_requests(txnid,amount,reason) values(p_txnid,p.amount,'PAYMENT_AFTER_HOLD_EXPIRY') on conflict do nothing;
  perform wa_enqueue('late:'||p_txnid,'SEND',jsonb_build_object('session',p.session_id,'notice','Payment received after the reservation expired. No session was booked. Our team will arrange your refund.','template','payment_reminder'));
  return;
 end if;
 select * into strict s from therapy_slots where id=h.slot_id;
 select * into strict u from users where id=p.user_id;
 -- Remove the hold and replace it with a booking in the same transaction. The exclusion constraint remains authoritative.
 delete from booking_reservations where hold_id=h.id;
 insert into bookings(user_id,slot_id,session_type,status,payment_status,payment_id,user_name,user_phone,slot_date,slot_start_time,slot_end_time,booking_source,fulfillment_status)
 values(u.id,s.id,p.service,'pending','completed',p_provider,u.name,u.wa_id,s.date,s.start_time,s.end_time,'WHATSAPP','PAID_PENDING_SESSION_CREATION') returning id into bid;
 update bookings set google_calendar_id=t.calendar_id,google_oauth_user_id=t.oauth_user_id from whatsapp_therapists t where bookings.id=bid and t.therapist_id=s.therapist_id;
 update therapy_slots set is_available=false where id=s.id;
 update booking_holds set status='CONVERTED',booking_id=bid where id=h.id;
 update whatsapp_payments set status='SUCCESS',provider_id=p_provider,booking_id=bid where txnid=p_txnid;
 perform wa_enqueue('calendar:'||bid||':1','CALENDAR',jsonb_build_object('booking',bid));
end $$;
create function public.wa_manage(p_session uuid,p_booking uuid,p_action text,p_hold uuid default null) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; h booking_holds; p whatsapp_payments; hours numeric;
begin
 select * into strict b from bookings where id=p_booking for update;
 if not exists(select 1 from whatsapp_payments where booking_id=b.id and session_id=p_session) then raise exception 'FORBIDDEN'; end if;
 if p_action='cancel' and b.fulfillment_status in ('CANCEL_PENDING','CANCELLED') then return; end if;
 if p_action='reschedule' and exists(select 1 from booking_holds where id=p_hold and booking_id=b.id and status='RESCHEDULE') then return; end if;
 if b.fulfillment_status<>'CONFIRMED' then raise exception 'BOOKING_BUSY'; end if;
 hours:=extract(epoch from (((b.slot_date+b.slot_start_time) at time zone 'Asia/Kolkata')-now()))/3600;
 if hours<=0 then raise exception 'SESSION_STARTED'; end if;
 if p_action='reschedule' then
  select * into strict h from booking_holds where id=p_hold and session_id=p_session for update;
  if h.status<>'ACTIVE' or h.expires_at<=now() then raise exception 'HOLD_EXPIRED'; end if;
  if h.therapist_id<>(select therapist_id from therapy_slots where id=b.slot_id) then raise exception 'THERAPIST_MISMATCH'; end if;
  update booking_holds set status='RESCHEDULE',booking_id=b.id where id=h.id;
  update bookings set fulfillment_status='RESCHEDULE_PENDING',booking_version=booking_version+1 where id=b.id;
 elsif p_action='cancel' then
  update bookings set fulfillment_status='CANCEL_PENDING',booking_version=booking_version+1,cancelled_at=now() where id=b.id;
  select * into strict p from whatsapp_payments where booking_id=b.id;
  if hours>=12 then
   insert into whatsapp_refund_requests(txnid,booking_id,amount,reason) values(p.txnid,b.id,round(p.amount*(case when hours>24 then 1 else 0.5 end),2),'PATIENT_CANCELLATION') on conflict do nothing;
  end if;
 else raise exception 'INVALID_ACTION'; end if;
 perform wa_enqueue('manage:'||b.id||':'||(b.booking_version+1),'CALENDAR',jsonb_build_object('booking',b.id));
end $$;
create function public.wa_finish_calendar(p_booking uuid,p_version integer,p_event text,p_calendar text,p_meet text,p_offsets integer[] default array[1440,60]) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare b bookings; h booking_holds; s therapy_slots; sid uuid; mins integer; notice text;
begin
 select * into strict b from bookings where id=p_booking for update;
 if b.booking_version<>p_version then return; end if;
 if b.fulfillment_status in ('CONFIRMED','CANCELLED') then return; end if;
 select session_id into strict sid from whatsapp_payments where booking_id=b.id;
 if b.fulfillment_status='CANCEL_PENDING' then
  update bookings set status='cancelled',fulfillment_status='CANCELLED' where id=b.id;
  update therapy_slots set is_available=true where id=b.slot_id;
  notice:='booking_cancelled';
 else
  if p_meet is null or p_meet not like 'https://meet.google.com/%' then raise exception 'MEET_NOT_READY'; end if;
  if b.fulfillment_status='RESCHEDULE_PENDING' then
   select * into strict h from booking_holds where booking_id=b.id and status='RESCHEDULE' for update;
   select * into strict s from therapy_slots where id=h.slot_id;
   delete from booking_reservations where hold_id=h.id;
   update bookings set slot_id=s.id,slot_date=s.date,slot_start_time=s.start_time,slot_end_time=s.end_time where id=b.id;
   update therapy_slots set is_available=true where id=b.slot_id;
   update therapy_slots set is_available=false where id=s.id;
   update booking_holds set status='CONVERTED' where id=h.id;
   notice:='booking_rescheduled';
  else notice:='booking_confirmation'; end if;
  update bookings set status='confirmed',fulfillment_status='CONFIRMED',google_calendar_event_id=p_event,google_calendar_id=p_calendar,meeting_link=p_meet where id=b.id returning * into b;
  foreach mins in array p_offsets loop
   if ((b.slot_date+b.slot_start_time) at time zone 'Asia/Kolkata')-make_interval(mins=>mins)>now() then
    perform wa_enqueue('reminder:'||b.id||':'||b.booking_version||':'||mins,'NOTIFY',jsonb_build_object('booking',b.id,'version',b.booking_version,'template',case when mins>=1440 then 'booking_reminder_24h' else 'booking_reminder_1h' end),((b.slot_date+b.slot_start_time) at time zone 'Asia/Kolkata')-make_interval(mins=>mins));
   end if;
  end loop;
 end if;
 perform wa_enqueue('notice:'||b.id||':'||b.booking_version,'NOTIFY',jsonb_build_object('booking',b.id,'version',b.booking_version,'template',notice));
end $$;
create function public.wa_worker_acquire(p_owner uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
 update whatsapp_worker_lease set owner=p_owner,expires_at=now()+interval '5 minutes' where id=1 and (expires_at is null or expires_at<now());
 return found;
end $$;
create function public.wa_worker_release(p_owner uuid) returns void language sql security definer set search_path=public,pg_temp as $$
 update whatsapp_worker_lease set owner=null,expires_at=null where id=1 and owner=p_owner;
$$;
create function public.wa_claim_job(p_owner uuid) returns setof background_jobs language plpgsql security definer set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from whatsapp_worker_lease where id=1 and owner=p_owner and expires_at>now()+interval '1 minute') then return; end if;
 update background_jobs set status='PENDING' where status='RUNNING' and locked_until<now();
 return query update background_jobs set status='RUNNING',attempts=attempts+1,locked_until=now()+interval '5 minutes',updated_at=now()
 where id=(select j.id from background_jobs j where j.status='PENDING' and j.next_attempt_at<=now()
 and not (j.type='INBOUND' and exists(select 1 from background_jobs earlier where earlier.type='INBOUND' and earlier.status in ('PENDING','RUNNING') and earlier.payload->>'session'=j.payload->>'session' and earlier.sequence<j.sequence))
 order by j.sequence for update skip locked limit 1) returning *;
end $$;
create function public.wa_mark_sent(p_key text,p_id text) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare delivery text; code text;
begin
 select status,error_code into delivery,code from whatsapp_delivery_events where wa_message_id=p_id
 order by case status when 'read' then 4 when 'delivered' then 3 when 'failed' then 2 else 1 end desc limit 1;
 update whatsapp_messages set wa_message_id=p_id,status=coalesce(delivery,'sent'),error_code=code,
 delivered_at=case when delivery in ('delivered','read') then now() else delivered_at end,
 read_at=case when delivery='read' then now() else read_at end where dedupe_key=p_key;
end $$;
create function public.wa_maintenance() returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform wa_expire_holds();
 with retryable as (
  update background_jobs j set status='PENDING',next_attempt_at=now()+interval '1 minute'
  from whatsapp_messages m where j.dedupe_key=m.dedupe_key and j.type='NOTIFY' and j.status='DONE' and j.attempts<j.max_attempts and m.status='failed' and m.error_code in ('131000','131016','130429','131056') returning j.dedupe_key
 ) update whatsapp_messages set wa_message_id=null,status='queued' where dedupe_key in (select dedupe_key from retryable);
 update whatsapp_sessions s set data='{}',state='START' where expires_at<now() and data<>'{}'::jsonb
 and not exists(select 1 from booking_holds h where h.session_id=s.id and h.status in ('ACTIVE','RESCHEDULE'));
 update whatsapp_payments p set checkout='{}' where checkout<>'{}'::jsonb and created_at<now()-interval '7 days';
 update background_jobs set payload='{}',status='DEAD',last_error='INPUT_EXPIRED' where type='INBOUND' and status<>'DONE' and created_at<now()-interval '7 days';
 delete from whatsapp_messages where created_at<now()-interval '90 days';
 delete from whatsapp_delivery_events where created_at<now()-interval '90 days';
end $$;
-- New data is exclusively accessed by authenticated backend services (NextAuth is not Supabase Auth).
do $$ declare t text; f record; begin
 foreach t in array array['whatsapp_therapists','whatsapp_sessions','booking_holds','booking_reservations','whatsapp_messages','whatsapp_delivery_events','whatsapp_payments','payment_events','whatsapp_refund_requests','background_jobs','whatsapp_worker_lease'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
 for f in select oid::regprocedure sig from pg_proc where pronamespace='public'::regnamespace and proname like 'wa\_%' escape '\' loop
  execute format('revoke all on function %s from public,anon,authenticated',f.sig);
  execute format('grant execute on function %s to service_role',f.sig);
 end loop;
end $$;
-- Browser compatibility reads now go through a NextAuth-scoped server endpoint.
alter table public.bookings enable row level security;
revoke all on public.bookings from anon,authenticated;
alter table public.users enable row level security;
revoke all on public.users from anon,authenticated;
alter table public.google_oauth_credentials enable row level security;
revoke all on public.google_oauth_credentials from anon,authenticated;
alter table public.payu_payment_contexts enable row level security;
revoke all on public.payu_payment_contexts from anon,authenticated;
commit;
