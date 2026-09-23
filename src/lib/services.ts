export type ServiceId = 'personal' | 'couple';

export interface BookableService {
  id: ServiceId;
  name: string;
  shortName: string;
  description: string;
  durationMinutes: number;
}

export interface BundlePricing {
  personal_1: number;
  personal_2: number;
  personal_3: number;
  couple_1: number;
  couple_2: number;
  couple_3: number;
}

export const DEFAULT_BUNDLE_PRICING: BundlePricing = {
  personal_1: 2500,
  personal_2: 4500,
  personal_3: 6000,
  couple_1: 3500,
  couple_2: 6500,
  couple_3: 9000,
};

export const BOOKABLE_SERVICES: readonly BookableService[] = [
  {
    id: 'personal',
    name: 'Personal Session',
    shortName: 'Personal',
    description:
      'One-on-one counselling in a private, supportive setting to explore emotional wellbeing, stress, relationships, work, or personal concerns.',
    durationMinutes: 40,
  },
  {
    id: 'couple',
    name: 'Couple Session',
    shortName: 'Couple',
    description:
      'A shared counselling session for couples who want support navigating communication, conflict, connection, or changes in their relationship.',
    durationMinutes: 40,
  },
] as const;

export function isServiceId(value: string | null | undefined): value is ServiceId {
  return BOOKABLE_SERVICES.some((service) => service.id === value);
}

export function getServiceById(value: string | null | undefined) {
  return BOOKABLE_SERVICES.find((service) => service.id === value);
}

export function formatInr(amount: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}
