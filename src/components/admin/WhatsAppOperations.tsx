'use client';
import { useEffect, useState } from 'react';
interface Booking { id: string; user_name: string; user_phone: string; session_type: string; slot_date: string; slot_start_time: string; status: string; payment_status: string; fulfillment_status: string; meeting_link?: string; google_calendar_event_id?: string; booking_version: number; therapist_id: string; therapist_name: string }
interface Operations { bookings: Booking[]; payments: { txnid: string; status: string; amount: number }[]; jobs: { id: string; type: string; last_error: string }[]; messages: { id: string; booking_id: string; status: string; error_code?: string }[]; refunds: { id: string; txnid: string; amount: number; status: string; reason: string }[] }
export default function WhatsAppOperations() {
  const [data, setData] = useState<Operations>();
  const [error, setError] = useState('');
  const [managing, setManaging] = useState<Booking>();
  const [slots, setSlots] = useState<{ id: string; date: string; start_time: string }[]>([]);
  const [selectedSlot, setSelectedSlot] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const manage = async (booking: Booking) => {
    setManaging(booking); setSelectedSlot(''); setConfirmCancel(false);
    const response = await fetch(`/api/admin/whatsapp?therapist=${encodeURIComponent(booking.therapist_id)}`);
    if (!response.ok) { setError('Unable to load availability'); setSlots([]); } else setSlots((await response.json()).slots);
  };
  const submitManagement = async (action: 'cancel' | 'reschedule') => {
    const response = await fetch('/api/admin/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, id: managing?.id, slotId: selectedSlot }) });
    if (!response.ok) { setError('Could not update this booking. Refresh to check its current status.'); return; }
    setManaging(undefined); await refresh();
  };
  const refresh = async () => {
    try { const r = await fetch('/api/admin/whatsapp', { cache: 'no-store' }); if (!r.ok) throw new Error(); setData(await r.json()); setError(''); }
    catch { setError('Unable to load WhatsApp operations. Please try again.'); }
  };
  useEffect(() => { void refresh(); }, []);
  const retry = async (id: string) => {
    const r = await fetch('/api/admin/whatsapp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retry', id }) });
    if (!r.ok) setError(await r.text()); else await refresh();
  };
  if (!data) return <p role="status">{error || 'Loading WhatsApp bookings…'}</p>;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const cards = [ ['Today', data.bookings.filter(b => b.slot_date === today).length], ['Confirmed', data.bookings.filter(b => b.fulfillment_status === 'CONFIRMED').length], ['Pending payment', data.payments.filter(p => ['CREATED','PENDING'].includes(p.status)).length], ['Failed payment', data.payments.filter(p => p.status === 'FAILED').length], ['Paid, awaiting Meet', data.bookings.filter(b => b.fulfillment_status === 'PAID_PENDING_SESSION_CREATION').length], ['Cancelled', data.bookings.filter(b => b.status === 'cancelled').length], ['Rescheduled', data.bookings.filter(b => b.booking_version > 1 && b.status !== 'cancelled').length], ['Reminder / delivery failures', data.jobs.filter(j => j.type === 'NOTIFY').length + data.messages.filter(m => m.status === 'failed' || m.status === 'uncertain').length], ['Needs attention', data.jobs.length + data.refunds.filter(r => r.status === 'PENDING').length] ];
  return <div className="space-y-6">
    <button onClick={refresh} className="rounded-xl bg-violet-700 px-4 py-2 text-white">Refresh</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <p className="text-sm text-slate-500">Latest 100 records per category. Times shown in IST. Source: WhatsApp.</p>
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{cards.map(([label, count]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{count}</p></div>)}</div>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead><tr>{['Patient','Session','Date / time','Booking','Payment','Calendar / Meet','Delivery','Manage'].map(s => <th key={s} className="p-4">{s}</th>)}</tr></thead><tbody>{data.bookings.map(b => <tr key={b.id} className="border-t border-slate-100"><td className="p-4">{b.user_name}<br/>{b.user_phone}</td><td className="p-4">{b.session_type}<br/>{b.therapist_name}</td><td className="p-4">{b.slot_date}<br/>{b.slot_start_time}</td><td className="p-4">{b.fulfillment_status}</td><td className="p-4">{b.payment_status}</td><td className="p-4">{b.google_calendar_event_id ? 'Event created' : 'Pending'}<br/>{b.meeting_link ? 'Meet ready' : 'Meet pending'}</td><td className="p-4">{data.messages.find(m => m.booking_id === b.id)?.status || 'Pending'}</td><td className="p-4">{b.fulfillment_status === 'CONFIRMED' && <button className="text-violet-700 underline" onClick={() => manage(b)}>Manage</button>}</td></tr>)}</tbody></table></div>
    {managing && <section className="rounded-2xl border border-violet-200 bg-white p-5"><h2 className="text-xl font-bold">Manage {managing.user_name}’s session</h2><p>{managing.slot_date} at {managing.slot_start_time} IST · {managing.therapist_name}</p><label className="my-3 block">New appointment time<select className="ml-3 rounded-lg border p-2" value={selectedSlot} onChange={e => setSelectedSlot(e.target.value)}><option value="">Choose a time</option>{slots.map(s => <option key={s.id} value={s.id}>{s.date} {s.start_time} IST</option>)}</select></label><button disabled={!selectedSlot} className="mr-3 rounded-lg bg-violet-700 px-3 py-2 text-white disabled:opacity-40" onClick={() => submitManagement('reschedule')}>Confirm reschedule</button>{confirmCancel ? <button className="rounded-lg bg-red-700 px-3 py-2 text-white" onClick={() => submitManagement('cancel')}>Confirm cancellation under published refund policy</button> : <button className="text-red-700 underline" onClick={() => setConfirmCancel(true)}>Cancel session</button>}<button className="ml-4 underline" onClick={() => setManaging(undefined)}>Close</button></section>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Failed jobs</h2>{!data.jobs.length && <p>No failed jobs.</p>}{data.jobs.map(j => <div key={j.id} className="flex flex-wrap items-center justify-between gap-3 border-b py-3"><p>{j.type} · {j.last_error}<br/><span className="text-xs text-slate-500">{j.id}</span></p>{j.last_error === 'DELIVERY_UNCERTAIN' ? <span>Check Meta delivery before resending</span> : <button onClick={() => retry(j.id)} className="rounded-lg bg-violet-100 px-3 py-2 text-violet-800">Retry</button>}</div>)}</section>
    <section className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-bold">Refund requests</h2><p className="text-sm text-slate-500">Process eligible refunds in the PayU merchant dashboard and record the outcome in the refund request.</p>{data.refunds.map(r => <p key={r.id} className="border-b py-3">{r.txnid} · ₹{r.amount} · {r.status} · {r.reason}</p>)}</section>
  </div>;
}
