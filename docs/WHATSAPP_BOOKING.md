# Mannosaar WhatsApp booking

## What is implemented

Meta Cloud API → signed webhook → Supabase inbox/job queue → deterministic conversation → live slot checks → transactional hold → existing PayU hosted checkout → signed PayU webhook and `verify_payment` → shared booking table → Google Calendar/Meet → utility-template confirmation/reminders. Patients type `manage` to choose an appointment, reschedule, or confirm cancellation. `/admin/whatsapp` provides operational status, retries and appointment management.

Website bookings remain in the same model. A PostgreSQL exclusion constraint covers overlapping holds and bookings, including every website bundle slot. It does not depend on `is_available` being updated correctly by an older API. Published `therapy_slots` are the existing working schedule; no fabricated working hours or separate slot generator is introduced. Block schedules, four-hour lead time, session duration, holds, existing appointments and Google FreeBusy are combined. Internally reservations use UTC; existing date/time columns and patient messages use Asia/Kolkata.

**Deployment status:** implementation and local tests are provided; no production migration, Meta message, merchant configuration, or Google event was performed as part of development. Enable only after completing the staging acceptance tests below.

## Reused components and changes

- Reused `users`, `bookings`, `therapy_slots`, `block_schedules`, `pricing_config` single-session prices, `google_oauth_credentials`, PayU hashing/verification, NextAuth and existing admin navigation/styles.
- Added a durable Calendar adapter with explicit ownership instead of using the older fallback-to-any-admin behavior. Event IDs derive from booking UUIDs; a retry fetches the existing event. Conference provisioning is asynchronous and retried. A newly busy external calendar leaves payment safely pending for staff attention.
- Added `booking_source`, `fulfillment_status`, `booking_version`, `google_calendar_id` and pinned `google_oauth_user_id`. Existing lowercase `status` and `payment_status` values remain compatible with website code. `pending` + `PAID_PENDING_SESSION_CREATION` + payment `completed` means money is received but no confirmation has been sent.
- Private browser reads now go through `/api/private-data/users` or `/api/private-data/bookings`, with a fixed projection and server-enforced NextAuth scope. Public grants on users/bookings/OAuth/payment context tables are revoked. Profile identity creation remains in NextAuth. Therapist booking reads are restricted to their configured slots; admin patient search tolerates phone-only WhatsApp identities. Existing email helper routes now check owner/admin authorization. A legacy booking lookup no longer treats a random booking ID as authorization.
- Google connection now validates a ten-minute state cookie and requests FreeBusy scope. Optional AES-256-GCM token encryption supports old plaintext credentials until accounts reconnect. The PayU salt no longer falls back to a public environment variable.
- Legacy reschedule/update endpoints direct WhatsApp appointments to the durable WhatsApp management flow.

## Files

New services: `src/lib/whatsapp/{core,server,client,messages,conversation,admin}.ts`, `src/lib/bookings/{availability,access}.ts`, `src/lib/payments/whatsapp.ts`, `src/lib/google-calendar/{whatsapp,token-protection}.ts`, `src/lib/jobs/whatsapp.ts`.

New routes: `/api/whatsapp/webhook`, `/api/whatsapp/pay/[token]`, `/api/whatsapp/payment-return`, `/api/webhooks/payu`, `/api/jobs/whatsapp`, `/api/admin/whatsapp`, `/api/private-data/[table]`. New admin page/component: `src/app/admin/whatsapp/page.tsx`, `src/components/admin/WhatsAppOperations.tsx`.

Migration: `scripts/migrations/20260905_whatsapp_booking.sql`. Tests: `tests/whatsapp/`. Plan: `WHATSAPP_BOOKING_IMPLEMENTATION.md`. Configuration: `.env.example` (explicitly unignored in Git).

Modified integrations: PayU/Calendar helpers, OAuth routes, legacy booking lookup/create/manage/email routes, browser Supabase client, profile page, root layout, WhatsApp button, admin navigation and package test scripts/development dependencies. The Twilio dependency and older website notification helpers are left intact for website compatibility; the new channel never calls them.

