# WhatsApp booking implementation

## Inspection
Next.js 16 App Router, React 19, strict TypeScript, NextAuth Google login, Supabase service-role API routes. Existing records are `users`, `therapy_slots`, `bookings`, `pricing_config` (single/bundle prices), `block_schedules`, and `google_oauth_credentials`. There is no therapist profile/working-hours table: administrators publish concrete slots, sometimes under the zero UUID. Those slots remain the working schedule. Times are Asia/Kolkata; use UTC ranges for reservations. Existing Calendar code falls back to arbitrary admin credentials and logs personal data; the new adapter must use explicit calendar ownership and deterministic event IDs. Existing WhatsApp helpers use Twilio; this channel uses Meta directly.

## Reuse
Existing users/bookings/slots, single-session `pricing_config`, PayU hash and verification helpers, OAuth credential storage and connection UI, NextAuth admin authorization, admin navigation and UI. Website and bundles remain supported by a common database reservation trigger.

## Changes and new schema
Add booking source and separate fulfillment status without changing legacy status values. Add explicit therapist calendar configuration, WhatsApp sessions/messages, booking holds, unified exclusion-constrained reservations, PayU orders/events, durable jobs, worker lease, and refund requests. Use transactions for inbound dedupe, conversation/outbox commit, hold conversion, and management operations. Backfill existing bookings including bundles; fail migration if historical overlaps exist. Restrict all operational tables and RPCs to service role. Do not link an unverified email to an existing website identity.

## Routes
GET/POST `/api/whatsapp/webhook`, GET `/api/whatsapp/pay/[token]`, POST `/api/whatsapp/payment-return`, POST `/api/webhooks/payu`, GET `/api/jobs/whatsapp`, GET/POST `/api/admin/whatsapp`. Extend `/admin/whatsapp` and website CTA.

## Configuration
Existing Supabase, PayU and Google variables. Add Meta app secret, verify token, access token, phone ID, WABA ID, Graph API version, official public phone, feature flag, cron secret, session TTL and reminder offsets/template configuration. Register exact therapist slot ID → OAuth owner/calendar mapping. Reconnect Google for FreeBusy scope.

## Security and failure risks
Signed raw-body webhooks, persisted replay keys, verified merchant/amount/transaction, bearer checkout token hashes, short holds and database exclusion constraints. External effects are at-least-once: deterministic Google IDs prevent duplicate events; Meta has no exactly-once send primitive, so ambiguous delivery is surfaced rather than automatically resent. Late payments become refund/attention cases, never displace another booking. Refund execution remains the existing merchant/admin process, with durable requests using the published percentages. New APIs never log message content or tokens. Private browser reads have been moved behind a NextAuth-scoped compatibility endpoint, allowing public users/bookings grants to be revoked. Validate the coordinated frontend/database rollout in staging.

## Rollout
Apply migration first to a disposable database and run concurrency/rollback tests. Configure providers and templates in sandbox, configure calendar mappings, run authenticated scheduler every minute, test end to end, then enable feature flag and CTA. Do not apply migrations or send real messages during implementation. Check historical overlaps before production migration; take backup. Monitor dead jobs, pending paid fulfillment, delivery uncertainty and refunds. Disable flag to stop new bookings while continuing settlement/jobs.

## Verification
See `docs/WHATSAPP_BOOKING.md` for runnable local tests, provider setup, deployment gates, known external consistency limits and the complete file/integration inventory. Local PostgreSQL tests use PGlite; independent staging connections remain required for a real concurrent-transaction deployment check.
