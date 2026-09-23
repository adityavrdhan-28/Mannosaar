'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { motion } from 'framer-motion';
import { Suspense } from 'react';
import Link from 'next/link';
import {
  DEFAULT_BUNDLE_PRICING,
  getServiceById,
  isServiceId,
  type BundlePricing,
} from '@/lib/services';

function AppointmentNotePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const requestedType = searchParams.get('type');
  const sessionType = isServiceId(requestedType) ? requestedType : 'personal';
  const selectedService = getServiceById(sessionType)!;

  const [isReady, setIsReady] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [pricing, setPricing] = useState<BundlePricing>({ ...DEFAULT_BUNDLE_PRICING });
  const [note, setNote] = useState('');
  const [bundleSize, setBundleSize] = useState<1 | 2 | 3>(1);

  useEffect(() => {
    const fetchPricing = async () => {
      try {
        const response = await fetch('/api/admin/pricing');
        if (response.ok) {
          const data = await response.json();
          setPricing(data.pricing);
        }
      } catch (err) {
        console.error('Error fetching pricing:', err);
      } finally {
        setLoadingPrices(false);
      }
    };

    fetchPricing();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const storedNote = window.sessionStorage.getItem('appointmentNote') || '';
    const storedBundleSize = window.sessionStorage.getItem('appointmentBundleSize');

    if (storedNote) {
      setNote(storedNote);
    }

    if (storedBundleSize === '2' || storedBundleSize === '3') {
      setBundleSize(Number(storedBundleSize) as 2 | 3);
    }
  }, []);

  useEffect(() => {
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/login');
    } else {
      setIsReady(true);
    }
  }, [session, status, router]);

  const getPriceForBundle = (type: string, bundle: number) => {
    const key = `${type}_${bundle}`;
    return pricing[key as keyof BundlePricing] || 0;
  };

  const handleContinue = () => {
    const trimmedNote = note.trim();

    if (!trimmedNote) {
      alert('Please tell your problem in brief before continuing.');
      return;
    }

    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem('appointmentNote', trimmedNote);
      window.sessionStorage.setItem('appointmentSessionType', sessionType);
      window.sessionStorage.setItem('appointmentBundleSize', String(bundleSize));
    }

    const params = new URLSearchParams({
      type: sessionType,
      bundle: String(bundleSize),
    });

    router.push(`/appointment/slots?${params.toString()}`);
  };

  const cardBase =
    'relative cursor-pointer border px-4 py-3.5 text-left transition-all sm:px-5 sm:py-4';

  if (status === 'loading' || !isReady) {
    return (
      <div className="booking-theme min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-2 border-purple-600 border-b-transparent mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-theme min-h-screen pt-24 pb-14">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-7"
        >
          <div className="text-center space-y-2 pt-2 sm:pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#5b267a]">
              Step 2 of 3 · Share what you need
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl md:text-[2.7rem]">
              Tell us a little about what is on your mind
            </h1>
            <p className="mx-auto max-w-xl text-base text-gray-600 sm:text-lg">
              A few words help us prepare for your session. Share only what feels comfortable.
            </p>
            <p className="text-sm font-semibold text-[#5b267a]">
              Selected: {selectedService.name} ·{' '}
              <Link href="/appointment/type" className="underline decoration-[#5b267a]/35 underline-offset-4 hover:text-[#3f165b]">
                Change session
              </Link>
            </p>
          </div>

          <div className="border border-white/70 bg-white/45 p-5 shadow-[0_18px_50px_rgba(60,31,79,0.09)] sm:p-7 lg:p-8">
            <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(300px,0.9fr)] lg:gap-10">
              <div>
                <div className="mb-3 flex items-end justify-between gap-4">
                  <label htmlFor="appointment-note" className="text-sm font-semibold text-gray-700">
                    Your note
                  </label>
                  <span className="text-xs text-gray-500">{note.length}/1000</span>
                </div>
                <textarea
                  id="appointment-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={7}
                  maxLength={1000}
                  placeholder="For example: I have been feeling overwhelmed at work and would like someone to talk to."
                  className="min-h-[210px] w-full resize-none border border-[#6f4b88]/25 bg-white/75 px-4 py-4 text-gray-900 placeholder:text-gray-400 focus:border-[#5b267a] focus:outline-none focus:ring-2 focus:ring-[#5b267a]/20 sm:min-h-[235px]"
                />
                <p className="mt-3 text-sm text-gray-600">
                  Keep it brief and comfortable for you. Your therapist will read this before the session.
                </p>
              </div>

              <div className="border-t border-[#6f4b88]/20 pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                <div className="mb-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#5b267a]">Your sessions</p>
                  <h2 className="mt-1 text-xl font-bold text-gray-900">Choose a bundle</h2>
                  <p className="mt-1 text-sm text-gray-600">
                    Select what feels right for your {sessionType} therapy.
                  </p>
                </div>

                <div className="space-y-2.5">
                  {[1, 2, 3].map((size) => {
                    const active = bundleSize === size;
                    return (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setBundleSize(size as 1 | 2 | 3)}
                        className={`${cardBase} w-full ${
                          active
                            ? 'border-[#5b267a] bg-[#5b267a] text-white shadow-[0_8px_20px_rgba(91,38,122,0.2)]'
                            : 'border-[#6f4b88]/20 bg-white/45 text-gray-900 hover:border-[#5b267a]/55 hover:bg-white/65'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs ${active ? 'border-white bg-white text-[#5b267a]' : 'border-[#6f4b88]/45 text-transparent'}`}>
                              ✓
                            </span>
                            <div>
                              <p className={`text-base font-bold ${active ? 'text-white' : 'text-gray-900'}`}>
                                {size} Session{size > 1 ? 's' : ''}
                              </p>
                              <p className={`mt-0.5 text-xs ${active ? 'text-white/75' : 'text-gray-600'}`}>
                                {size === 1 ? 'A focused place to begin' : 'Support over time'}
                              </p>
                            </div>
                          </div>
                          <p className={`text-lg font-bold ${active ? 'text-white' : 'text-[#5b267a]'}`}>
                            ₹{loadingPrices ? '...' : getPriceForBundle(sessionType, size)}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={handleContinue}
                  className="mt-6 w-full bg-[#5b267a] px-6 py-3.5 font-semibold text-white transition-all hover:bg-[#472061] hover:shadow-lg"
                >
                  Continue to Slots
                </button>
                <p className="mt-3 text-center text-xs text-gray-600">You will choose a convenient time in the next step.</p>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function AppointmentNoteLoadingFallback() {
  return (
    <div className="booking-theme min-h-screen pt-24 pb-12 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-2 border-purple-600 border-b-transparent mx-auto mb-4"></div>
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

export default function AppointmentNotePage() {
  return (
    <Suspense fallback={<AppointmentNoteLoadingFallback />}>
      <AppointmentNotePageContent />
    </Suspense>
  );
}
