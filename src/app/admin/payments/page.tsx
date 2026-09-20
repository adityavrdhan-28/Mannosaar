import { therapistSlotIds } from '@/lib/bookings/access';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft, CreditCard, IndianRupee, MessageCircle, SearchCheck } from 'lucide-react';
import { format } from 'date-fns';
import AdminSectionNav from '@/components/admin/AdminSectionNav';

interface BookingPayment {
  id: string;
  user_name?: string;
  user_email?: string;
  session_type?: string;
  slot_date?: string;
  payment_status?: string;
  payment_id?: string;
  number_of_sessions?: number;
}

async function assertAdminAccess() {
  const session = await auth();

  if (!session) {
    redirect('/auth/login');
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data: user, error } = await supabase
    .from('users')
    .select('role')
    .eq('email', session.user?.email)
    .single();

  if (error || (user?.role !== 'admin' && user?.role !== 'therapist')) {
    redirect('/');
  }

  return { supabase, role: user?.role, userId: session.user!.id! };
}

export default async function AdminPaymentsPage() {
  const { supabase, role, userId } = await assertAdminAccess();

  let query = supabase
    .from('bookings')
    .select('id, user_name, user_email, session_type, slot_date, payment_status, payment_id, number_of_sessions')
    .order('created_at', { ascending: false });
  if (role === 'therapist') query = query.in('slot_id', await therapistSlotIds(userId));
  const { data: bookings } = await query;

  const paymentRows = ((bookings as BookingPayment[] | null) || []).slice(0, 50);
  const pendingCount = paymentRows.filter((booking) => (booking.payment_status || 'pending') === 'pending').length;
  const completedCount = paymentRows.filter((booking) => booking.payment_status === 'completed').length;

  return (
    <div className="min-h-screen bg-[#f8f7ff] px-4 py-6 text-slate-950 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <AdminSectionNav className="mb-5" />

        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-violet-700">
          <ChevronLeft size={18} />
          Back to dashboard
        </Link>

        <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-600">Manual Payments</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">QR payment confirmations</h1>
          <p className="mt-2 text-slate-500">Track bookings that patients confirm through WhatsApp after scanning the QR code.</p>
        </div>

        <section className="mb-6 grid gap-4 md:grid-cols-3">
          {[
            { label: 'Total tracked', value: paymentRows.length, icon: CreditCard, className: 'bg-violet-100 text-violet-700' },
            { label: 'Pending review', value: pendingCount, icon: SearchCheck, className: 'bg-amber-100 text-amber-700' },
            { label: 'Completed', value: completedCount, icon: IndianRupee, className: 'bg-emerald-100 text-emerald-700' },
          ].map(({ label, value, icon: Icon, className }) => (
            <div key={label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
              <div className="flex items-center gap-4">
                <span className={`flex h-14 w-14 items-center justify-center rounded-full ${className}`}>
                  <Icon size={24} />
                </span>
                <div>
                  <p className="text-sm font-bold text-slate-500">{label}</p>
                  <p className="text-3xl font-black">{value}</p>
                </div>
              </div>
            </div>
          ))}
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <div className="border-b border-slate-100 p-5">
            <h2 className="text-xl font-black">Recent payment records</h2>
            <p className="mt-1 text-sm font-medium text-slate-500">Use WhatsApp screenshots/messages to verify pending QR payments.</p>
          </div>

          <div className="space-y-4 p-4 md:hidden">
            {paymentRows.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 px-5 py-8 text-center font-semibold text-slate-500">
                No payment records yet.
              </div>
            ) : (
              paymentRows.map((booking) => (
                <div key={booking.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-900">{booking.user_name || 'Client'}</p>
                      <p className="text-xs font-medium text-slate-500">{booking.user_email || 'No email'}</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black capitalize text-amber-700">
                      {booking.payment_status || 'pending'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2 rounded-2xl bg-slate-50 p-3 text-sm text-slate-700">
                    <p>{booking.session_type || 'personal'} · {booking.number_of_sessions || 1} session</p>
                    <p>{booking.slot_date ? format(new Date(booking.slot_date), 'MMM dd, yyyy') : 'N/A'}</p>
                    <p className="font-mono text-xs text-slate-500">{booking.payment_id || 'manual-review'}</p>
                  </div>

                  <Link
                    href="/admin/bookings"
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700"
                  >
                    <MessageCircle size={14} />
                    Review
                  </Link>
                </div>
              ))
            )}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-4 font-black">Client</th>
                  <th className="px-5 py-4 font-black">Session</th>
                  <th className="px-5 py-4 font-black">Date</th>
                  <th className="px-5 py-4 font-black">Payment Ref</th>
                  <th className="px-5 py-4 font-black">Status</th>
                  <th className="px-5 py-4 font-black">Action</th>
                </tr>
              </thead>
              <tbody>
                {paymentRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-12 text-center font-semibold text-slate-500">
                      No payment records yet.
                    </td>
                  </tr>
                ) : (
                  paymentRows.map((booking) => (
                    <tr key={booking.id} className="border-t border-slate-100">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-900">{booking.user_name || 'Client'}</p>
                        <p className="text-xs font-medium text-slate-500">{booking.user_email || 'No email'}</p>
                      </td>
                      <td className="px-5 py-4 capitalize text-slate-700">
                        {booking.session_type || 'personal'} · {booking.number_of_sessions || 1} session
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {booking.slot_date ? format(new Date(booking.slot_date), 'MMM dd, yyyy') : 'N/A'}
                      </td>
                      <td className="px-5 py-4 font-mono text-xs text-slate-500">{booking.payment_id || 'manual-review'}</td>
                      <td className="px-5 py-4">
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-black capitalize text-amber-700">
                          {booking.payment_status || 'pending'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Link
                          href="/admin/bookings"
                          className="inline-flex items-center gap-2 rounded-full bg-violet-50 px-3 py-2 text-xs font-black text-violet-700"
                        >
                          <MessageCircle size={14} />
                          Review
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
