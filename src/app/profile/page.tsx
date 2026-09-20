'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useState, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { format } from 'date-fns';
import Link from 'next/link';
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Check,
  CheckCircle2,
  Clock3,
  CreditCard,
  Edit2,
  Filter,
  FileText,
  Link as LinkIcon,
  Mail,
  MoreHorizontal,
  Phone,
  Settings,
  ShieldCheck,
  StickyNote,
  User,
} from 'lucide-react';
import NoteModal from '@/components/shared/NoteModal';

interface Booking {
  id: string;
  session_type: string;
  status: string;
  notes?: string | null;
  sessions_taken_before?: number | null;
  meeting_link?: string;
  meeting_links?: string[];
  meeting_password?: string;
  user_id?: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  slot_date?: string;
  slot_start_time?: string;
  slot_end_time?: string;
  created_at?: string;
  number_of_sessions?: number;
  session_dates?: Array<{
    date: string;
    start_time: string;
    end_time: string;
    slotId?: string;
  }>;
  sessionNumber?: number;
  totalSessions?: number;
  user?: {
    name: string;
    email: string;
  };
  slot?: {
    date: string;
    start_time: string;
    end_time: string;
    duration_minutes?: number;
  };
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
  whatsapp_number?: string;
}

const ProfilePage = () => {
  const { data: session, status } = useSession();
  const router = useRouter();
  const supabase = createClient();
  const [upcomingBookings, setUpcomingBookings] = useState<Booking[]>([]);
  const [pastBookings, setPastBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', phone_number: '', whatsapp_number: '' });
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [sortOption, setSortOption] = useState<'recent' | 'oldest' | 'created'>('recent');
  const [noteModal, setNoteModal] = useState<{ title: string; note: string | null } | null>(null);

  // Redirect if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/auth/login');
    }
  }, [status, router]);

  // Auto-redirect admin and therapist to admin dashboard
  useEffect(() => {
    const checkAdminStatus = async () => {
      if (session?.user?.email) {
        try {
          const response = await fetch('/api/bookings/user-bookings');
          const data = await response.json();
          if (data.role === 'admin' || data.role === 'therapist') {
            console.log('📊 Admin/Therapist detected, redirecting to dashboard');
            router.push('/admin');
          }
        } catch (err) {
          console.error('Error checking role:', err);
        }
      }
    };

    checkAdminStatus();
  }, [session?.user?.email, router]);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch('/api/user/update-profile');
        if (response.ok) {
          const profile = await response.json();
          setUserProfile(profile);
          setEditForm({ name: profile.name, phone_number: profile.phone_number || '', whatsapp_number: profile.whatsapp_number || '' });
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };

    if (session?.user?.email) {
      fetchUserProfile();
    }
  }, [session]);

  // Handle profile update
  const handleUpdateProfile = async () => {
    if (!editForm.name.trim()) {
      setEditError('Name is required');
      return;
    }

    if (!editForm.phone_number.trim()) {
      setEditError('Phone number is required');
      return;
    }

    // Validate phone number (at least 10 digits)
    const phoneDigits = editForm.phone_number.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setEditError('Phone number must have at least 10 digits');
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone_number: editForm.phone_number.trim(),
          whatsapp_number: editForm.whatsapp_number.trim() || null,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update profile');
      }

      const updatedProfile = await response.json();
      setUserProfile(updatedProfile.user);
      setEditSuccess(true);
      setShowEditModal(false);

      // Show success message
      setTimeout(() => setEditSuccess(false), 3000);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to update profile';
      setEditError(errorMsg);
    } finally {
      setEditLoading(false);
    }
  };

  // Handle profile deletion
  const handleDeleteProfile = async () => {
    setDeleteLoading(true);
    try {
      const response = await fetch('/api/user/delete-profile', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        setShowDeleteModal(false);
        // Sign out and redirect after successful deletion
        await signOut({ callbackUrl: '/' });
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete profile');
      }
    } catch (err) {
      console.error('Error deleting profile:', err);
      alert('An error occurred. Please try again.');
    } finally {
      setDeleteLoading(false);
    }
  };

  useEffect(() => {
    const fetchBookings = async () => {
      if (!session?.user?.email) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        
        // NextAuth resolves or creates the database identity on the server.
        const userData = { id: session.user.id };
        if (!userData.id) throw new Error('Session identity is unavailable');

        const today = new Date();
        const dateString = today.toISOString().split('T')[0];

        console.log('🔍 Fetching bookings via API for userId:', userData.id);

        // Fetch bookings via API endpoint (uses service role, bypasses RLS)
        const bookingsRes = await fetch('/api/bookings/user-bookings');
        const bookingsData = await bookingsRes.json();

        const bookings = (bookingsData.bookings as Booking[]) || [];
        const role = bookingsData.role || 'user';
        const bookingsError = bookingsData.error;

        console.log('📊 Bookings from API:', {
          count: bookings.length,
          role: role,
          error: bookingsError,
          bookings: bookings.map((b) => ({ id: b.id, user_id: b.user_id, slot_date: b.slot_date, status: b.status }))
        });

        if (bookingsError && bookings.length === 0) {
          console.error('Error fetching bookings:', bookingsError);
          setUpcomingBookings([]);
          setPastBookings([]);
          setLoading(false);
          return;
        }

        if (!bookings || bookings.length === 0) {
          console.log('⚠️ No bookings found');
          setUpcomingBookings([]);
          setPastBookings([]);
          setLoading(false);
          return;
        }

        // Map all bookings and expand bundle sessions
        const processedBookings: Booking[] = [];
        
        bookings.forEach((b) => {
          const sessionDates = Array.isArray(b.session_dates) ? b.session_dates : [];
          const baseBooking = {
            id: b.id,
            session_type: b.session_type,
            status: b.status,
            notes: b.notes,
            sessions_taken_before: b.sessions_taken_before,
            meeting_link: b.meeting_link,
            meeting_password: b.meeting_password,
            user_id: b.user_id,
            user_name: b.user_name,
            user_email: b.user_email,
            user_phone: b.user_phone,
            created_at: b.created_at,
            number_of_sessions: b.number_of_sessions,
            session_dates: b.session_dates,
            meeting_links: b.meeting_links,
          };

          // If this is a bundle booking, expand each session into a separate row
          if (sessionDates.length > 0) {
            sessionDates.forEach((sessionDate, index) => {
              processedBookings.push({
                ...baseBooking,
                slot_date: sessionDate.date,
                slot_start_time: sessionDate.start_time,
                slot_end_time: sessionDate.end_time,
                meeting_link: b.meeting_links && b.meeting_links[index] ? b.meeting_links[index] : b.meeting_link,
                // Add session number info for display
                sessionNumber: index + 1,
                totalSessions: sessionDates.length,
              });
            });
          } else {
            // Single session booking
            processedBookings.push({
              ...baseBooking,
              slot_date: b.slot_date,
              slot_start_time: b.slot_start_time,
              slot_end_time: b.slot_end_time,
            });
          }
        });

        // For admin/therapist, show all bookings in one view
        if (role === 'admin' || role === 'therapist') {
          console.log('👨‍💼 Admin/Therapist view - showing all', processedBookings.length, 'client bookings');
          setUpcomingBookings(processedBookings);
          setPastBookings([]);
        } else {
          // For regular users, separate upcoming and past bookings
          const upcoming: Booking[] = [];
          const past: Booking[] = [];

          processedBookings.forEach((booking) => {
            if (booking.slot_date && booking.slot_date >= dateString) {
              upcoming.push(booking);
            } else {
              past.push(booking);
            }
          });

          console.log('👤 User view - upcoming:', upcoming.length, 'past:', past.length);
          setUpcomingBookings(upcoming);
          setPastBookings(past);
        }
      } catch (err) {
        console.error('Error fetching bookings:', err);
        setError('An error occurred while loading bookings');
      } finally {
        setLoading(false);
      }
    };

    if (session?.user?.email) {
      fetchBookings();

      // Set up real-time subscription for booking updates
      const channel = supabase
        .channel('profile-bookings-changes')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'bookings',
          },
          (payload) => {
            console.log('📡 Real-time booking update:', payload);
            fetchBookings();
          }
        )
        .subscribe();

      return () => {
        channel.unsubscribe();
      };
    }
  }, [session?.user?.email]);

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
  };

  const getNotePreview = (note?: string | null) => {
    const trimmedNote = note?.trim();
    if (!trimmedNote) {
      return 'No note added';
    }

    return trimmedNote.length > 90 ? `${trimmedNote.slice(0, 90)}...` : trimmedNote;
  };

  const renderNoteCell = (booking: Booking) => {
    const hasNote = Boolean(booking.notes?.trim());

    return (
      <div className="max-w-xs">
        <p className={`whitespace-pre-wrap break-words text-sm ${hasNote ? 'text-gray-800' : 'italic text-gray-400'}`}>
          {getNotePreview(booking.notes)}
        </p>
        {hasNote && (
          <button
            type="button"
            onClick={() =>
              setNoteModal({
                title: `Note for ${booking.user_name || 'booking'}`,
                note: booking.notes || null,
              })
            }
            className="mt-2 text-xs font-semibold text-purple-700 underline underline-offset-4 hover:text-purple-900"
          >
            View full note
          </button>
        )}
      </div>
    );
  };

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (status === 'unauthenticated') {
    return null;
  }

  // Sort upcoming bookings based on selected option
  const getSortedUpcomingBookings = () => {
    const sorted = [...upcomingBookings];
    
    switch (sortOption) {
      case 'recent':
        // Most recent first (newer dates first)
        return sorted.sort((a, b) => {
          const dateA = new Date(a.slot_date || '');
          const dateB = new Date(b.slot_date || '');
          return dateB.getTime() - dateA.getTime();
        });
      case 'oldest':
        // Oldest first (older dates first)
        return sorted.sort((a, b) => {
          const dateA = new Date(a.slot_date || '');
          const dateB = new Date(b.slot_date || '');
          return dateA.getTime() - dateB.getTime();
        });
      case 'created':
        // By creation date (oldest bookings first)
        return sorted.sort((a, b) => {
          const createdA = new Date(a.created_at || '');
          const createdB = new Date(b.created_at || '');
          return createdA.getTime() - createdB.getTime();
        });
      default:
        return sorted;
    }
  };

  const sortedUpcomingBookings = getSortedUpcomingBookings();
  const soonestUpcomingBooking = [...upcomingBookings].sort((a, b) => {
    const dateA = new Date(`${a.slot_date || ''}T${a.slot_start_time || '00:00:00'}`);
    const dateB = new Date(`${b.slot_date || ''}T${b.slot_start_time || '00:00:00'}`);
    return dateA.getTime() - dateB.getTime();
  })[0];
  const visibleBookings = activeTab === 'upcoming' ? sortedUpcomingBookings : pastBookings;
  const totalSessions = upcomingBookings.length + pastBookings.length;
  const completedSessions = pastBookings.length;
  const progressPercent = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
  const displayName = userProfile?.name || session?.user?.name || 'User';
  const displayEmail = userProfile?.email || session?.user?.email || '';
  const memberSinceDate = [...upcomingBookings, ...pastBookings]
    .map((booking) => booking.created_at)
    .filter(Boolean)
    .sort()[0];
  const memberSinceLabel = memberSinceDate ? format(new Date(memberSinceDate), 'MMM yyyy') : 'New member';

  const formatTime = (time?: string) => (time ? time.slice(0, 5) : 'N/A');
  const formatSessionDate = (date?: string) => (date ? format(new Date(date), 'MMM dd, yyyy') : 'N/A');
  const getSessionDay = (date?: string) => (date ? format(new Date(date), 'EEEE') : 'Session');

  const navItems = [
    { label: 'My Profile', icon: User, href: '#profile', active: true },
    { label: 'My Sessions', icon: CalendarDays, href: '#sessions' },
    { label: 'Book Session', icon: CalendarDays, href: '/appointment/type' },
    { label: 'Notes', icon: StickyNote, href: '#notes' },
    { label: 'Payments', icon: CreditCard, href: '#payments' },
    { label: 'Documents', icon: FileText, href: '#documents' },
    { label: 'Settings', icon: Settings, href: '#settings' },
  ];

  const tabItems = [
    { key: 'upcoming' as const, label: 'Upcoming Sessions', icon: CalendarDays, count: upcomingBookings.length },
    { key: 'past' as const, label: 'Past Sessions', icon: CheckCircle2, count: pastBookings.length },
  ];

  const renderSessionCard = (booking: Booking, muted = false) => {
    const isBundle = booking.totalSessions && booking.totalSessions > 1;
    const hasMeetingLink = Boolean(booking.meeting_link);

    return (
      <motion.article
        key={`${booking.id}-${muted ? 'past' : 'upcoming'}-${booking.sessionNumber || 0}`}
        variants={itemVariants}
        className={`group rounded-3xl border border-purple-100/80 bg-white/85 p-4 shadow-[0_14px_45px_rgba(88,28,135,0.08)] backdrop-blur transition-all hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(88,28,135,0.14)] ${
          muted ? 'opacity-75' : ''
        }`}
      >
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex gap-4">
            <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-50 to-purple-100 text-purple-900 shadow-inner">
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-purple-500">
                {booking.slot_date ? format(new Date(booking.slot_date), 'MMM') : '---'}
              </span>
              <span className="text-xl font-black leading-none">
                {booking.slot_date ? format(new Date(booking.slot_date), 'dd') : '--'}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold text-gray-500">{getSessionDay(booking.slot_date)}</p>
                {isBundle && (
                  <span className="rounded-full bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">
                    Session {booking.sessionNumber} of {booking.totalSessions}
                  </span>
                )}
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold capitalize text-indigo-700">
                  {booking.session_type || 'personal'}
                </span>
              </div>

              <h3 className="mt-2 flex items-center gap-2 text-base font-black text-gray-950 sm:text-lg">
                <Clock3 size={18} className="text-purple-500" />
                {formatTime(booking.slot_start_time)} - {formatTime(booking.slot_end_time)}
              </h3>

              <div className="mt-3 border-l-2 border-purple-200 pl-3">
                <p className="text-xs font-black uppercase tracking-[0.16em] text-purple-600">Meeting Note</p>
                <div className="mt-1 text-sm">{renderNoteCell(booking)}</div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 md:justify-end">
            {hasMeetingLink ? (
              <a
                href={booking.meeting_link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-purple-700 shadow-sm ring-1 ring-purple-100 transition hover:bg-purple-50"
              >
                <LinkIcon size={16} />
                Join Meeting
              </a>
            ) : (
              <span className="rounded-full bg-gray-100 px-4 py-2 text-sm font-bold text-gray-500">Not available</span>
            )}
            <span className={`inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-black ${
              muted ? 'bg-gray-100 text-gray-500' : 'bg-emerald-50 text-emerald-700'
            }`}>
              <CheckCircle2 size={15} />
              {muted ? 'Completed' : 'Confirmed'}
            </span>
          </div>
        </div>
      </motion.article>
    );
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#f4eaff_0,#fbf8ff_34%,#ffffff_72%)] pt-20 text-slate-950">
      <div className="mx-auto grid w-full max-w-[1560px] gap-6 px-4 pb-10 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:px-8">
        <aside className="hidden rounded-[1.75rem] border border-purple-100 bg-white/85 p-4 shadow-[0_18px_60px_rgba(88,28,135,0.07)] backdrop-blur-xl lg:sticky lg:top-24 lg:block lg:h-[calc(100vh-7rem)]">
          <div className="mb-6 rounded-3xl bg-gradient-to-br from-purple-50 to-white p-4">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-purple-500">Mannosaar</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Heal • Grow • Transform</p>
          </div>

          <nav className="space-y-2">
            {navItems.map(({ label, icon: Icon, href, active }) => (
              <a
                key={label}
                href={href}
                className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-black transition ${
                  active
                    ? 'bg-gradient-to-r from-purple-100 to-fuchsia-50 text-purple-700 shadow-sm'
                    : 'text-slate-500 hover:bg-purple-50 hover:text-purple-700'
                }`}
              >
                <Icon size={18} />
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex gap-2 overflow-x-auto pb-2 lg:hidden">
            {navItems.map(({ label, icon: Icon, href, active }) => (
              <a
                key={label}
                href={href}
                className={`inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-black ${
                  active ? 'bg-purple-600 text-white' : 'bg-white text-slate-600 ring-1 ring-purple-100'
                }`}
              >
                <Icon size={16} />
                {label}
              </a>
            ))}
          </div>

          <div className="mb-5 flex items-center justify-between gap-4 rounded-[1.5rem] border border-purple-100 bg-white/75 px-4 py-3 shadow-sm backdrop-blur-xl">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-500">Profile dashboard</p>
              <p className="truncate text-sm font-semibold text-slate-500">Manage bookings, notes, and upcoming sessions</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/' })}
                className="hidden rounded-2xl bg-white px-4 py-3 text-sm font-black text-slate-600 shadow-sm ring-1 ring-purple-100 transition hover:bg-purple-50 sm:inline-flex"
              >
                Logout
              </button>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700"
            >
              {error}
            </motion.div>
          )}

          <motion.section
            id="profile"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="relative mb-6 overflow-hidden rounded-[2rem] border border-purple-100 bg-white/85 p-5 shadow-[0_20px_70px_rgba(88,28,135,0.1)] backdrop-blur-xl sm:p-7 lg:p-8"
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_82%_25%,rgba(168,85,247,0.12),transparent_28%)]" />

            <div className="relative grid gap-8 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center">
              <motion.div variants={itemVariants} className="grid gap-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 via-purple-500 to-fuchsia-500 text-white shadow-[0_22px_45px_rgba(147,51,234,0.35)] ring-8 ring-white sm:mx-0">
                  <User size={58} strokeWidth={1.8} />
                  <button
                    type="button"
                    onClick={() => setShowEditModal(true)}
                    className="absolute -bottom-1 -right-1 rounded-full bg-white p-3 text-purple-700 shadow-xl ring-1 ring-purple-100"
                    aria-label="Edit profile"
                  >
                    <Edit2 size={17} />
                  </button>
                </div>

                <div className="text-center sm:text-left">
                  <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">
                    <ShieldCheck size={15} />
                    Verified
                  </div>
                  <h1 className="text-3xl font-black tracking-tight text-slate-950 sm:text-4xl lg:text-5xl">
                    {displayName}
                  </h1>
                  <div className="mt-4 grid gap-2 text-sm font-semibold text-slate-500 sm:text-base">
                    <span className="inline-flex min-w-0 items-center justify-center gap-2 sm:justify-start">
                      <Mail size={17} className="shrink-0" />
                      <span className="truncate">{displayEmail}</span>
                    </span>
                    <span className={`inline-flex items-center justify-center gap-2 sm:justify-start ${
                      userProfile?.phone_number ? '' : 'text-amber-600'
                    }`}>
                      {userProfile?.phone_number ? <Phone size={17} /> : <AlertTriangle size={17} />}
                      {userProfile?.phone_number || 'Phone number required to book sessions'}
                    </span>
                  </div>
                </div>
              </motion.div>

              <motion.div variants={itemVariants} className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                <Link
                  href="/appointment/type"
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-fuchsia-600 px-5 py-4 text-sm font-black text-white shadow-lg shadow-purple-200 transition hover:-translate-y-0.5"
                >
                  <CalendarDays size={18} />
                  Book New Session
                </Link>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-5 py-4 text-sm font-black text-slate-700 shadow-sm ring-1 ring-purple-100 transition hover:bg-purple-50"
                >
                  <Edit2 size={18} />
                  Edit Profile
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white/85 px-5 py-4 text-sm font-black text-slate-500 shadow-sm ring-1 ring-purple-100 transition hover:bg-red-50 hover:text-red-700"
                >
                  <MoreHorizontal size={18} />
                  More
                </button>
              </motion.div>
            </div>

            <motion.div variants={itemVariants} className="relative mt-7 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: 'Member Since', value: memberSinceLabel, icon: CalendarDays },
                { label: 'Total Sessions', value: totalSessions, icon: BarChart3 },
                { label: 'Completed', value: completedSessions, icon: CheckCircle2 },
                { label: 'Upcoming', value: upcomingBookings.length, icon: Clock3 },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="rounded-3xl border border-purple-100 bg-white/80 p-4 shadow-sm">
                  <div className="flex items-center gap-3">
                    <span className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                      <Icon size={20} />
                    </span>
                    <div>
                      <p className="text-xs font-bold text-slate-500">{label}</p>
                      <p className="text-lg font-black text-slate-950">{value}</p>
                    </div>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.section>

        {/* Edit Profile Modal */}
        <AnimatePresence>
          {showEditModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditModal(false)}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Edit Profile</h2>

                {editError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm"
                  >
                    {editError}
                  </motion.div>
                )}

                {editSuccess && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg text-green-600 text-sm flex items-center gap-2"
                  >
                    <Check size={18} />
                    Profile updated successfully!
                  </motion.div>
                )}

                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                      placeholder="Enter your name"
                      disabled={editLoading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      Phone Number * ({editForm.phone_number.replace(/\D/g, '').length} digits)
                    </label>
                    <input
                      type="tel"
                      value={editForm.phone_number}
                      onChange={(e) => setEditForm({ ...editForm, phone_number: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                      placeholder="Enter your phone number"
                      disabled={editLoading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Include area code, minimum 10 digits
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                      WhatsApp Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={editForm.whatsapp_number}
                      onChange={(e) => setEditForm({ ...editForm, whatsapp_number: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent"
                      placeholder="e.g., +1234567890"
                      disabled={editLoading}
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Include country code (e.g., +1 for USA). We'll send session reminders and updates via WhatsApp.
                    </p>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowEditModal(false)}
                    disabled={editLoading}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-semibold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpdateProfile}
                    disabled={editLoading}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {editLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Profile Modal */}
        <AnimatePresence>
          {showDeleteModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowDeleteModal(false)}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
              >
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 rounded-full">
                  <AlertTriangle size={24} className="text-red-600" />
                </div>
                
                <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Delete Profile?</h2>
                
                <p className="text-gray-600 text-center mb-6">
                  Are you sure you want to delete your profile? This action cannot be undone and all your bookings and data will be permanently deleted.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowDeleteModal(false)}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-semibold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteProfile}
                    disabled={deleteLoading}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-semibold transition-all disabled:opacity-50"
                  >
                    {deleteLoading ? 'Deleting...' : 'Yes, Delete'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <section id="sessions" className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="overflow-hidden rounded-[2rem] border border-purple-100 bg-white/85 shadow-[0_20px_70px_rgba(88,28,135,0.07)] backdrop-blur-xl"
          >
            <span id="notes" className="sr-only">Notes</span>
            <div className="flex gap-1 overflow-x-auto border-b border-purple-100 px-4 pt-4 sm:px-6">
              {tabItems.map(({ key, label, icon: Icon, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`relative inline-flex shrink-0 items-center gap-2 px-4 py-3 text-sm font-black transition ${
                    activeTab === key ? 'text-purple-700' : 'text-slate-500 hover:text-purple-700'
                  }`}
                >
                  <Icon size={17} />
                  {label}
                  <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-700">{count}</span>
                  {activeTab === key && (
                    <span className="absolute inset-x-2 bottom-0 h-1 rounded-full bg-purple-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="p-4 sm:p-6">
              <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-black text-slate-950">
                    {activeTab === 'upcoming' ? `Upcoming Sessions (${upcomingBookings.length})` : `Past Sessions (${pastBookings.length})`}
                  </h2>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    Notes, meeting links, and booking details in one place.
                  </p>
                </div>

                {activeTab === 'upcoming' && upcomingBookings.length > 0 && (
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
                    <span className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-purple-50 px-3 py-2 text-sm font-black text-purple-700">
                      <Filter size={16} />
                      Sort
                    </span>
                    {[
                      ['recent', 'Recent'],
                      ['oldest', 'Oldest'],
                      ['created', 'Booked'],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setSortOption(key as typeof sortOption)}
                        className={`shrink-0 rounded-2xl px-3 py-2 text-sm font-black transition ${
                          sortOption === key
                            ? 'bg-purple-600 text-white'
                            : 'bg-white text-slate-500 ring-1 ring-purple-100 hover:bg-purple-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {loading ? (
                <div className="flex min-h-64 flex-col items-center justify-center rounded-3xl bg-purple-50/70 p-8 text-center">
                  <div className="mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-purple-600" />
                  <p className="font-bold text-slate-600">Loading your sessions...</p>
                </div>
              ) : visibleBookings.length === 0 ? (
                <motion.div variants={itemVariants} className="rounded-3xl border border-dashed border-purple-200 bg-purple-50/70 p-8 text-center">
                  <p className="text-lg font-black text-slate-800">
                    {activeTab === 'upcoming' ? 'No upcoming sessions' : 'No past sessions yet'}
                  </p>
                  <p className="mt-2 text-sm font-medium text-slate-500">
                    {activeTab === 'upcoming'
                      ? "You haven't booked any therapy sessions yet."
                      : 'Completed sessions will show here.'}
                  </p>
                  {activeTab === 'upcoming' && (
                    <Link
                      href="/appointment/type"
                      className="mt-5 inline-flex items-center justify-center rounded-full bg-purple-600 px-5 py-3 text-sm font-black text-white transition hover:bg-purple-700"
                    >
                      Book Your First Appointment
                    </Link>
                  )}
                </motion.div>
              ) : (
                <motion.div variants={containerVariants} className="space-y-4">
                  {visibleBookings.map((booking) => renderSessionCard(booking, activeTab === 'past'))}
                </motion.div>
              )}
            </div>
          </motion.div>

          <aside className="space-y-5">
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="rounded-[2rem] border border-purple-100 bg-white/85 p-5 shadow-[0_20px_70px_rgba(88,28,135,0.07)] backdrop-blur-xl"
            >
              <p className="text-base font-black text-slate-950">Progress</p>
              <div className="mt-5 grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center xl:grid-cols-1">
                <div className="relative mx-auto flex h-32 w-32 items-center justify-center rounded-full">
                  <div
                    className="absolute inset-0 rounded-full"
                    style={{
                      background: `conic-gradient(#7c3aed ${progressPercent * 3.6}deg, #ede9fe 0deg)`,
                    }}
                  />
                  <div className="relative flex h-24 w-24 flex-col items-center justify-center rounded-full bg-white shadow-inner">
                    <span className="text-2xl font-black text-slate-950">{progressPercent}%</span>
                    <span className="text-center text-[11px] font-bold leading-tight text-slate-500">Complete</span>
                  </div>
                </div>

                <div className="grid gap-3">
                  {[
                    { label: 'Completed', value: completedSessions, icon: CheckCircle2 },
                    { label: 'Upcoming', value: upcomingBookings.length, icon: Clock3 },
                    { label: 'Total Sessions', value: totalSessions, icon: BarChart3 },
                  ].map(({ label, value, icon: Icon }) => (
                    <div key={label} className="flex items-center gap-3 rounded-2xl bg-purple-50/70 p-3">
                      <span className="rounded-2xl bg-white p-3 text-purple-700 shadow-sm">
                        <Icon size={18} />
                      </span>
                      <div>
                        <p className="text-lg font-black text-slate-950">{value}</p>
                        <p className="text-xs font-bold text-slate-500">{label}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="overflow-hidden rounded-[2rem] bg-gradient-to-br from-purple-600 via-fuchsia-500 to-violet-500 p-5 text-white shadow-[0_18px_55px_rgba(147,51,234,0.22)]"
            >
              <p className="text-lg font-black">Next Session</p>
              {soonestUpcomingBooking ? (
                <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center xl:flex-col xl:items-stretch">
                  <div className="flex items-center gap-4">
                    <div className="rounded-2xl bg-white/18 p-3 text-center backdrop-blur">
                      <p className="text-xs font-black uppercase tracking-[0.16em]">
                        {soonestUpcomingBooking.slot_date ? format(new Date(soonestUpcomingBooking.slot_date), 'MMM') : '---'}
                      </p>
                      <p className="text-3xl font-black leading-none">
                        {soonestUpcomingBooking.slot_date ? format(new Date(soonestUpcomingBooking.slot_date), 'dd') : '--'}
                      </p>
                    </div>
                    <div>
                      <p className="font-black">
                        {formatTime(soonestUpcomingBooking.slot_start_time)} - {formatTime(soonestUpcomingBooking.slot_end_time)}
                      </p>
                      <p className="text-sm font-medium text-white/75">{formatSessionDate(soonestUpcomingBooking.slot_date)}</p>
                    </div>
                  </div>
                  {soonestUpcomingBooking.meeting_link ? (
                    <a
                      href={soonestUpcomingBooking.meeting_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-black text-purple-700"
                    >
                      <LinkIcon size={16} />
                      Join Meeting
                    </a>
                  ) : (
                    <span className="inline-flex items-center justify-center rounded-full bg-white/18 px-5 py-3 text-sm font-black text-white">
                      Link pending
                    </span>
                  )}
                </div>
              ) : (
                <p className="mt-4 text-sm font-medium text-white/80">Book a session to see your next appointment here.</p>
              )}
            </motion.div>
          </aside>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-3">
          <div id="payments" className="rounded-[1.75rem] border border-purple-100 bg-white/85 p-5 shadow-[0_16px_55px_rgba(88,28,135,0.06)]">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                <CreditCard size={20} />
              </span>
              <div>
                <h3 className="font-black text-slate-950">Payments</h3>
                <p className="text-sm font-medium text-slate-500">PayU payments are attached to confirmed bookings.</p>
              </div>
            </div>
          </div>

          <div id="documents" className="rounded-[1.75rem] border border-purple-100 bg-white/85 p-5 shadow-[0_16px_55px_rgba(88,28,135,0.06)]">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                <FileText size={20} />
              </span>
              <div>
                <h3 className="font-black text-slate-950">Documents</h3>
                <p className="text-sm font-medium text-slate-500">Session documents will appear here when available.</p>
              </div>
            </div>
          </div>

          <div id="settings" className="rounded-[1.75rem] border border-purple-100 bg-white/85 p-5 shadow-[0_16px_55px_rgba(88,28,135,0.06)]">
            <div className="flex items-center gap-3">
              <span className="rounded-2xl bg-purple-100 p-3 text-purple-700">
                <Settings size={20} />
              </span>
              <div>
                <h3 className="font-black text-slate-950">Preferences</h3>
                <button
                  type="button"
                  onClick={() => setShowEditModal(true)}
                  className="mt-1 text-sm font-black text-purple-700 underline underline-offset-4"
                >
                  Edit profile details
                </button>
              </div>
            </div>
          </div>
        </section>

        <NoteModal
          isOpen={!!noteModal}
          note={noteModal?.note ?? null}
          title={noteModal?.title}
          onClose={() => setNoteModal(null)}
        />
        </main>
      </div>
    </div>
  );
};

export default ProfilePage;
