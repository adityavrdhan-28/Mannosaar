'use client';

import HeroSection from '@/components/home/HeroSection';
import MentalLoadSection from '@/components/home/MentalLoadSection';
import HowItWorksSection from '@/components/home/HowItWorksSection';
import ServicesSection from '@/components/home/ServicesSection';
import FaqSection from '@/components/home/FaqSection';
import ReviewsSection from '@/components/home/ReviewsSection';

export default function Home() {
  return (
    <div className="flex w-full flex-col bg-[#cbb7df]">
      <HeroSection />
      <MentalLoadSection />
      <HowItWorksSection />
      <ServicesSection />
      <FaqSection />
      <ReviewsSection />
    </div>
  );
}
