import Link from 'next/link';
import { ArrowRight, Clock3, HeartHandshake, Laptop2, UserRound } from 'lucide-react';
import { BOOKABLE_SERVICES } from '@/lib/services';

const serviceIcons = {
  personal: UserRound,
  couple: HeartHandshake,
};

const ServicesSection = () => (
  <section aria-labelledby="home-services-heading" className="bg-[#cbb7df] px-3 py-16 sm:px-5 sm:py-24 lg:px-8">
    <div className="mx-auto max-w-[1240px]">
      <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#5b267a]">Our services</p>
          <h2 id="home-services-heading" className="mt-3 font-playfair text-3xl font-bold leading-tight tracking-[-0.035em] text-[#34213f] sm:text-4xl">
            Choose the support that feels right for you.
          </h2>
          <p className="mt-4 text-base leading-7 text-[#4c4052]">
            Private online counselling for personal concerns and relationships, with a straightforward booking process.
          </p>
        </div>
        <Link href="/services" className="inline-flex items-center gap-2 text-sm font-bold text-[#5b267a] underline decoration-[#5b267a]/35 underline-offset-4 transition hover:text-[#3f165b]">
          View services & pricing <ArrowRight size={16} aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-9 grid gap-5 md:grid-cols-2">
        {BOOKABLE_SERVICES.map((service) => {
          const Icon = serviceIcons[service.id];

          return (
            <article key={service.id} className="flex flex-col rounded-3xl border border-white/75 bg-white/50 p-6 sm:p-8">
              <div className="flex items-start justify-between gap-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#5b267a]/15 bg-white/70 text-[#5b267a]">
                  <Icon size={23} strokeWidth={1.8} aria-hidden="true" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[#5b267a]/15 bg-white/60 px-3 py-1.5 text-sm font-semibold text-[#5b267a]">
                  <Laptop2 size={15} aria-hidden="true" /> Online
                </span>
              </div>

              <h3 className="mt-6 font-playfair text-2xl font-bold text-[#34213f]">{service.name}</h3>
              <p className="mt-3 flex-1 text-base leading-7 text-[#4c4052]">{service.description}</p>
              <p className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#62576b]">
                <Clock3 size={16} className="text-[#5b267a]" aria-hidden="true" />
                {service.durationMinutes}-minute online session
              </p>
              <Link
                href={`/book-session?service=${service.id}`}
                aria-label={`Book ${service.name}`}
                className="group mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#5b267a] px-6 py-3 text-sm font-bold text-white transition hover:-translate-y-0.5 hover:bg-[#481d61] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#34213f] focus-visible:ring-offset-2 focus-visible:ring-offset-[#cbb7df]"
              >
                Book Session <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  </section>
);

export default ServicesSection;
