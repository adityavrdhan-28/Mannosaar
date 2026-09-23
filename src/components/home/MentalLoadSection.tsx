'use client';

import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown } from 'lucide-react';
import { useState } from 'react';

const affirmations = [
  { label: 'Work Pressure', quote: 'I can take things one step at a time.' },
  { label: 'Relationships', quote: 'I deserve relationships that feel safe and honest.' },
  { label: 'Family', quote: 'I can care deeply without carrying everything.' },
  { label: 'Studies', quote: 'My progress matters more than perfection.' },
  { label: 'Overthinking', quote: 'I don’t have to believe every thought I have.' },
  { label: 'Loneliness', quote: 'I am worthy of connection, even on quiet days.' },
  { label: 'Sleep', quote: 'Rest is productive too. I’m allowed to slow down.' },
  { label: 'Self-Doubt', quote: 'I am more capable than this moment makes me feel.' },
  { label: 'Money', quote: 'I can face this one decision at a time.' },
  { label: 'Something Else', quote: 'Whatever I’m feeling right now is allowed to be here.' },
];

const MentalLoadSection = () => {
  const [selectedLabel, setSelectedLabel] = useState('');
  const selected = affirmations.find((item) => item.label === selectedLabel);

  return (
    <section aria-labelledby="carrying-heading" className="bg-[#cbb7df] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#5b267a]">A small pause</p>
        <h2 id="carrying-heading" className="mt-3 font-playfair text-3xl font-bold tracking-[-0.035em] text-[#34213f] sm:text-4xl">What am I carrying today?</h2>
        <p className="mt-4 text-base leading-7 text-[#4c4052]">Choose the thought that feels closest. There&apos;s no need to explain it perfectly.</p>

        <div className="relative mx-auto mt-9 max-w-md border-b border-dashed border-[#5b267a]/55">
          <select value={selectedLabel} onChange={(event) => setSelectedLabel(event.target.value)} aria-label="Choose what you are carrying today" className="w-full cursor-pointer appearance-none bg-transparent px-1 py-4 pr-10 text-left text-base font-semibold text-[#34213f] outline-none">
            <option value="">Choose what feels closest...</option>
            {affirmations.map((item) => <option key={item.label} value={item.label}>{item.label}</option>)}
          </select>
          <ChevronDown aria-hidden="true" size={19} className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2 text-[#5b267a]" />
        </div>

        <AnimatePresence mode="wait">
          {selected && <motion.div key={selected.label} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.35 }} className="mt-10">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5b267a]">A thought to hold onto</p>
            <blockquote className="mx-auto mt-4 max-w-xl font-playfair text-2xl font-bold leading-snug text-[#34213f] sm:text-3xl">“{selected.quote}”</blockquote>
            <p className="mx-auto mt-5 max-w-lg text-sm leading-7 text-[#4c4052]">You do not have to carry this alone. A professional conversation can help you find steadier ground.</p>
            <Link href="/book-session" className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#5b267a] px-5 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#481d61]">
              Book a session <ArrowRight size={16} />
            </Link>
          </motion.div>}
        </AnimatePresence>
      </div>
    </section>
  );
};

export default MentalLoadSection;
