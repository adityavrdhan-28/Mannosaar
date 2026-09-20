import { redirect } from 'next/navigation';
import { isWhatsAppAdmin } from '@/lib/whatsapp/admin';
import AdminSectionNav from '@/components/admin/AdminSectionNav';
import WhatsAppOperations from '@/components/admin/WhatsAppOperations';
export default async function WhatsAppAdminPage() {
  if (!await isWhatsAppAdmin()) redirect('/auth/login');
  return <div className="min-h-screen bg-[#f8f7ff] px-4 py-8 text-slate-950 lg:px-10"><div className="mx-auto max-w-6xl"><AdminSectionNav className="mb-5"/><h1 className="mb-6 text-3xl font-black">WhatsApp bookings</h1><WhatsAppOperations/></div></div>;
}
