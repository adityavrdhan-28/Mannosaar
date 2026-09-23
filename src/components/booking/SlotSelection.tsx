'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { format, addDays, addMonths, startOfMonth, endOfMonth, eachDayOfInterval } from 'date-fns';
import { getServiceById } from '@/lib/services';

interface Slot {
  id: string;
  date: string;
  start_time: string;
  end_time: string;
  is_available: boolean;
  is_blocked: boolean;
}

interface SessionSelection {
  date: string;
  slotId: string;
  startTime: string;
  endTime: string;
}

interface ExistingBooking {
  slot: {
    date: string;
    start_time: string;
  };
}

interface RescheduledBooking {
  slot_date: string;
  slot_start_time: string;
  slot_end_time: string;
  meeting_link?: string | null;
  number_of_sessions?: number | null;
  meeting_links?: string[] | null;
}

interface SlotSelectionProps {
  sessionType?: string;
  bundleSize?: number;
}

const SlotSelection = ({ sessionType = 'personal', bundleSize = 1 }: SlotSelectionProps) => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();

  // Reschedule mode detection
  const rescheduleId = searchParams.get('reschedule');
  const rescheduleSessionIndex = searchParams.get('sessionIndex') ? parseInt(searchParams.get('sessionIndex')!) : undefined;
  const isReschedule = !!rescheduleId;

  // Override with URL params if provided
  const typeParam = searchParams.get('type') || sessionType;
  const selectedService = getServiceById(typeParam) || getServiceById('personal')!;
  const bundleParam = searchParams.get('bundle') ? parseInt(searchParams.get('bundle')!) : bundleSize;

  const [selectedSessions, setSelectedSessions] = useState<SessionSelection[]>([]);
  const [currentSessionIndex, setCurrentSessionIndex] = useState(0);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState<Set<string>>(new Set());
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [oldBooking, setOldBooking] = useState<ExistingBooking | null>(null);
  const [confirmReschedule, setConfirmReschedule] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleSuccess, setRescheduleSuccess] = useState(false);
  const [updatedBooking, setUpdatedBooking] = useState<RescheduledBooking | null>(null);

  const formatTime = (time: string) => time.slice(0, 5);
  const todayString = format(new Date(), 'yyyy-MM-dd');

  // Redirect to login if not authenticated
  useEffect(() => {
    if (session === undefined) return;
    if (!session) {
      router.push('/auth/login');
    }
  }, [session, router]);

  // Load old booking if reschedule mode
  useEffect(() => {
    if (!isReschedule || !rescheduleId) return;

    const fetchOldBooking = async () => {
      try {
        console.log('📋 Fetching old booking:', rescheduleId);
        const response = await fetch(`/api/bookings/${rescheduleId}`);
        
        if (!response.ok) {
          const errorData = await response.json();
          console.error('❌ Error fetching booking:', response.status, errorData);
          return;
        }
        
        const booking = await response.json();
        setOldBooking(booking);
        console.log('✅ Old booking loaded:', booking);
      } catch (error) {
        console.error('❌ Error fetching old booking:', error);
      }
    };

    fetchOldBooking();
  }, [isReschedule, rescheduleId]);

  // Fetch available dates for the entire month
  useEffect(() => {
    const fetchMonthAvailability = async () => {
      try {
        const monthParam = format(startOfMonth(displayMonth), 'yyyy-MM-dd');

        const response = await fetch(
          `/api/appointment/available-slots?month=${monthParam}`
        );

        if (!response.ok) {
          console.error('Error fetching month slots:', await response.json());
          return;
        }

        const data = await response.json();
        setAvailableDates(new Set(data.availableDates || []));
      } catch (error) {
        console.error('Error fetching month availability:', error);
      }
    };

    fetchMonthAvailability();
  }, [displayMonth]);

  // Fetch slots for selected date
  useEffect(() => {
    const fetchSlots = async () => {
      setLoading(true);
      setSelectedSlot(null);
      try {
        const response = await fetch(
          `/api/appointment/available-slots?date=${selectedDate}`
        );

        if (!response.ok) {
          console.error('Error fetching slots:', await response.json());
          setLoading(false);
          return;
        }

        const data = await response.json();
        setSlots(data.slots || []);
      } finally {
        setLoading(false);
      }
    };

    fetchSlots();
  }, [selectedDate]);

  const handleSelectSlot = (slotId: string) => {
    setSelectedSlot(slotId);
  };

  const handleConfirmSession = () => {
    if (!selectedSlot) return;
    
    const slot = slots.find(s => s.id === selectedSlot);
    if (!slot) return;

    if (isReschedule) {
      // For reschedule, just confirm and show modal
      setConfirmReschedule(true);
    } else {
      // For normal booking, add to sessions
      const newSelection: SessionSelection = {
        date: selectedDate,
        slotId: selectedSlot,
        startTime: slot.start_time,
        endTime: slot.end_time,
      };

      const newSessions = [...selectedSessions, newSelection];
      setSelectedSessions(newSessions);

      // If all sessions selected, proceed to confirmation
      if (newSessions.length === bundleParam) {
        proceedToConfirmation(newSessions);
      } else {
        // Move to next session selection
        setCurrentSessionIndex(newSessions.length);
        setSelectedDate(format(addDays(new Date(selectedDate), 1), 'yyyy-MM-dd'));
        setSelectedSlot(null);
      }
    }
  };

  const proceedToConfirmation = (sessions: SessionSelection[]) => {
    // Store selected appointment data for the next step.
    if (typeof window !== 'undefined') {
      if (sessions.length === 1) {
        sessionStorage.setItem('pendingConfirmationSlotInfo', JSON.stringify(sessions[0]));
        sessionStorage.removeItem('pendingSessionDates');
      } else {
        sessionStorage.setItem('pendingSessionDates', JSON.stringify(sessions));
        sessionStorage.removeItem('pendingConfirmationSlotInfo');
      }
    }

    const params = new URLSearchParams({
      type: typeParam,
      bundle: String(bundleParam),
    });

    if (sessions.length === 1) {
      const [singleSession] = sessions;
      params.set('slotId', singleSession.slotId);
      params.set('date', singleSession.date);
      params.set('startTime', singleSession.startTime);
      params.set('endTime', singleSession.endTime);
    }

    router.push(`/appointment/confirm?${params.toString()}`, {
      scroll: false,
    });
  };

  const handleConfirmReschedule = async () => {
    if (!selectedSlot || !rescheduleId) return;

    setRescheduling(true);
    try {
      const slot = slots.find(s => s.id === selectedSlot);
      if (!slot) throw new Error('Slot not found');

      const response = await fetch('/api/bookings/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bookingId: rescheduleId,
          newSlotId: selectedSlot,
          newDate: selectedDate,
          newStartTime: slot.start_time,
          newEndTime: slot.end_time,
          sessionIndex: rescheduleSessionIndex,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error('Reschedule error:', data);
        alert(data.error || 'Failed to reschedule');
        return;
      }

      console.log('✅ Session rescheduled:', data);
      setUpdatedBooking(data.booking);
      setConfirmReschedule(false);
      setRescheduleSuccess(true);
    } catch (error) {
      console.error('Reschedule error:', error);
      alert('Failed to reschedule session');
    } finally {
      setRescheduling(false);
    }
  };

  const handleBack = () => {
    if (currentSessionIndex > 0) {
      const newSessions = selectedSessions.slice(0, -1);
      setSelectedSessions(newSessions);
      setCurrentSessionIndex(newSessions.length);
      setSelectedDate(newSessions[newSessions.length - 1]?.date || format(new Date(), 'yyyy-MM-dd'));
      setSelectedSlot(null);
    } else {
      router.back();
    }
  };

  const goToProfile = () => {
    window.location.assign('/profile');
  };

  // Generate calendar dates
  const monthStart = startOfMonth(displayMonth);
  const monthEnd = endOfMonth(displayMonth);
  const calendarDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const firstDayOfWeek = monthStart.getDay();
  const prevMonthDays = Array(firstDayOfWeek)
    .fill(null)
    .map((_, i) => addDays(monthStart, -(firstDayOfWeek - i)));

  const allCalendarDays = [...prevMonthDays, ...calendarDays];

  if (!session) {
    return null;
  }

  return (
    <div className="booking-theme min-h-screen pt-24 pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Progress Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 sm:mb-8"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-purple-600 mb-2">
                {isReschedule ? 'Reschedule' : 'Step 3'}
              </p>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900">
                {isReschedule
                  ? 'Choose a new time'
                  : bundleParam === 1
                  ? 'Pick a date and time'
                  : `Pick session ${currentSessionIndex + 1} of ${bundleParam}`}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-gray-600 max-w-2xl">
                Session type: <span className="font-semibold capitalize text-purple-600">{typeParam} Therapy</span>
                {bundleParam > 1 && ` • Bundle: ${bundleParam} Sessions`}
              </p>
            </div>

            {bundleParam > 1 && !isReschedule && (
              <div className="inline-flex w-full items-center justify-between gap-3 border border-purple-100 bg-white/80 px-4 py-3 shadow-sm lg:w-auto lg:self-start">
                <span className="text-sm text-gray-600">Progress</span>
                <span className="text-lg font-semibold text-purple-600">
                  {currentSessionIndex + 1} / {bundleParam}
                </span>
              </div>
            )}
          </div>
        </motion.div>

        {/* Show previously selected sessions if bundle */}
        {bundleParam > 1 && selectedSessions.length > 0 && !isReschedule && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 border border-purple-200 bg-purple-50 p-4"
          >
            <p className="font-semibold text-gray-900 mb-3">Previously Selected Sessions:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {selectedSessions.map((session, idx) => (
                <div key={idx} className="border border-purple-100 bg-white p-3">
                  <p className="text-sm text-gray-600">Session {idx + 1}</p>
                  <p className="font-semibold text-gray-900">
                    {format(new Date(session.date), 'MMM dd, yyyy')} • {session.startTime}
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:gap-8">
          {/* Calendar */}
          <div className="lg:col-span-1">
            <div className="border border-gray-200 bg-white p-4 sm:p-5 lg:p-6 shadow-sm">
              {/* Month Navigation */}
              <div className="mb-5 flex items-center justify-between gap-3">
                <button
                  onClick={() => setDisplayMonth(addMonths(displayMonth, -1))}
                  className="flex h-10 w-10 items-center justify-center border border-gray-200 text-gray-700 transition-colors hover:border-purple-300 hover:bg-purple-50"
                >
                  ←
                </button>
                <h3 className="text-base sm:text-lg font-bold text-gray-900">{format(displayMonth, 'MMMM yyyy')}</h3>
                <button
                  onClick={() => setDisplayMonth(addMonths(displayMonth, 1))}
                  className="flex h-10 w-10 items-center justify-center border border-gray-200 text-gray-700 transition-colors hover:border-purple-300 hover:bg-purple-50"
                >
                  →
                </button>
              </div>

              {/* Weekday Headers */}
              <div className="mb-3 grid grid-cols-7 gap-1 sm:gap-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-gray-500 sm:text-xs">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 sm:gap-2 mb-5">
                {allCalendarDays.map((day, idx) => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const isCurrentMonth = day.getMonth() === displayMonth.getMonth();
                  const isSelected = dateStr === selectedDate;
                  const isPast = dateStr < todayString;
                  const isAvailable = availableDates.has(dateStr);
                  const isAlreadyBooked = selectedSessions.some(s => s.date === dateStr);

                  return (
                    <button
                      key={idx}
                      onClick={() => !isPast && isCurrentMonth && !isAlreadyBooked && setSelectedDate(dateStr)}
                      disabled={isPast || !isCurrentMonth || isAlreadyBooked}
                      className={`flex aspect-square items-center justify-center border text-xs font-semibold transition-all sm:text-sm ${
                        isSelected
                          ? 'bg-purple-600 text-white'
                          : isAlreadyBooked
                            ? 'bg-green-200 text-green-900 cursor-not-allowed'
                            : isAvailable && isCurrentMonth
                              ? 'bg-green-100 text-green-900 hover:bg-green-200'
                              : isCurrentMonth
                                ? 'bg-gray-100 text-gray-900 hover:bg-purple-100'
                                : 'text-gray-300 cursor-not-allowed'
                      }`}
                      title={isAlreadyBooked ? 'Already selected for this bundle' : ''}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="grid gap-2 border border-gray-100 bg-gray-50 p-3 text-sm text-gray-600 sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border border-green-300 bg-green-100"></div>
                  <span>Available</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 border border-purple-600 bg-purple-600"></div>
                  <span>Selected</span>
                </div>
                {bundleParam > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="h-4 w-4 border border-green-300 bg-green-200"></div>
                    <span>Already booked</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Slots */}
          <div className="lg:col-span-2">
            <div className="border border-gray-200 bg-white p-4 sm:p-5 lg:p-6 shadow-sm">
              <div className="mb-4 sm:mb-5">
                <p className="text-sm font-semibold uppercase tracking-[0.22em] text-purple-600 mb-2">
                  Available slots
                </p>
                <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-gray-900">
                  {format(new Date(selectedDate), 'MMM dd, yyyy')}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  Choose one time slot for this session.
                </p>
              </div>

              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading available slots...</div>
              ) : slots.length === 0 ? (
                <div className="border border-dashed border-gray-200 py-10 text-center">
                  <p className="text-gray-500 mb-4">No available slots for this date</p>
                  <p className="text-sm text-gray-400">Please select another date</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 mb-4 sm:mb-5">
                    {slots.map((slot) => (
                      <motion.button
                        key={slot.id}
                        whileHover={{ y: -2 }}
                        onClick={() => handleSelectSlot(slot.id)}
                        className={`w-full border-2 px-4 py-4 text-left transition-all min-h-[104px] ${
                          selectedSlot === slot.id
                            ? 'border-purple-600 bg-purple-50 text-gray-900 shadow-sm'
                            : 'border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">Time</p>
                            <p className="mt-1 text-lg sm:text-xl font-bold tracking-tight leading-none">
                              {formatTime(slot.start_time)}
                            </p>
                          </div>
                          <div className={`border px-2 py-1 text-[11px] font-semibold ${
                            selectedSlot === slot.id
                              ? 'border-purple-600 bg-purple-600 text-white'
                              : 'border-gray-200 bg-gray-100 text-gray-600'
                          }`}>
                            {selectedService.durationMinutes} mins
                          </div>
                        </div>
                        <div className="mt-3 text-sm text-gray-600">
                          {formatTime(slot.start_time)} - {formatTime(slot.end_time)}
                        </div>
                      </motion.button>
                    ))}
                  </div>

                  {/* Navigation Buttons */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      onClick={handleBack}
                      className="w-full border-2 border-gray-300 bg-white px-5 py-3 font-semibold text-gray-900 transition-colors hover:border-gray-400"
                    >
                      {currentSessionIndex > 0 ? 'Back' : 'Go Back'}
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      onClick={handleConfirmSession}
                      disabled={!selectedSlot}
                      className={`w-full px-5 py-3 font-semibold transition-all ${
                        selectedSlot
                          ? 'bg-purple-600 text-white hover:bg-purple-700'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                    >
                      {isReschedule
                        ? 'Review Reschedule'
                        : currentSessionIndex < bundleParam - 1 
                        ? `Continue (${currentSessionIndex + 1}/${bundleParam})`
                        : 'Confirm & Continue'}
                    </motion.button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Reschedule Confirmation Modal */}
        <AnimatePresence>
          {confirmReschedule && oldBooking && selectedSlot && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfirmReschedule(false)}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white p-6 sm:p-8 shadow-2xl max-w-md w-full border border-gray-200"
              >
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Confirm Reschedule</h2>

                <div className="space-y-4 mb-6">
                  <div className="bg-red-50 p-4 border border-red-200">
                    <p className="text-sm text-gray-600 mb-1">Current Session</p>
                    <p className="font-semibold text-gray-900">
                      {format(new Date(oldBooking.slot.date), 'MMM dd, yyyy')} • {oldBooking.slot.start_time.substring(0, 5)}
                    </p>
                  </div>

                  <div className="text-center text-gray-600">↓</div>

                  <div className="bg-green-50 p-4 border border-green-200">
                    <p className="text-sm text-gray-600 mb-1">New Session</p>
                    <p className="font-semibold text-gray-900">
                      {format(new Date(selectedDate), 'MMM dd, yyyy')} • {slots.find(s => s.id === selectedSlot)?.start_time.substring(0, 5)}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-gray-600 mb-6">
                  No charges will be applied. The old slot will be freed up.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmReschedule(false)}
                    disabled={rescheduling}
                    className="flex-1 px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold transition-all disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmReschedule}
                    disabled={rescheduling}
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {rescheduling ? (
                      <>
                        <div className="animate-spin h-4 w-4 border-2 border-white border-b-transparent"></div>
                        Confirming...
                      </>
                    ) : (
                      'Confirm Reschedule'
                    )}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reschedule Success Modal */}
        <AnimatePresence>
          {rescheduleSuccess && updatedBooking && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setRescheduleSuccess(false);
                goToProfile();
              }}
              className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="bg-white p-6 sm:p-8 shadow-2xl max-w-md w-full border border-gray-200"
              >
                {/* Success Icon */}
                <div className="flex justify-center mb-6">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
                    className="w-16 h-16 bg-green-100 flex items-center justify-center"
                  >
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </motion.div>
                </div>

                <h2 className="text-2xl font-bold text-center text-gray-900 mb-2">Session Rescheduled!</h2>
                <p className="text-center text-gray-600 mb-6">Your therapy session has been successfully rescheduled.</p>

                {/* New Session Details */}
                <div className="space-y-4 mb-6 p-4 bg-purple-50 border border-purple-200">
                  <div>
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-1">New Date & Time</p>
                    <p className="font-semibold text-gray-900">
                      {format(new Date(updatedBooking.slot_date), 'MMM dd, yyyy')} • {updatedBooking.slot_start_time.substring(0, 5)} - {updatedBooking.slot_end_time.substring(0, 5)}
                    </p>
                  </div>

                  {/* Meeting Link */}
                  {updatedBooking.meeting_link && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Meeting Link</p>
                      <a
                        href={updatedBooking.meeting_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-700 text-sm font-medium break-all"
                      >
                        {updatedBooking.meeting_link}
                      </a>
                    </div>
                  )}

                  {/* For bundle bookings */}
                  {updatedBooking.number_of_sessions && updatedBooking.number_of_sessions > 1 && updatedBooking.meeting_links && (
                    <div>
                      <p className="text-xs font-semibold text-gray-600 uppercase mb-1">Meeting Link (Session {rescheduleSessionIndex ? rescheduleSessionIndex + 1 : 1})</p>
                      <a
                        href={updatedBooking.meeting_links[rescheduleSessionIndex || 0]}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-purple-600 hover:text-purple-700 text-sm font-medium break-all"
                      >
                        {updatedBooking.meeting_links[rescheduleSessionIndex || 0]}
                      </a>
                    </div>
                  )}
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  onClick={() => {
                    setRescheduleSuccess(false);
                    goToProfile();
                  }}
                  className="w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold hover:shadow-lg transition-all"
                >
                  Back to Profile
                </motion.button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default SlotSelection;
