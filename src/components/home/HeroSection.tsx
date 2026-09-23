'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';

const riseIn = {
  hidden: { opacity: 0, y: 22 },
  visible: { opacity: 1, y: 0 },
};

const HeroSection = () => {
  return (
    <section className="relative overflow-hidden bg-[#cbb7df] px-3 py-3 sm:px-5 sm:py-5 lg:px-8 lg:py-8">
      <div className="hero-frame mx-auto w-full max-w-[1536px]">
        <div className="relative isolate overflow-hidden px-6 pb-10 pt-14 sm:px-10 sm:pb-14 sm:pt-20 lg:min-h-[680px] lg:px-16 lg:pb-16 lg:pt-24">
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="absolute inset-x-0 top-0 h-px bg-purple-700/10" />

          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-4">
            <motion.div initial="hidden" animate="visible" transition={{ staggerChildren: 0.11, delayChildren: 0.08 }} className="order-2 max-w-xl lg:order-1 lg:pb-8">
              <motion.p variants={riseIn} className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-purple-700">
                <span className="h-px w-8 bg-purple-500" /> Online mental health consultations
              </motion.p>
              <motion.h1 variants={riseIn} className="font-playfair text-4xl font-bold leading-[0.98] tracking-[-0.045em] text-[#3f2a4d] sm:text-5xl lg:text-7xl">
                Your mind deserves <span className="text-purple-700">space to heal.</span>
              </motion.h1>
              <motion.p variants={riseIn} className="mt-6 max-w-lg text-base leading-7 text-[#62576b] sm:text-lg">
                Mannosaar is a mental health consultation service where you can speak with an experienced psychologist about anxiety, relationships, work, family, or whatever feels difficult right now—all in a safe, judgement-free space.
              </motion.p>
              <motion.div variants={riseIn} className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/book-session" className="group inline-flex items-center justify-center gap-2 rounded-full bg-purple-700 px-6 py-3.5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(107,61,125,0.2)] transition hover:-translate-y-0.5 hover:bg-purple-800">
                  Book a Session <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <Link href="/services" className="inline-flex items-center justify-center rounded-full border border-white bg-white px-6 py-3.5 text-sm font-semibold text-[#34213f] transition hover:bg-white/85">
                  View Services & Pricing
                </Link>
              </motion.div>
              <motion.div variants={riseIn} className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-sm text-[#62576b]">
                <span className="inline-flex items-center gap-2"><Check size={16} className="text-purple-700" /> 24+ years of experience</span>
                <span className="inline-flex items-center gap-2"><Check size={16} className="text-purple-700" /> Private online sessions</span>
                <span className="inline-flex items-center gap-2"><Check size={16} className="text-purple-700" /> Hindi & English</span>
              </motion.div>
            </motion.div>

            <motion.div initial={{ opacity: 0, scale: 0.96, y: 28 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="relative order-1 mx-auto w-full max-w-xl lg:order-2 lg:h-[570px] lg:max-w-none">
              <div className="absolute inset-x-[9%] bottom-[2%] top-[12%] rounded-[45%_55%_38%_62%/47%_36%_64%_53%] bg-[#e5d9ef]" />
              <div className="absolute inset-x-[17%] bottom-[7%] top-[7%] rounded-[47%_53%_58%_42%/44%_55%_45%_56%] border border-purple-300/60" />
              <img src="/images/ChatGPT%20Image%20Sep%201%2C%202026%2C%2011_36_39%20AM.png" alt="Neetu Rathore, therapist at Mannosaar" className="relative z-10 mx-auto block h-[400px] w-auto max-w-full object-contain object-bottom sm:h-[470px] lg:h-[570px]" />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
