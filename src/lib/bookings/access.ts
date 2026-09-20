import { check, db } from '../whatsapp/server';
export async function therapistSlotIds(userId: string): Promise<string[]> {
  const mappings = await db().from('whatsapp_therapists').select('therapist_id').eq('oauth_user_id', userId); check(mappings.error);
  const ids = [userId, ...(mappings.data || []).map(t => t.therapist_id)];
  const slots = await db().from('therapy_slots').select('id').in('therapist_id', ids); check(slots.error);
  return (slots.data || []).map(s => s.id);
}
