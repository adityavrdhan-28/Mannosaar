import type { Metadata } from 'next';
import Link from 'next/link';
import {
  ArrowRight,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  HeartHandshake,
  IndianRupee,
  Laptop2,
  ShieldCheck,
  UserRound,
} from 'lucide-react';
import { getBundlePricing } from '@/lib/pricing';
import { BOOKABLE_SERVICES, formatInr } from '@/lib/services';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mannosaar Services & Pricing | Online Counselling',
  description:
    'Explore Mannosaar’s online counselling and wellness services, session durations and pricing, and book an appointment online.',
  alternates: {
    canonical: '/services',
  },
  openGraph: {
    title: 'Mannosaar Services & Pricing | Online Counselling',
    description:
      'Explore Mannosaar’s online counselling and wellness services, session durations and pricing, and book an appointment online.',
    url: '/services',
  },
  twitter: {
    card: 'summary',
    title: 'Mannosaar Services & Pricing | Online Counselling',
    description:
      'Explore Mannosaar’s online counselling and wellness services, session durations and pricing, and book an appointment online.',
  },
};

const serviceIcons = {
  personal: UserRound,
  couple: HeartHandshake,
};

const bookingSteps = [
  'Choose your session',
  'Select a convenient time',
  'Complete your booking',
  'Join your online session',
];

export default async function ServicesPage() {
  const pricing = await getBundlePricing();

  return (
    <div className="min-h-screen bg-[#cbb7df] text-[#34213f]">
      <section className="border-b border-white/35 px-4 pb-12 pt-16 sm:px-6 sm:pb-16 sm:pt-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-[#5b267a]">
            <span className="h-px w-8 bg-[#5b267a]/65" /> Counselling services & pricing
          </p>
          <div className="mt-5 grid gap-7 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <h1 className="font-playfair text-4xl font-bold tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Our Services
              </h1>
              <p className="mt-5 max-w-2xl text-lg leading-8 text-[#4c4052] sm:text-xl">
                Professional online counselling and wellness support, wherever you are.
              </p>
              <p className="mt-3 max-w-2xl text-base leading-7 text-[#62576b]">
                Choose the type of session that best fits your needs. You can select your preferred time and complete your booking securely online.
              </p>
            </div>
            <div className="lg:text-right">
              <Link
                href="/book-session"
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#5b267a] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#481d61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34213f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#cbb7df]"
              >
                Book a Session <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="choose-session-heading" className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#5b267a]">Services & pricing</p>
            <h2 id="choose-session-heading" className="mt-3 font-playfair text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
              Choose a Session
            </h2>
            <p className="mt-3 text-base leading-7 text-[#4c4052]">
              Both services are delivered online in a private, supportive setting.
            </p>
          </div>

          <div className="mt-9 grid gap-5 md:grid-cols-2">
            {BOOKABLE_SERVICES.map((service) => {
              const Icon = serviceIcons[service.id];
              const price = pricing[`${service.id}_1`];

              return (
                <article
                  key={service.id}
                  className="flex min-h-full flex-col rounded-3xl border border-white/80 bg-white/55 p-6 backdrop-blur-sm sm:p-8"
                >
                  <div className="flex items-start justify-between gap-4">
                    <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#5b267a]/15 bg-white/70 text-[#5b267a]">
                      <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5b267a]/15 bg-white/60 px-3 py-1.5 text-sm font-semibold text-[#5b267a]">
                      <Laptop2 size={15} aria-hidden="true" /> Online Session
                    </span>
                  </div>

                  <h3 className="mt-6 font-playfair text-2xl font-bold tracking-[-0.025em] sm:text-3xl">
                    {service.name}
                  </h3>
                  <p className="mt-3 flex-1 text-base leading-7 text-[#4c4052]">
                    {service.description}
                  </p>

                  <div className="mt-7 border-y border-[#6f4b88]/20 py-5">
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#6f4b88]">Session fee</p>
                    <p className="mt-1 font-playfair text-4xl font-bold text-[#34213f]" aria-label={`${formatInr(price)} per session`}>
                      {formatInr(price)} <span className="font-sans text-sm font-semibold text-[#62576b]">/ session</span>
                    </p>
                    <p className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-[#4c4052]">
                      <Clock3 size={16} className="text-[#5b267a]" aria-hidden="true" />
                      {service.durationMinutes} minutes · Online
                    </p>
                  </div>

                  <Link
                    href={`/book-session?service=${service.id}`}
                    aria-label={`Book ${service.name}`}
                    className="group mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#5b267a] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#481d61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34213f] focus-visible:ring-offset-2 focus-visible:ring-offset-white/60"
                  >
                    Book Session <ArrowRight size={17} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </Link>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section aria-labelledby="booking-steps-heading" className="border-y border-white/40 bg-white/20 px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-6xl">
          <h2 id="booking-steps-heading" className="font-playfair text-3xl font-bold tracking-[-0.035em] sm:text-4xl">
            How it works
          </h2>
          <ol className="mt-8 grid gap-px overflow-hidden rounded-2xl border border-white/70 bg-white/60 sm:grid-cols-2 lg:grid-cols-4">
            {bookingSteps.map((step, index) => (
              <li key={step} className="min-h-36 bg-[#cbb7df]/45 p-5 sm:p-6">
                <p className="font-playfair text-2xl font-bold text-[#5b267a]">0{index + 1}</p>
                <p className="mt-5 text-base font-bold leading-6 text-[#34213f]">{step}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto grid max-w-6xl gap-5 lg:grid-cols-2">
          <div className="rounded-3xl border border-white/75 bg-white/45 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5b267a] text-white">
                <ShieldCheck size={20} aria-hidden="true" />
              </span>
              <h2 className="font-playfair text-2xl font-bold">Booking & Payment</h2>
            </div>
            <p className="mt-5 text-base leading-7 text-[#4c4052]">
              Your session type, duration and total payable amount are shown before payment. After successful booking, you’ll receive your appointment confirmation and session details through your registered contact information.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#5b267a]">
              <IndianRupee size={16} aria-hidden="true" /> All prices are displayed in INR.
            </p>
          </div>

          <div className="rounded-3xl border border-white/75 bg-white/45 p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#5b267a] text-white">
                <CalendarCheck2 size={20} aria-hidden="true" />
              </span>
              <h2 className="font-playfair text-2xl font-bold">Need to reschedule or cancel?</h2>
            </div>
            <p className="mt-5 text-base leading-7 text-[#4c4052]">
              Please review our Cancellation & Refund Policy for information about rescheduling, cancellations and eligible refunds.
            </p>
            <Link href="/refund-policy" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#5b267a] underline decoration-[#5b267a]/35 underline-offset-4 hover:text-[#3f165b]">
              Cancellation & Refund Policy <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="mx-auto mt-8 flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 border-t border-[#6f4b88]/20 pt-7 text-sm">
          <span className="inline-flex items-center gap-2 font-semibold text-[#4c4052]">
            <CheckCircle2 size={16} className="text-[#5b267a]" aria-hidden="true" /> Policies
          </span>
          <Link href="/terms" className="font-semibold text-[#5b267a] underline decoration-[#5b267a]/30 underline-offset-4">Terms & Conditions</Link>
          <Link href="/privacy" className="font-semibold text-[#5b267a] underline decoration-[#5b267a]/30 underline-offset-4">Privacy Policy</Link>
          <Link href="/refund-policy" className="font-semibold text-[#5b267a] underline decoration-[#5b267a]/30 underline-offset-4">Cancellation & Refund Policy</Link>
        </div>
      </section>
    </div>
  );
}
