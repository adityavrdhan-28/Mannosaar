import 'server-only';

import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_BUNDLE_PRICING,
  type BundlePricing,
} from '@/lib/services';

export async function getBundlePricing(): Promise<BundlePricing> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return { ...DEFAULT_BUNDLE_PRICING };
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from('pricing_config')
      .select('session_type, bundle_size, price')
      .order('session_type')
      .order('bundle_size');

    if (error) {
      console.error('Error fetching pricing:', error);
      return { ...DEFAULT_BUNDLE_PRICING };
    }

    const pricing = { ...DEFAULT_BUNDLE_PRICING };

    for (const item of data || []) {
      const key = `${item.session_type}_${item.bundle_size}` as keyof BundlePricing;
      if (key in pricing && Number(item.price) > 0) {
        pricing[key] = Number(item.price);
      }
    }

    return pricing;
  } catch (error) {
    console.error('Error loading pricing configuration:', error);
    return { ...DEFAULT_BUNDLE_PRICING };
  }
}
