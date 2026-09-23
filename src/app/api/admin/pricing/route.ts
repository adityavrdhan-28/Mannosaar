import { NextResponse } from 'next/server';
import { getBundlePricing } from '@/lib/pricing';

export async function GET() {
  try {
    const pricing = await getBundlePricing();

    return NextResponse.json({
      success: true,
      pricing,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Error in pricing endpoint:', err);
    return NextResponse.json({
      success: false,
      error: 'Unable to load pricing',
    }, { status: 500 });
  }
}
