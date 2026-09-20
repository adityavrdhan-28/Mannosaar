import { auth } from '../auth';
import { check, db } from './server';
export async function isWhatsAppAdmin() {
  const session = await auth();
  if (!session?.user?.id) return false;
  const result = await db().from('users').select('role').eq('id', session.user.id).single(); check(result.error);
  return result.data?.role === 'admin';
}
