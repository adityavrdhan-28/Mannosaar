import type { LucideIcon } from 'lucide-react';
import {
  BarChart3,
  Calendar,
  CalendarDays,
  Clock3,
  CreditCard,
  Home,
  Settings,
  Users,
} from 'lucide-react';

export interface AdminNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const adminNavItems: AdminNavItem[] = [
  { label: 'Dashboard', href: '/admin', icon: Home },
  { label: 'Appointments', href: '/admin/bookings', icon: CalendarDays },
  { label: 'Calendar', href: '/admin/calendar', icon: Calendar },
  { label: 'Clients', href: '/admin/users', icon: Users },
  { label: 'Slots', href: '/admin/slots', icon: Clock3 },
  { label: 'WhatsApp', href: '/admin/whatsapp', icon: CalendarDays },
  { label: 'Payments', href: '/admin/payments', icon: CreditCard },
  { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
  { label: 'Settings', href: '/admin/settings', icon: Settings },
];
