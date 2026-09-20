import { therapistSlotIds } from '@/lib/bookings/access';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { CalendarDays, ChevronLeft, Clock3, Users } from 'lucide-react';
import { format } from 'date-fns';
import AdminSectionNav from '@/components/admin/AdminSectionNav';

interface Booking {
  id: string;
  user_name?: string;
  session_type?: string;
  slot_date?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  status?: string;
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

export default async function AdminCalendarPage() {
  const { supabase, role, userId } = await assertAdminAccess();

  let query = supabase
    .from('bookings')
    .select('id, user_name, session_type, slot_date, slot_start_time, slot_end_time, status')
    .not('slot_date', 'is', null)
    .order('slot_date', { ascending: true })
    .order('slot_start_time', { ascending: true });
  if (role === 'therapist') query = query.in('slot_id', await therapistSlotIds(userId));
  const { data: bookings } = await query;

  const upcomingBookings = ((bookings as Booking[] | null) || []).filter((booking) => {
    if (!booking.slot_date) return false;
    return booking.slot_date >= format(new Date(), 'yyyy-MM-dd');
  });

  const groupedBookings = upcomingBookings.reduce<Record<string, Booking[]>>((groups, booking) => {
    const key = booking.slot_date || 'Unscheduled';
    groups[key] = [...(groups[key] || []), booking];
    return groups;
  }, {});

  return (
    <div className="min-h-screen bg-[#f8f7ff] px-4 py-6 text-slate-950 sm:px-6 sm:py-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <AdminSectionNav className="mb-5" />

        <Link href="/admin" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-violet-700">
          <ChevronLeft size={18} />
          Back to dashboard
        </Link>

        <div className="mb-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
          <p className="text-sm font-black uppercase tracking-[0.2em] text-violet-600">Admin Calendar</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">Session calendar</h1>
          <p className="mt-2 text-slate-500">Upcoming sessions grouped by date for quick planning.</p>
        </div>

        <div className="grid gap-5">
          {Object.keys(groupedBookings).length === 0 ? (
            <div className="rounded-3xl border border-dashed border-violet-200 bg-white p-12 text-center shadow-sm">
              <CalendarDays size={42} className="mx-auto mb-4 text-violet-500" />
              <p className="text-xl font-black">No upcoming sessions</p>
              <p className="mt-2 text-sm font-medium text-slate-500">Create slots or view appointments to start scheduling.</p>
            </div>
          ) : (
            Object.entries(groupedBookings).map(([date, sessions]) => (
              <section key={date} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_rgba(15,23,42,0.06)]">
                <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-violet-600">{format(new Date(date), 'EEEE')}</p>
                    <h2 className="text-2xl font-black">{format(new Date(date), 'MMM dd, yyyy')}</h2>
                  </div>
                  <span className="rounded-full bg-violet-50 px-4 py-2 text-sm font-black text-violet-700">
                    {sessions.length} sessions
                  </span>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  {sessions.map((booking) => (
                    <Link
                      key={booking.id}
                      href="/admin/bookings"
                      className="rounded-2xl border border-slate-100 bg-slate-50 p-4 transition hover:border-violet-200 hover:bg-violet-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-900">{booking.user_name || 'Client'}</p>
                          <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-500">
                            <Clock3 size={15} />
                            {(booking.slot_start_time || '').slice(0, 5)} - {(booking.slot_end_time || '').slice(0, 5)}
                          </p>
                        </div>
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-black capitalize text-emerald-700">
                          {booking.status || 'confirmed'}
                        </span>
                      </div>
                      <p className="mt-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-violet-600">
                        <Users size={14} />
                        {booking.session_type || 'personal'}
                      </p>
                    </Link>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
