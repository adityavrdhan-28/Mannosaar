import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

const faqs = [
  {
    question: 'What is Mannosaar?',
    answer: 'Mannosaar is a mental-health and counselling platform offering thoughtful, professional support for individuals, couples, families, and career-related concerns.',
  },
  {
    question: 'Who is Neetu Rathore?',
    answer: 'Neetu Rathore is a psychologist, family therapist, and career counsellor with over 24 years of clinical experience.',
  },
  {
    question: 'What concerns can I seek therapy for?',
    answer: 'Mannosaar supports concerns including anxiety, stress, relationships, family challenges, grief, sleep, self-doubt, addiction, workplace pressure, and many other life transitions.',
  },
  {
    question: 'How do I book a therapy session with Mannosaar?',
    answer: 'Choose the session type that feels right for you, select an available time slot, and complete your booking. You will receive confirmation after the appointment is booked.',
  },
  {
    question: 'Are online counselling sessions available?',
    answer: 'Yes. Mannosaar offers online counselling, so you can access professional support from a private space that feels comfortable to you.',
  },
  {
    question: 'Can I book therapy in Hindi or English?',
    answer: 'Yes. Sessions are available in both Hindi and English, helping you speak in the language that feels most natural to you.',
  },
  {
    question: 'What happens in the first therapy session?',
    answer: 'The first session is a chance to share what has brought you to therapy, ask questions, and begin to understand the kind of support that may be most helpful.',
  },
  {
    question: 'Is therapy confidential?',
    answer: 'Privacy is an essential part of therapy. Your concerns are handled with care and professional confidentiality, subject to applicable ethical and legal responsibilities.',
  },
  {
    question: 'Do I need to know exactly what is wrong before booking?',
    answer: 'No. You do not need to have everything figured out. Therapy can be a helpful place to explore feelings that are difficult to name or make sense of alone.',
  },
  {
    question: 'Who can benefit from counselling?',
    answer: 'Counselling can support anyone who is feeling overwhelmed, stuck, emotionally tired, or ready to make a change in their relationships, work, or personal life.',
  },
];

const faqSchema = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqs.map((faq) => ({
    '@type': 'Question',
    name: faq.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: faq.answer,
    },
  })),
};

const FaqSection = () => (
  <section aria-labelledby="faq-heading" className="bg-[#cbb7df] px-4 py-16 sm:px-6 sm:py-24 lg:px-8">
    <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }} />
    <div className="mx-auto max-w-[1120px]">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5b267a]">Frequently answered questions</p>
        <h2 id="faq-heading" className="mt-3 font-playfair text-3xl font-bold leading-tight tracking-[-0.035em] text-[#34213f] sm:text-4xl">Questions about therapy and counselling</h2>
        <p className="mt-4 text-base leading-7 text-[#4c4052]">A few clear answers before you decide whether Mannosaar feels right for you.</p>
      </div>

      <div className="mt-10 border-t border-[#6f4b88]/25">
        {faqs.map((faq) => (
          <details key={faq.question} className="group border-b border-[#6f4b88]/25 py-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-6 text-left text-base font-bold text-[#34213f] marker:content-none sm:text-lg">
              {faq.question}
              <ChevronDown size={20} className="shrink-0 text-[#5b267a] transition-transform duration-200 group-open:rotate-180" />
            </summary>
            <p className="max-w-3xl pt-3 text-sm leading-7 text-[#4c4052] sm:text-base">{faq.answer}</p>
          </details>
        ))}
      </div>

      <p className="mt-8 text-sm text-[#4c4052]">Still unsure? <Link href="/book-session" className="font-bold text-[#5b267a] underline decoration-[#5b267a]/35 underline-offset-4 hover:text-[#3f165b]">Book a session</Link> and begin with one conversation.</p>
    </div>
  </section>
);

export default FaqSection;
