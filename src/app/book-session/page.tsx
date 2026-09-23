import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { isServiceId } from '@/lib/services';

export default async function BookSessionPage({
  searchParams,
}: {
  searchParams: Promise<{ service?: string }>;
}) {
  const { service } = await searchParams;
  const selectedService = isServiceId(service) ? service : null;
  const session = await auth();

  if (!session) {
    const callbackUrl = selectedService
      ? `/book-session?service=${selectedService}`
      : '/book-session';
    redirect(`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  redirect(
    selectedService
      ? `/appointment/note?type=${selectedService}`
      : '/appointment/type'
  );
}