## Database setup

1. Back up the database and export its actual schema. This repository contains incremental SQL files, not a generated live Supabase schema. Compare the export with the prerequisites before applying changes.
2. Ensure existing booking-details, payment-status, bundle-session, PayU-context and pricing migrations have been applied. The new migration deliberately fails if required legacy columns are absent.
3. Apply `20260905_whatsapp_booking.sql` in a disposable/staging database first, using the Supabase SQL editor or `psql "$STAGING_DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/migrations/20260905_whatsapp_booking.sql`.
4. Existing active bookings, including bundle slot IDs, are backfilled into the exclusion constraint. Historical overlaps abort the entire transaction. Reconcile those bookings with staff; do not delete records or disable the constraint to force the migration through. Malformed bundle slot IDs must also be reconciled.
5. Confirm RLS and service-role-only grants for every new table and `wa_*` function. NextAuth does not supply Supabase `auth.uid()`, so the frontend uses the authenticated bridge for private records.
6. Seed explicit therapist mappings using real IDs. A zero UUID is allowed only when it is the actual existing `therapy_slots.therapist_id`. Never assume that it identifies a connected account.

```sql
insert into public.whatsapp_therapists
  (therapist_id, oauth_user_id, display_name, focus, calendar_id, services, active)
values
  ('REPLACE_WITH_SLOT_THERAPIST_UUID', 'REPLACE_WITH_CONNECTED_USER_UUID',
   'Therapist display name', 'Concise focus', 'primary', array['personal','couple'], true);
```

Only one therapist mapping per OAuth-owner/calendar pair is allowed. Publish actual slots using the existing admin slot UI. Prices come from `pricing_config` where `bundle_size=1` and `currency='INR'`. No fallback/demo price is used by WhatsApp.

New operational tables: `whatsapp_therapists`, `whatsapp_sessions`, `whatsapp_messages`, `whatsapp_delivery_events`, `booking_holds`, `booking_reservations`, `whatsapp_payments`, `payment_events`, `background_jobs`, `whatsapp_worker_lease`, `whatsapp_refund_requests`.

## Environment

Copy the names/placeholders from `.env.example`; keep real values in deployment secrets.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Existing server database connection |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public content client |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `NEXT_PUBLIC_APP_URL` | Existing auth and canonical HTTPS origin |
| `WHATSAPP_BOOKING_ENABLED` | `false` initially; `true` after staging |
| `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID` | Exact Meta account/phone allowlist |
| `WHATSAPP_ACCESS_TOKEN` | Server-only system-user token |
| `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET` | Webhook challenge and raw-body HMAC validation |
| `WHATSAPP_GRAPH_VERSION` | Supported version shown in your Meta app dashboard; no implicit version fallback |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | Official digits-only international phone; empty hides CTA |
| `WHATSAPP_CHECKOUT_SECRET` | Independent random secret of at least 32 characters; keep stable |
| `PAYU_KEY`, `PAYU_SALT`, `PAYU_PAYMENT_URL` | Existing merchant configuration; test endpoint for sandbox |
| `PAYU_VERIFY_PAYMENT_URL` | Optional merchant-specific verification endpoint override |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Existing OAuth client |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Optional base64 32-byte AES key; strongly recommended in production |
| `CRON_SECRET` | Independent random scheduler bearer secret |
| `WHATSAPP_SESSION_TTL_MINUTES` | Incomplete conversation expiry; default 120 |
| `WHATSAPP_REMINDER_MINUTES` | Comma-separated minute offsets; default `1440,60` |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Exact approved template language code, default `en` |
| `WHATSAPP_TEMPLATE_*` | Template names centralized in `.env.example` |

Generate secrets with `openssl rand -hex 32` and the Google encryption key with `openssl rand -base64 32`. Changing the checkout secret invalidates existing payment capabilities. Changing/removing the Google encryption key makes already-encrypted tokens unreadable; reconnect or perform an explicit key migration.

