import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/whatsapp/server';
import { auth } from '@/lib/auth';
import { sendBookingCancellationEmail } from '@/lib/email';

export async function POST(request: NextRequest) {
  try {
    const { bookingId } = await request.json();

    if (!bookingId) {
      return NextResponse.json(
        { error: 'Booking ID is required' },
        { status: 400 }
      );
    }

    const session = await auth();
    if (!session?.user?.id) return new Response('Unauthorized', { status: 401 });
    const supabase = db();

    // Fetch booking details with slot and user info
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .select(
        `
        id,
        user:users(id, email, name),
        slot:therapy_slots(id, date, start_time, end_time, therapist_id)
      `
      )
      .eq('id', bookingId)
      .single();

    const booking = bookingData as any;

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    const { data: actor } = await supabase.from('users').select('role').eq('id', session.user.id).single();
    if (booking.user.id !== session.user.id && actor?.role !== 'admin') return new Response('Forbidden', { status: 403 });

    // Fetch therapist details
    const { data: therapist, error: therapistError } = await supabase
      .from('users')
      .select('id, email, name')
      .eq('id', booking.slot.therapist_id)
      .single();

    if (therapistError || !therapist) {
      return NextResponse.json(
        { error: 'Therapist not found' },
        { status: 404 }
      );
    }

    const emailSent = await sendBookingCancellationEmail({
      clientEmail: booking.user.email,
      clientName: booking.user.name || 'Client',
      therapistName: therapist.name || 'Therapist',
      date: booking.slot.date,
      time: booking.slot.start_time,
    });

    if (!emailSent) {
      return NextResponse.json(
        { error: 'Cancellation email could not be sent. Check SMTP credentials and server logs.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Cancellation email sent successfully' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error sending cancellation email:', error);
    return NextResponse.json(
      { error: 'Failed to send cancellation email' },
      { status: 500 }
    );
  }
}
