'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, CalendarCheck2, HeartHandshake, MessagesSquare } from 'lucide-react';

const steps = [
  {
    icon: MessagesSquare,
    title: 'Choose your session',
    text: 'Start by choosing the kind of support that feels right for you today.',
    tone: 'from-[#5b267a] to-[#9a51c9]',
  },
  {
    icon: CalendarCheck2,
    title: 'Pick a time that works',
    text: 'Select from available slots and book a time that fits naturally into your week.',
    tone: 'from-[#71408c] to-[#bd6fc6]',
  },
  {
    icon: HeartHandshake,
    title: 'Confirm and begin',
    text: 'Receive your confirmation and arrive exactly as you are for your session.',
    tone: 'from-[#4b2b70] to-[#8a5fc0]',
  },
];

const HowItWorksSection = () => (
  <section aria-labelledby="how-it-works-heading" className="bg-[#cbb7df] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
    <div className="mx-auto max-w-[1240px]">
      <motion.div initial={{ opacity: 0, y: 18 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} className="mb-10 max-w-xl lg:mb-12">
        <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-[#5b267a]"><span className="h-px w-7 bg-[#5b267a]/65" /> A simple path forward</p>
        <h2 id="how-it-works-heading" className="mt-4 font-playfair text-3xl font-bold leading-tight tracking-[-0.035em] text-[#34213f] sm:text-4xl">How Mannosaar works</h2>
        <p className="mt-4 text-base leading-7 text-[#4c4052]">A calm, straightforward way to make space for your mental wellbeing.</p>
      </motion.div>

      <div className="grid items-center gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16">
      <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.25 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }} className="relative mx-auto w-full max-w-lg lg:order-1">
        <div className="absolute inset-x-[12%] bottom-[8%] top-[14%] rounded-[48%_52%_44%_56%/48%_42%_58%_52%] border border-white/45" />
        <Image src="/images/asset-1.png" alt="A therapist speaking with a client" width={1000} height={1000} className="relative z-10 h-auto w-full" priority={false} />
      </motion.div>

      <motion.div initial={{ opacity: 0, x: 20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }} className="lg:order-2">
        <ol className="space-y-4">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.li key={step.title} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.45, delay: index * 0.1 }} whileHover={{ y: -3 }} className="group relative overflow-hidden rounded-2xl border border-white/70 bg-white/40 p-5 shadow-[0_10px_22px_rgba(76,40,100,0.07)]">
                <div className="absolute -right-7 -top-8 h-24 w-24 rounded-full bg-white/35 transition-transform duration-500 group-hover:scale-125" />
                <div className="relative flex gap-4">
                  <div className="relative shrink-0">
                    <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${step.tone} text-white shadow-[0_10px_18px_rgba(78,38,108,0.22)]`}><Icon size={25} strokeWidth={1.8} /></span>
                    <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-[#dfcbe9] bg-white px-1 text-[10px] font-extrabold text-[#5b267a]">0{index + 1}</span>
                  </div>
                  <div className="pt-0.5">
                    <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7d4b99]">Step 0{index + 1}</p>
                    <h3 className="mt-1.5 text-lg font-bold text-[#34213f]">{step.title}</h3>
                    <p className="mt-1.5 text-sm leading-6 text-[#4c4052]">{step.text}</p>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>

        <Link href="/book-session" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#5b267a] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#481d61]">
          Book a session <ArrowRight size={16} />
        </Link>
      </motion.div>
      </div>
    </div>
  </section>
);

export default HowItWorksSection;