## Meta dashboard setup

1. Create/use your Meta business app with the WhatsApp product. Complete business/phone verification, register the official number and configure billing as required by Meta.
2. Create a system-user access token with the WhatsApp messaging and management permissions required for your assigned WABA/phone. Store it only on the server.
3. Set callback URL to `https://YOUR_DOMAIN/api/whatsapp/webhook`. Enter the exact `WHATSAPP_VERIFY_TOKEN`. Subscribe the app/WABA to `messages` (both inbound messages and delivery statuses arrive there).
4. Store the phone-number ID, WABA ID, app secret, access token and supported Graph version. Requests for other account/phone IDs are ignored even if the app signature is valid.
5. In test mode, add permitted recipient test numbers. Send a real inbound `book` message; a successful challenge alone does not test inbound delivery or permissions.
6. Submit the utility templates below and set exact approved names/language. Configure the public official number only after routing works.

See [Meta webhook signature reference](https://whatsapp.github.io/WhatsApp-Nodejs-SDK/api-reference/webhooks/start/) and [Meta’s list-message example](https://www.postman.com/meta/whatsapp-business-platform/request/0v36tbh/send-reply-to-list-message). Lists are paginated to at most ten rows. Join links are in the message body; patients reply `manage` for reschedule/cancel controls.

## PayU setup

1. Use the existing merchant account. Test with `PAYU_PAYMENT_URL=https://test.payu.in/_payment` and matching test key/salt. Production uses the merchant’s live credentials and endpoint.
2. Register server payment success/failure webhooks at `https://YOUR_DOMAIN/api/webhooks/payu`. Confirm the payload includes the standard reverse hash and merchant key. Both form-encoded and flat JSON payloads are supported. Nested/custom payloads must be confirmed with your merchant integration team before activation.
3. The hosted checkout’s browser success/failure URL is `/api/whatsapp/payment-return`; it displays instructions only. Webhook delivery is mandatory. The original website callback route remains available for existing checkout.
4. The webhook validates hash, key and stored amount, durably queues verification, and calls PayU `verify_payment`. Only the server-verified transaction can convert a hold. Raw callback content and client context are not trusted or retained.
5. Checkout is a high-entropy bearer link, stored as a hash and accepted only during the hold. It displays a PayU form with a payment button; this also prevents link-preview bots from initiating checkout by merely opening the link.
6. Fully native WhatsApp payments are merchant-specific and are not assumed enabled. The implemented delivery mechanism is a WhatsApp link to PayU hosted checkout. `preparePayment` is the boundary for replacing delivery with an approved native integration later.

See [PayU reverse hashing](https://docs.payu.in/docs/hashing-request-and-response), [webhook payloads](https://docs.payu.in/docs/webhook-events-and-sample-payloads), and [server transaction verification](https://docs.payu.in/reference/verify_payment_api).

## Google setup

1. Enable Google Calendar API in the existing Google project. Configure the OAuth consent screen and the authorized redirect `https://YOUR_DOMAIN/api/auth/google-callback`.
2. Connect/reconnect calendar owners through the existing admin Google connection UI. New grants include `calendar.events`, `calendar.freebusy`, and email. An old events-only grant is insufficient for availability.
3. Use a Google account/calendar that supports Google Meet conference creation. Verify `primary` or the configured calendar ID grants the connected account the required permissions. No arbitrary-admin fallback is used by this channel.
4. Configure `whatsapp_therapists` and run a sandbox booking. The event title is `Mannosaar Session`, visibility is private, and no patient email or therapy details are added as attendees/title/description.
5. For encryption, set `GOOGLE_TOKEN_ENCRYPTION_KEY` before reconnecting each account. Legacy plaintext credentials remain readable; reconnecting encrypts the stored tokens.

See [Google event insertion and conference data](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert) and [FreeBusy](https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query).

## Template approval

The following **body parameter order is part of the implementation contract**. Do not add header or URL-button parameters without updating `messages.ts`. Template approval/category/language decisions are made by Meta.

| Template | Body parameters, in order | Suggested body |
| --- | --- | --- |
| `booking_confirmation` | therapist, date/time with IST, duration, Meet URL | Your Mannosaar session is confirmed. Therapist: {{1}}. When: {{2}}. Duration: {{3}}. Payment successful. Join: {{4}}. Reply manage to view, reschedule or cancel. |
| `booking_reminder_24h` | therapist, date/time, duration, Meet URL | Reminder: your Mannosaar session with {{1}} is on {{2}}. Duration: {{3}}. Join: {{4}}. Reply manage for booking options. |
| `booking_reminder_1h` | same four | Your Mannosaar session with {{1}} is coming up on {{2}}. Duration: {{3}}. Join: {{4}}. Reply manage for booking options. |
| `booking_rescheduled` | same four | Your Mannosaar session has been rescheduled. Therapist: {{1}}. When: {{2}}. Duration: {{3}}. Join: {{4}}. Reply manage for booking options. |
| `booking_cancelled` | therapist, date/time | Your Mannosaar session with {{1}} on {{2}} is cancelled. Any eligible refund has been submitted for processing. Reply manage to view your bookings. |
| `payment_reminder` | payment update text | Mannosaar payment update: {{1}}. Reply manage or contact support for help. |

Scheduled confirmations and reminders always use templates. In-window conversation replies use text/lists. Free-form sends require a conservative 23-hour window; if a queued conversation reply becomes too old, it is flagged rather than sent illegally. Custom reminder offsets reuse the 24h template for offsets >=1440 and the 1h template otherwise; the suggested wording intentionally contains the exact appointment time rather than promising a fixed countdown.

## Automated scheduler (no paid queue)

Use the existing Supabase project’s Cron + `pg_net` + Vault. Enable those extensions in the Supabase dashboard. In Vault create secrets named `mannosaar_app_url` (canonical HTTPS origin) and `mannosaar_cron_secret` (the same value as `CRON_SECRET`). Then schedule:

```sql
select cron.schedule(
 'mannosaar-whatsapp-jobs', '* * * * *',
 $job$
 select net.http_get(
   url := (select decrypted_secret from vault.decrypted_secrets where name='mannosaar_app_url') || '/api/jobs/whatsapp',
   headers := jsonb_build_object('Authorization', 'Bearer ' ||
     (select decrypted_secret from vault.decrypted_secrets where name='mannosaar_cron_secret')),
   timeout_milliseconds := 60000
 );
 $job$
);
```

Verify HTTP responses in `net._http_response` and scheduler activity in `cron.job_run_details`. If your current hosting already supports minute-level authenticated cron, it may call the same endpoint instead. Do not use a daily-only scheduler: holds/reminders/retries require minute cadence. The worker runs after webhook acknowledgements for responsiveness; cron is the durable recovery mechanism.

The endpoint requires `Authorization: Bearer CRON_SECRET` and has a 60-second function duration. One database worker lease prevents competing workers; processing is bounded to roughly 35 seconds plus the current job. A killed process is recovered after the five-minute lease. Provision hosting capacity for that function duration and monitor processing latency. One serial worker is appropriate for the current small booking service; sustained queue growth requires bounded partitioning by session/booking, not simply removing the lock.

## Tests and local development

```sh
npm ci
npm run test:whatsapp
npx tsc --noEmit --incremental false
npm run build -- --webpack
npm run dev
```

Tests use a local PGlite PostgreSQL engine with `btree_gist` and the actual migration, plus isolated service mocks. No production credentials or outbound provider calls are used. Database tests cover competing overlapping holds, website/bundle conflicts, atomic rollback, hold expiry, patient identity, payment success/failure/amount mismatch/duplicates, pending Meet recovery, reschedule and cancel invariants, reminder idempotency, inbox replay, worker leases, ordered retries and RLS. Service tests cover conversation progression, invalid/stale choices, expiry, signatures, PayU hashes, UTC/IST, refund boundaries, availability and provider failures.

PGlite executes through a single engine connection; simultaneous JavaScript calls test competing requests and exclusion enforcement, **not independent PostgreSQL transaction scheduling**. Before rollout, run the same overlapping `wa_hold` calls through two separate staging database connections and verify one waits/fails with `23P01`; repeat website insert versus hold and bundle insert versus hold. This is a mandatory staging gate.

For providers, expose local Next.js through an HTTPS tunnel you control, set the canonical origin accordingly, and configure the temporary callback URLs. Register Google redirect URIs exactly. Never point sandbox checkout at a production merchant account. Trigger the scheduler using a local HTTP client with the bearer header; do not print the secret or paste it into logs.

### Staging acceptance procedure

1. Send `book` from two approved WhatsApp test recipients. Exercise personal/couple, pagination, invalid input, `hello` resume, expiry and `manage`.
2. Both select the same or overlapping slot. Complete review simultaneously. Exactly one hold must exist. Website and bundle checkout must also be unable to insert a conflicting booking.
3. Open the payment link on mobile. Verify displayed price, failed payment retry, expiry and duplicate opens. Attempt a forged browser success return: no booking should appear.
4. Finish a sandbox payment. Verify signed webhook receipt, `payment_events`, one booking, one deterministic Calendar event and one Meet link. Replay both Meta and PayU payloads.
5. Delay webhook beyond hold expiry: payment becomes `REFUND_PENDING`, a full refund request appears, and the slot is never taken from its replacement owner.
6. Revoke Google access or simulate 5xx. Payment remains completed, booking remains pending, retry is visible. Reconnect and retry in admin; no duplicate event may be created.
7. Disable Meta sending, verify failure visibility, restore and retry. Simulate an ambiguous timeout and confirm automatic resend is blocked. Check sent/delivered/read ordering.
8. Reschedule: both old and new times must be reserved while Calendar is unavailable. Restore Calendar; verify new slot, same event ID, increased version and replacement reminders. Old reminder versions must do nothing.
9. Cancel and replay the request. Verify one refund request with published percentage, Calendar deletion and inventory release. Cancellation during Calendar failure must keep inventory reserved until cleanup succeeds.
10. Invoke two cron requests simultaneously. Check one worker claims jobs; reminders are not duplicated by repeated runs. Advance test appointments to each configured reminder boundary.
11. As a regular user and anonymously, test private-data and admin routes, direct Supabase table access, unauthorized booking IDs, and operational RPCs. Verify private data is unavailable. Check website login/profile/single/bundle booking and admin slots/calendar after the compatibility migration.

## Failure recovery and refunds

`/admin/whatsapp` shows the latest 100 records per category, paid-but-unfulfilled bookings, failed jobs/delivery and refund requests. Refresh to reload. Retry Calendar and definitive API-send failures after fixing configuration. Manage confirmed appointments there or through the patient’s WhatsApp conversation.

- **Late payment:** `REFUND_PENDING`; full refund request, no booking. Do not force conversion of an expired hold.
- **Calendar outage/Meet pending:** keep payment and inventory. Retry the Calendar job after fixing OAuth/permissions. Deterministic event ID resolves lost responses. If an external Google event now conflicts, staff must resolve the conflict or arrange a refund; do not force it through.
- **Reschedule failure:** both reservations remain; fix Calendar and retry. Do not expire `RESCHEDULE` holds. If you abandon a failed reschedule, first reconcile the real Google event, then transactionally restore the old appointment and release the new reservation.
- **Definitive Meta delivery failure:** known transient delivery codes requeue structured booking notifications, with attempt limits. Other failed statuses remain visible. `DELIVERY_UNCERTAIN` means acceptance was ambiguous: inspect Meta and establish whether it was delivered before changing the message/job state. Blind retries are intentionally disabled.
- **Dead inbound job:** inspect the internal error code, correct configuration, and retry. Raw message text is not in logs. Have the patient send `book`/`manage` if a seven-day-old inbound payload has been purged.
- **Refunds:** the repository has no merchant refund executor. Eligible cancellation and late-payment refunds create durable `whatsapp_refund_requests`; authorized staff execute them in PayU using the stored transaction/provider IDs. Record merchant reference and final status as part of your existing finance workflow. Do not mark a refund complete merely because a booking was cancelled. Published patient cancellation policy is >24h:100%, 12–24h:50%, <12h:0%. Therapist-caused cancellation/refund exceptions require staff review under the published policy.

Housekeeping expires holds, clears expired conversation data when no active/reschedule hold needs it, removes checkout payloads after seven days, discards abandoned inbound content after seven days, and retains operational message rows for 90 days. Completed inbox jobs keep only dedupe metadata. Structured notification metadata is retained for delivery retry. Financial/booking records remain available for the existing retention workflow.

## Deployment checklist and limits

- Apply migration during a coordinated release/maintenance window: old browser builds cannot directly read private tables after grant revocation. Deploy this code and force a client reload. The authenticated bridge returns at most 1000 rows; admin operations display latest 100. Neither is a financial reporting export.
- Back up, resolve legacy booking overlaps, run independent-connection race tests and full website regression. Review any historical raw-token exposures before enabling encryption.
- Configure Meta credentials/approved templates, merchant webhook, Google reconnect/mappings, canonical HTTPS origin and scheduler. Verify all staging acceptance cases, then set the feature flag and official public CTA number.
- Keep the flag off to stop new WhatsApp checkout; continue webhook and job processing for already-paid bookings. Removing the scheduler during an incident strands fulfillment and reminders.
- Monitor dead jobs, pending paid fulfillment, refund requests, message failure rates and worker backlog. Alerting transport is your existing operations/monitoring setup; this feature does not send staff messages to Slack/email.
- WhatsApp supports single sessions, personal/couple, and the current IST published-slot model. Website bundles stay intact. No native WhatsApp PayU rail, automatic merchant refunds, multi-timezone therapist schedules, or unverified-email account linking is claimed.
- Calendar and PostgreSQL cannot share a transaction. Database booking/hold overlap is prevented; external Google edits can still race after FreeBusy checks. The worker detects conflicts before creating new paid events, and unresolved cases require staff reconciliation.
- Meta has no exactly-once send primitive. Durable dedupe prevents normal retries/duplicate cron from resending; uncertain network outcomes require review. Do not interpret an API “sent” response as delivered.
- Broader legacy application security is not certified by this feature. Existing website booking/payment and therapist permissions should receive a separate audit; the new channel uses explicit ownership, private grants, signed callbacks, stable payment amounts, idempotent transactions, bounded input and no clinical message collection.

## Verification performed during implementation

- 34 automated tests passed (`npm run test:whatsapp`).
- Strict TypeScript check passed; targeted ESLint for the new services/routes/UI and compatibility client passed without warnings.
- Production webpack build passed (`npm run build -- --webpack`). Default Turbopack encountered a sandbox restriction on binding a local port; webpack was used for verification. Duplicate generated `.next/types` copies were removed before the final check.
- Nine HTTP smoke checks against the production build passed: unsigned Meta and PayU requests, unauthenticated job/admin/private-data requests, invalid checkout capabilities, informational payment return, and homepage rendering. The temporary local server was stopped afterward.
- No live Meta/PayU/Google integration test or production database migration was performed. Independent PostgreSQL-connection concurrency tests and authenticated website/admin regression remain staging gates.
- Dependency installation reported 25 vulnerability findings (including 2 critical) in the dependency tree. This change does not remediate or certify the repository’s entire dependency tree; review the npm audit details before production rollout. No broad dependency upgrade was performed.
