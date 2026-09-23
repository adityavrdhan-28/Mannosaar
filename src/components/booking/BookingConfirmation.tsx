'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { format } from 'date-fns';
import { createClient } from '@/lib/supabase/client';
import {
  DEFAULT_BUNDLE_PRICING,
  type BundlePricing,
} from '@/lib/services';

interface SlotInfo {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  duration_minutes?: number;
}

interface UserProfile {
  id: string;
  name: string;
  email: string;
  phone_number?: string;
}

interface SessionDate {
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
}

interface StoredSlotInfo {
  slotId?: string;
  date: string;
  startTime: string;
  endTime: string;
}

const CONFIRMATION_SLOT_INFO_STORAGE_KEY = 'pendingConfirmationSlotInfo';

const BookingConfirmation = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const supabase = createClient();

  const sessionType = searchParams.get('type') || 'personal';
  const slotId = searchParams.get('slotId');
  const selectedDate = searchParams.get('date');
  const selectedStartTime = searchParams.get('startTime');
  const selectedEndTime = searchParams.get('endTime');
  const bundle = searchParams.get('bundle') ? parseInt(searchParams.get('bundle')!) : null;

  // Price state - now supports bundle pricing
  const [prices, setPrices] = useState<BundlePricing>({ ...DEFAULT_BUNDLE_PRICING });

  const [slotInfo, setSlotInfo] = useState<SlotInfo | null>(null);
  const [cachedSlotInfo, setCachedSlotInfo] = useState<SlotInfo | null>(null);
  const [sessionSlots, setSessionSlots] = useState<SessionDate[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneInput, setPhoneInput] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [savingPhone, setSavingPhone] = useState(false);

  // Load sessionDates from sessionStorage (set by SlotSelection)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedSingleSlotInfo = sessionStorage.getItem(CONFIRMATION_SLOT_INFO_STORAGE_KEY);
      if (storedSingleSlotInfo) {
        try {
          const parsed = JSON.parse(storedSingleSlotInfo) as StoredSlotInfo;
          if (parsed?.date && parsed?.startTime && parsed?.endTime) {
            setCachedSlotInfo({
              id: parsed.slotId || slotId || 'confirmation-slot',
              date: parsed.date,
              start_time: parsed.startTime,
              end_time: parsed.endTime,
            });
          }
        } catch (err) {
          console.error('Failed to parse confirmation slot info:', err);
        }
      }

      const storedSessions = sessionStorage.getItem('pendingSessionDates');
      if (storedSessions) {
        try {
          const parsed = JSON.parse(storedSessions);
          setSessionSlots(parsed);
          // Clear from storage after reading
          sessionStorage.removeItem('pendingSessionDates');
        } catch (err) {
          console.error('Failed to parse sessionDates from storage:', err);
        }
      }
    }
  }, []);

  // Calculate bundleSize from sessionDates when set
  const bundleSize = sessionSlots.length > 0 ? sessionSlots.length : 1;
  const priceKey = `${sessionType}_${bundleSize}` as keyof typeof prices;
  const sessionPrice = prices[priceKey] || 0;
  const totalPrice = sessionPrice;
  const formatTime = (time?: string) => (time ? time.slice(0, 5) : '');
  const singleSlotFallback =
    slotId && selectedDate && selectedStartTime && selectedEndTime
      ? {
          id: slotId,
          date: selectedDate,
          start_time: selectedStartTime,
          end_time: selectedEndTime,
        }
      : null;
  const resolvedSingleSlotInfo = slotInfo || cachedSlotInfo || singleSlotFallback;

  // Fetch pricing settings
  useEffect(() => {
    const fetchPrices = async () => {
      try {
        const response = await fetch('/api/admin/pricing');
        if (response.ok) {
          const data = await response.json();
          // API returns { success, pricing, timestamp } - extract pricing only
          if (data.pricing) {
            setPrices(data.pricing);
          }
        }
      } catch (err) {
        console.error('Error fetching prices:', err);
        // Use defaults if fetch fails
      }
    };

    fetchPrices();
  }, []);

  // Fetch slot details (for single bookings)
  useEffect(() => {
    const fetchSlotInfo = async () => {
    if (!slotId) {
      if (resolvedSingleSlotInfo) {
        setSlotInfo(resolvedSingleSlotInfo);
      }
      setLoading(false);
      return;
      }

      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('therapy_slots')
        .select('*')
        .eq('id', slotId)
        .single();

      if (fetchError) {
        setError('Failed to load slot information');
        if (resolvedSingleSlotInfo) {
          setSlotInfo(resolvedSingleSlotInfo);
          setError('');
        }
      } else if (data) {
        setSlotInfo(data);
      } else if (resolvedSingleSlotInfo) {
        setSlotInfo(resolvedSingleSlotInfo);
      }
      setLoading(false);
    };

    // If we have sessionSlots (from sessionStorage), use those
    if (sessionSlots.length > 0) {
      setLoading(false);
      return;
    }

    // Otherwise, fetch single slot
    if (slotId || resolvedSingleSlotInfo) {
      fetchSlotInfo();
    } else {
      setLoading(false);
    }
  }, [
    slotId,
    selectedDate,
    selectedStartTime,
    selectedEndTime,
    sessionSlots.length,
    supabase,
    cachedSlotInfo?.id,
    cachedSlotInfo?.date,
    cachedSlotInfo?.start_time,
    cachedSlotInfo?.end_time,
  ]);

  // Redirect to login if not authenticated
  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/auth/login');
    }
  }, [session, router]);

  // Fetch user profile
  useEffect(() => {
    const fetchUserProfile = async () => {
      try {
        const response = await fetch('/api/user/update-profile');
        if (response.ok) {
          const profile = await response.json();
          setUserProfile(profile);
          console.log('📱 Profile loaded, phone_number:', profile.phone_number ? '✅ YES' : '❌ NO');
          // Only show phone modal if phone number is MISSING
          if (!profile.phone_number) {
            console.log('📱 Showing phone modal - no phone number found');
            setShowPhoneModal(true);
          } else {
            console.log('📱 Phone number exists, not showing modal');
            setShowPhoneModal(false);
          }
        } else if (response.status === 401) {
          // User not authenticated
          console.log('User not authenticated');
        } else {
          console.error('Failed to fetch profile');
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      }
    };

    if (session?.user?.email) {
      fetchUserProfile();
    }
  }, [session]);

  const handleSavePhoneNumber = async () => {
    if (!phoneInput.trim()) {
      setPhoneError('Phone number is required');
      return;
    }

    const phoneDigits = phoneInput.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setPhoneError('Phone number must have at least 10 digits');
      return;
    }

    setSavingPhone(true);
    setPhoneError('');

    try {
      const response = await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userProfile?.name || session?.user?.name || '',
          phone_number: phoneInput.trim(),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save phone number');
      }

      const updated = await response.json();
      console.log('✅ Phone number saved:', updated.user.phone_number);
      
      // Update userProfile with the new phone number
      setUserProfile(updated.user);
      
      // Hide modal only after successful save
      setShowPhoneModal(false);
      setPhoneInput('');
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to save phone number';
      console.error('❌ Error saving phone:', errorMsg);
      setPhoneError(errorMsg);
    } finally {
      setSavingPhone(false);
    }
  };

  const handleConfirmBooking = async () => {
    // For bundles: need sessionSlots. For single: need slotId and slotInfo
    const isBundleBooking = sessionSlots && sessionSlots.length > 0;
    
    if (!session?.user?.email) {
      setError('Missing email information');
      return;
    }

    if (isBundleBooking) {
      // Bundle booking validation
      if (!bundle || bundle < 1 || bundle > 3) {
        setError('Invalid bundle size');
        return;
      }
    } else {
      // Single booking validation
      if (!slotId || !slotInfo) {
        setError('Missing slot information');
        return;
      }
    }

    // Check if phone number is set - only show modal if NOT set
    if (!userProfile?.phone_number) {
      console.log('❌ Phone number missing - showing modal');
      setShowPhoneModal(true);
      return;
    }

    console.log('✅ Phone number exists:', userProfile.phone_number);

    setConfirming(true);
    setError('');

    try {
      if (isBundleBooking) {
        // Bundle booking - persist sessions for the payment page and still
        // include them in the URL as a fallback for direct links.
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem('pendingPaymentSessionDates', JSON.stringify(sessionSlots));
          window.sessionStorage.removeItem('pendingPaymentSlotInfo');
        }

        const params = new URLSearchParams({
          type: sessionType,
          bundle: bundle!.toString(),
          sessionDates: JSON.stringify(sessionSlots),
        });
        router.push(`/appointment/payment?${params.toString()}`);
      } else {
        if (typeof window !== 'undefined') {
          window.sessionStorage.setItem(
            'pendingPaymentSlotInfo',
            JSON.stringify({
              slotId: slotId!,
              date: slotInfo!.date,
              startTime: slotInfo!.start_time,
              endTime: slotInfo!.end_time,
            })
          );
          window.sessionStorage.removeItem('pendingPaymentSessionDates');
        }

        // Single booking - pass slotId to payment
        const params = new URLSearchParams({
          type: sessionType,
          slotId: slotId!,
          date: slotInfo!.date,
          startTime: slotInfo!.start_time,
          endTime: slotInfo!.end_time,
        });
        router.push(`/appointment/payment?${params.toString()}`);
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'An error occurred';
      console.error('Navigation error:', errorMsg);
      setError(errorMsg);
    } finally {
      setConfirming(false);
    }
  };

  if (!session) {
    return null;
  }

  const containerVariants = {
    hidden: { opacity: 0, scale: 0.95 },
    visible: { opacity: 1, scale: 1, transition: { duration: 0.5 } },
  };

  return (
    <div className="booking-theme min-h-screen pt-24 pb-12">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="rounded-3xl border border-gray-200 bg-white p-5 sm:p-6 md:p-8 shadow-sm"
        >
          {/* Header */}
          <div className="mb-6 sm:mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-purple-600 mb-2">
              Step 4
            </p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 mb-2">
              Booking confirmation
            </h1>
            <p className="text-gray-600">Review the details before you continue.</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600"
            >
              {error}
            </motion.div>
          )}

          {loading ? (
            <div className="text-center py-12">Loading booking details...</div>
          ) : (
            <>
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 sm:p-5 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Session type
                    </p>
                    <p className="text-lg font-semibold text-gray-900 capitalize">{sessionType}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Price
                    </p>
                    <p className="text-lg font-semibold text-purple-600">₹{totalPrice}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Duration
                    </p>
                    <p className="text-lg font-semibold text-gray-900">40 mins</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                      Therapist
                    </p>
                    <p className="text-lg font-semibold text-gray-900">Neetu Rathore</p>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5 mb-6">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
                  Appointment details
                </p>
                {resolvedSingleSlotInfo ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-500">Date</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {format(new Date(resolvedSingleSlotInfo.date), 'MMM dd, yyyy')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm text-gray-500">Time</span>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatTime(resolvedSingleSlotInfo.start_time)} - {formatTime(resolvedSingleSlotInfo.end_time)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {sessionSlots.map((session, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">
                            Session {idx + 1} of {bundleSize}
                          </p>
                          <p className="text-sm text-gray-500">
                            {format(new Date(session.date), 'MMM dd, yyyy')}
                          </p>
                        </div>
                        <span className="text-sm font-semibold text-gray-900">
                          {formatTime(session.startTime)} - {formatTime(session.endTime)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5 mb-6"
              >
                <p className="text-sm text-blue-800 leading-relaxed">
                  <span className="font-semibold">Note:</span> A Google Meet link will be sent to{' '}
                  <span className="font-semibold break-all">{session.user?.email}</span> after the booking is confirmed.
                </p>
              </motion.div>

              {/* Action Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <button
                  onClick={() => router.back()}
                  disabled={confirming}
                  className="w-full px-6 py-3 border-2 border-gray-300 text-gray-900 rounded-xl font-semibold hover:border-gray-400 transition-colors disabled:opacity-50 bg-white"
                >
                  Back
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={confirming}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                >
                  {confirming ? 'Processing...' : 'Proceed to Payment'}
                </button>
              </motion.div>
            </>
          )}
        </motion.div>

        {/* Phone Number Modal */}
        <AnimatePresence>
          {showPhoneModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                // Only close if user already had a phone number (Cancel button case)
                // If they didn't have one, don't allow closing by clicking outside
                if (userProfile?.phone_number && !savingPhone) setShowPhoneModal(false);
              }}
              className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Phone Number Required</h2>
                <p className="text-gray-600 mb-6">
                  We need your phone number to complete your booking. This helps us send you session reminders and updates.
                </p>

                {phoneError && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm"
                  >
                    {phoneError}
                  </motion.div>
                )}

                <div className="mb-6">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Phone Number ({phoneInput.replace(/\D/g, '').length} digits)
                  </label>
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="Enter your phone number (e.g., +91 98765 43210)"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-600 focus:border-transparent text-lg"
                    disabled={savingPhone}
                    autoFocus
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Include country code, minimum 10 digits
                  </p>
                </div>

                <div className="flex gap-3">
                  {!userProfile?.phone_number && (
                    <button
                      onClick={() => router.back()}
                      disabled={savingPhone}
                      className="flex-1 px-4 py-3 bg-gray-200 hover:bg-gray-300 text-gray-900 rounded-lg font-semibold transition-all disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                  <button
                    onClick={handleSavePhoneNumber}
                    disabled={savingPhone}
                    className="flex-1 px-4 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50"
                  >
                    {savingPhone ? 'Saving...' : 'Continue'}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default BookingConfirmation;
