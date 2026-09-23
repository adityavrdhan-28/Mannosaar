'use client';

import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import TherapistHeader from '@/components/booking/TherapistHeader';
import {
  BOOKABLE_SERVICES,
  DEFAULT_BUNDLE_PRICING,
  formatInr,
  type BundlePricing,
  type ServiceId,
} from '@/lib/services';

const serviceDetails = {
  personal: {
    icon: '👤',
    features: ['Individual focus', 'Private online setting'],
  },
  couple: {
    icon: '👥',
    features: ['Relationship focus', 'Shared online setting'],
  },
};

export default function AppointmentTypePage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [isReady, setIsReady] = useState(false);
  const [pricing, setPricing] = useState<BundlePricing>({ ...DEFAULT_BUNDLE_PRICING });
  const [loadingPrices, setLoadingPrices] = useState(true);

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
    if (status === 'loading') return;

    if (!session) {
      router.push('/auth/login');
    } else {
      setIsReady(true);
    }
  }, [session, status, router]);

  const handleSelectType = (type: ServiceId) => {
    router.push(`/appointment/note?type=${type}`);
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
        delayChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5 },
    },
  };

  if (status === 'loading' || !isReady) {
    return (
      <div className="booking-theme min-h-screen pt-24 pb-12 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booking-theme min-h-screen pt-24 pb-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <TherapistHeader languages={['Hindi', 'English']} />

        <AnimatePresence mode="wait">
          <motion.div
            key="type-selection"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="text-center mb-12"
            >
              <h1 className="text-4xl font-bold text-gray-900 mb-4">Select Session Type</h1>
              <p className="text-xl text-gray-600">
                Choose the therapy session that fits your needs
              </p>
            </motion.div>

            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
              className="grid md:grid-cols-2 gap-8 mb-12"
            >
              {BOOKABLE_SERVICES.map((service) => {
                const details = serviceDetails[service.id];
                const price = pricing[`${service.id}_1`];

                return (
                  <motion.div
                    key={service.id}
                    variants={itemVariants}
                    whileHover={{ scale: 1.02, y: -5 }}
                    className="bg-white rounded-2xl shadow-lg p-8 border-2 border-transparent hover:border-purple-300 transition-all"
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="text-5xl" aria-hidden="true">{details.icon}</div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500 mb-1">Per session</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {loadingPrices ? '...' : formatInr(price)}
                        </p>
                      </div>
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">{service.name}</h2>
                    <p className="text-gray-600 mb-6">{service.description}</p>
                    <ul className="space-y-3 text-gray-700 mb-8">
                      {[...details.features, `${service.durationMinutes} minutes`].map((feature) => (
                        <li key={feature} className="flex items-center">
                          <span className="mr-3" aria-hidden="true">✓</span>
                          <span>{feature}</span>
                        </li>
                      ))}
                    </ul>
                    <motion.button
                      type="button"
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleSelectType(service.id)}
                      aria-label={`Continue with ${service.name}`}
                      className="w-full px-6 py-3 bg-gradient-to-r from-purple-400 to-purple-500 text-white rounded-xl font-semibold hover:shadow-lg transition-all"
                    >
                      Continue
                    </motion.button>
                  </motion.div>
                );
              })}
            </motion.div>

            <div className="text-center">
              <Link href="/" className="text-purple-600 hover:text-purple-700 font-semibold">
                ← Back to Home
              </Link>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
