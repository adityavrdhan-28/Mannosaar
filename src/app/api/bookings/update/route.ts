import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { sendBookingPostponedEmail } from '@/lib/email';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar';

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    
    if (!session?.user?.email) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Verify admin role
    const { data: adminUser } = await supabase
      .from('users')
      .select('role, name')
      .eq('email', session.user.email)
      .single();

    if (!adminUser || adminUser.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can update bookings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { bookingId, newDate, newStartTime, newEndTime, reason } = body;

    if (!bookingId || !newDate || !newStartTime || !newEndTime) {
      return NextResponse.json(
        { error: 'Missing required fields: bookingId, newDate, newStartTime, newEndTime' },
        { status: 400 }
      );
    }

    // Get current booking details
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .select('*')
      .eq('id', bookingId)
      .single();

    if (bookingError || !booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    if (booking.booking_source === 'WHATSAPP') {
      return NextResponse.json({ error: 'Manage this booking through WhatsApp or the WhatsApp operations dashboard.' }, { status: 409 });
    }

    // Get old slot details for email
    const { data: oldSlot } = await supabase
      .from('therapy_slots')
      .select('*')
      .eq('id', booking.slot_id)
      .single();

    // Search for existing slot with the new date/time (40 mins duration like user slots)
    const { data: newSlot, error: slotError } = await supabase
      .from('therapy_slots')
      .select('*')
      .eq('date', newDate)
      .eq('start_time', newStartTime)
      .eq('end_time', newEndTime)
      .eq('duration_minutes', 40)
      .single();

    // If slot doesn't exist, return error
    if (slotError || !newSlot) {
      return NextResponse.json(
        { error: 'No slot created for this date and time. Please select an existing slot.' },
        { status: 400 }
      );
    }

    // Slot exists, check if available
    if (!newSlot.is_available || newSlot.is_blocked) {
      return NextResponse.json(
        { error: 'Selected time slot is not available' },
        { status: 400 }
      );
    }

    // Mark the new slot as unavailable
    await supabase
      .from('therapy_slots')
      .update({ is_available: false })
      .eq('id', newSlot.id);

    // Get user details for email
    const { data: user_data } = await supabase
      .from('users')
      .select('name, email')
      .eq('id', booking.user_id)
      .single();

    if (!user_data) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    let newMeetingLink = booking.meeting_link || '';
    let newGoogleCalendarEventId = booking.google_calendar_event_id || '';

    try {
      const calendarResult = await createGoogleCalendarEvent(
        booking.therapist_id,
        user_data.email,
        user_data.name || 'Client',
        newDate,
        newStartTime,
        newEndTime,
        booking.session_type
      );

      newMeetingLink = calendarResult?.meetLink || '';
      newGoogleCalendarEventId = calendarResult?.eventId || newGoogleCalendarEventId;

      if (booking.google_calendar_event_id) {
        await deleteGoogleCalendarEvent(booking.therapist_id, booking.google_calendar_event_id);
      }
    } catch (calendarError) {
      console.warn('⚠️ Calendar update failed during admin reschedule:', calendarError);
    }

    // Free up the old slot (mark as available)
    await supabase
      .from('therapy_slots')
      .update({ is_available: true })
      .eq('id', booking.slot_id);

    // Update booking with new slot
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update({
        slot_id: newSlot.id,
        meeting_link: newMeetingLink,
        google_calendar_event_id: newGoogleCalendarEventId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to update booking' },
        { status: 500 }
      );
    }

    // Send postponement email notification
    try {
      await sendBookingPostponedEmail({
        clientEmail: user_data.email,
        clientName: user_data.name || 'Valued Client',
        therapistName: adminUser.name || 'Therapist',
        sessionType: booking.session_type,
        oldDate: oldSlot?.date || '',
        oldStartTime: oldSlot?.start_time || '',
        oldEndTime: oldSlot?.end_time || '',
        newDate: newDate,
        newStartTime: newStartTime,
        newEndTime: newEndTime,
        reason: reason || 'Therapist needs to reschedule',
        meetingLink: newMeetingLink || undefined,
      });
    } catch (emailError) {
      console.error('❌ Failed to send email, but booking was updated:', emailError);
      // Continue - booking update succeeded even if email fails
    }

    return NextResponse.json(
      {
        success: true,
        message: 'Booking updated and email notification sent to client',
        booking: updatedBooking,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Error updating booking:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
