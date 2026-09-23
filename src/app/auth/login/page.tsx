'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { signIn } from 'next-auth/react';
import Link from 'next/link';

const LoginPage = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    try {
      const requestedCallback = new URLSearchParams(window.location.search).get('callbackUrl');
      const callbackUrl = requestedCallback?.startsWith('/') && !requestedCallback.startsWith('//')
        ? requestedCallback
        : '/appointment/type';

      await signIn('google', { 
        callbackUrl,
        redirect: true 
      });
    } catch (err) {
      setError('An error occurred during sign in');
      console.error(err);
      setLoading(false);
    }
  };

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center pt-20 pb-12 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob"></div>
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 w-96 h-96 bg-pink-500 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Content */}
      <div className="max-w-md w-full mx-auto px-4 relative z-10">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="bg-white/10 backdrop-blur-lg rounded-2xl shadow-2xl p-8 border border-white/20"
        >
          {/* Header */}
          <motion.div variants={itemVariants} className="text-center mb-8">
            <div className="mb-6 flex justify-center">
              <img src="/mannosaar_logog_only.png" alt="Mannosaar Logo" className="w-24 h-24 drop-shadow-lg" />
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">Welcome to Mannosaar</h1>
            <p className="text-gray-300 text-sm">Mental Health & Wellness Platform</p>
          </motion.div>

          {/* Error Message */}
          {error && (
            <motion.div
              variants={itemVariants}
              className="mb-6 p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-200 text-sm"
            >
              {error}
            </motion.div>
          )}

          {/* Google Sign In Button */}
          <motion.button
            variants={itemVariants}
            whileHover={{ scale: 1.02 }}
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="w-full mb-6 px-4 py-4 bg-white hover:bg-gray-50 text-gray-900 rounded-lg font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-3 border border-white/30"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path
                fill="currentColor"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="currentColor"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="currentColor"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              />
              <path
                fill="currentColor"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            {loading ? 'Signing in...' : 'Sign in with Google'}
          </motion.button>

          {/* Terms Agreement */}
          <motion.div variants={itemVariants} className="text-center mb-6 text-xs text-gray-300">
            <p className="mb-2">By continuing, you agree to our</p>
            <div className="flex justify-center gap-2">
              <Link 
                href="/terms" 
                target="_blank"
                className="text-purple-300 hover:text-white font-semibold underline transition"
              >
                Terms & Conditions
              </Link>
              <span>and</span>
              <Link 
                href="/privacy" 
                target="_blank"
                className="text-purple-300 hover:text-white font-semibold underline transition"
              >
                Privacy Policy
              </Link>
              <span>and</span>
              <Link 
                href="/refund-policy" 
                target="_blank"
                className="text-purple-300 hover:text-white font-semibold underline transition"
              >
                Refund Policy
              </Link>
            </div>
          </motion.div>

          {/* Google Meet Info Box */}
          <motion.div variants={itemVariants} className="p-4 bg-blue-500/20 border border-blue-400/50 rounded-lg mb-6">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-300 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="text-blue-200 text-xs font-semibold mb-1">Google Account Required</p>
                <p className="text-blue-100 text-xs leading-relaxed">
                  We use Google Meet for all therapy sessions. Please sign in with your Google account to connect your calendar and access video consultations.
                </p>
              </div>
            </div>
          </motion.div>

          {/* Back to Home */}
          <motion.div variants={itemVariants} className="text-center">
            <Link href="/" className="text-gray-300 hover:text-white text-sm font-medium transition">
              ← Back to Home
            </Link>
          </motion.div>
        </motion.div>
      </div>

      {/* Add CSS for blob animation */}
      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
