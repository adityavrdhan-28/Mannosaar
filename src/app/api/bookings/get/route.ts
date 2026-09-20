import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get('bookingId');

    console.log('API /bookings/get - BookingId:', bookingId, 'Auth email:', session?.user?.email);

    if (!bookingId) {
      return NextResponse.json({ error: 'Booking ID required' }, { status: 400 });
    }

    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    console.log('Fetching booking with ID:', bookingId);

    const { data: booking, error } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      return NextResponse.json(
        { error: 'Booking not found: ' + error.message },
        { status: 404 }
      );
    }

    if (!booking) {
      console.error('No booking returned');
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    const { data: actor } = await supabase.from('users').select('role').eq('id', session.user.id).single();
    if (booking.user_id !== session.user.id && actor?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Convert snake_case session_dates back to camelCase for frontend
    let sessionDates = undefined;
    if (booking.session_dates && Array.isArray(booking.session_dates)) {
      sessionDates = booking.session_dates.map((session: any) => ({
        date: session.date,
        slotId: session.slot_id,
        startTime: session.start_time,
        endTime: session.end_time,
      }));
    }
    
    // Ensure meeting_links is properly formatted
    const bookingResponse = {
      ...booking,
      session_dates: sessionDates,
      meeting_links: booking.meeting_links || (booking.meeting_link ? [booking.meeting_link] : undefined),
    };
    
    return NextResponse.json({ booking: bookingResponse, success: true });
  } catch (err) {
    console.error('Catch error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch booking: ' + (err instanceof Error ? err.message : 'Unknown error') },
      { status: 500 }
    );
  }
}
