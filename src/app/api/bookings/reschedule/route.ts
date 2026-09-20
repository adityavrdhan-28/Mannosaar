'use server';

import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createGoogleCalendarEvent, deleteGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendRescheduleNotificationWhatsApp } from '@/lib/whatsapp';
import { sendBookingPostponedEmail } from '@/lib/email';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.email || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { bookingId, newSlotId, newDate, newStartTime, newEndTime, sessionIndex } = body;

    if (!bookingId || !newSlotId || !newDate || !newStartTime || !newEndTime) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Fetch the current booking
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

    // Verify ownership
    if (booking.user_id !== session.user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Check if the new slot is already booked
    const { data: existingBookings } = await supabase
      .from('bookings')
      .select('id')
      .eq('slot_id', newSlotId)
      .eq('status', 'confirmed');

    if (existingBookings && existingBookings.length > 0) {
      return NextResponse.json(
        { error: 'This slot was just booked. Please select another.' },
        { status: 409 }
      );
    }

    // Check if user is selecting the same slot
    if (booking.slot_id === newSlotId) {
      return NextResponse.json(
        { error: 'You already have this slot. Please choose a different time.' },
        { status: 400 }
      );
    }

    // Free the old slot
    const { error: oldSlotError } = await supabase
      .from('therapy_slots')
      .update({ is_available: true })
      .eq('id', booking.slot_id);

    if (oldSlotError) {
      console.error('❌ Error freeing old slot:', oldSlotError);
    } else {
      console.log('✅ Old slot freed:', booking.slot_id);
    }

    // Mark new slot as unavailable
    const { error: newSlotError } = await supabase
      .from('therapy_slots')
      .update({ is_available: false })
      .eq('id', newSlotId);

    if (newSlotError) {
      console.error('❌ Error marking new slot:', newSlotError);
    } else {
      console.log('✅ New slot marked unavailable:', newSlotId);
    }

    // Get the new slot details to denormalize into booking
    const { data: newSlot, error: slotFetchError } = await supabase
      .from('therapy_slots')
      .select('date, start_time, end_time')
      .eq('id', newSlotId)
      .single();

    if (slotFetchError || !newSlot) {
      console.error('❌ Error fetching new slot:', slotFetchError);
      return NextResponse.json(
        { error: 'New slot not found' },
        { status: 404 }
      );
    }

    console.log('📅 New slot details retrieved:', newSlot);

    // For bundle bookings, handle session_dates update
    let updateData: any = {
      slot_id: newSlotId,
      slot_date: newSlot.date,
      slot_start_time: newSlot.start_time,
      slot_end_time: newSlot.end_time,
    };

    // If bundle booking and sessionIndex is provided, update that specific session
    if (booking.number_of_sessions && booking.number_of_sessions > 1 && sessionIndex !== undefined) {
      if (booking.session_dates && Array.isArray(booking.session_dates)) {
        const updatedSessions = [...booking.session_dates];
        if (updatedSessions[sessionIndex]) {
          updatedSessions[sessionIndex] = {
            date: newSlot.date,
            start_time: newSlot.start_time,
            end_time: newSlot.end_time,
            slotId: newSlotId,
          };
          updateData.session_dates = updatedSessions;
        }
      }
    }

    let newMeetingLink = booking.meeting_link || '';
    let newGoogleEventId = booking.google_calendar_event_id || '';

    try {
      const calendarResult = await createGoogleCalendarEvent(
        booking.therapist_id || 'default-therapist',
        booking.user_email || session.user?.email || '',
        booking.user_name || session.user?.name || 'Client',
        newSlot.date,
        newSlot.start_time,
        newSlot.end_time,
        booking.session_type
      );

      newMeetingLink = calendarResult?.meetLink || '';
      newGoogleEventId = calendarResult?.eventId || newGoogleEventId;

      if (booking.google_calendar_event_id) {
        await deleteGoogleCalendarEvent(booking.therapist_id || 'default-therapist', booking.google_calendar_event_id);
      }
    } catch (calendarError) {
      console.warn('⚠️ Calendar reschedule update failed:', calendarError);
    }

    // Update meeting_link for single bookings or meeting_links for bundle bookings
    if (booking.number_of_sessions && booking.number_of_sessions > 1 && sessionIndex !== undefined) {
      // For bundle bookings, update the meeting_links array
      const meetingLinks = Array.isArray(booking.meeting_links) ? [...booking.meeting_links] : [];
      meetingLinks[sessionIndex] = newMeetingLink;
      updateData.meeting_links = meetingLinks;
      if (meetingLinks[0]) {
        updateData.meeting_link = meetingLinks[0];
      }
    } else {
      // For single bookings, update meeting_link
      updateData.meeting_link = newMeetingLink;
    }

    if (newGoogleEventId) {
      updateData.google_calendar_event_id = newGoogleEventId;
    }

    // Update the booking
    const { data: updatedBooking, error: updateError } = await supabase
      .from('bookings')
      .update(updateData)
      .eq('id', bookingId)
      .select()
      .single();

    if (updateError) {
      console.error('❌ Error updating booking:', updateError);
      return NextResponse.json(
        { error: 'Failed to reschedule booking' },
        { status: 500 }
      );
    }

    console.log('✅ Booking rescheduled successfully:', {
      bookingId,
      oldDate: booking.slot_date,
      newDate,
      oldTime: booking.slot_start_time,
      newTime: newStartTime,
    });

    // Send WhatsApp reschedule notification if user has WhatsApp number linked
    try {
      const { data: profileData } = await supabase
        .from('profiles')
        .select('whatsapp_number')
        .eq('id', booking.user_id)
        .maybeSingle();

      if (profileData?.whatsapp_number) {
        const { data: therapistData } = await supabase
          .from('users')
          .select('name')
          .eq('id', booking.therapist_id)
          .single();

        await sendRescheduleNotificationWhatsApp({
          toPhoneNumber: profileData.whatsapp_number,
          clientName: booking.user_name || 'Client',
          therapistName: therapistData?.name || 'Therapist',
          oldDate: booking.slot_date,
          oldStartTime: booking.slot_start_time,
          oldEndTime: booking.slot_end_time,
          date: newDate,
          startTime: newStartTime,
          endTime: newEndTime,
          meetingLink: newMeetingLink,
          sessionType: booking.session_type,
        });

        console.log('✅ WhatsApp reschedule notification sent to:', profileData.whatsapp_number);
      } else {
        console.log('ℹ️ User has no WhatsApp number linked, skipping WhatsApp notification');
      }
    } catch (whatsappError) {
      console.warn('⚠️ WhatsApp sending error (non-blocking):', whatsappError);
      // Don't fail the reschedule if WhatsApp fails
    }

    // Send email reschedule notification
    try {
      console.log('📧 Sending reschedule email notification...');
      
      // Fetch therapist name for email
      const { data: therapistData } = await supabase
        .from('users')
        .select('name')
        .eq('id', booking.therapist_id)
        .single();

      const therapistName = therapistData?.name || 'Your Therapist';

      // Format times (ensure HH:mm format, trim seconds if present)
      const formatTime = (time: any): string => {
        if (!time) return 'N/A';
        const timeStr = typeof time === 'string' ? time : time.toString();
        // Keep only HH:mm
        return timeStr.substring(0, 5);
      };

      // Send email to client
      await sendBookingPostponedEmail({
        clientEmail: booking.user_email || session.user?.email || '',
        clientName: booking.user_name || session.user?.name || 'Client',
        therapistName,
        sessionType: booking.session_type,
        oldDate: booking.slot_date,
        oldStartTime: formatTime(booking.slot_start_time),
        oldEndTime: formatTime(booking.slot_end_time),
        newDate: newSlot.date,
        newStartTime: formatTime(newSlot.start_time),
        newEndTime: formatTime(newSlot.end_time),
        meetingLink: newMeetingLink || undefined,
      });

      console.log('✅ Reschedule email notification sent to:', booking.user_email || session.user?.email);
    } catch (emailError) {
      console.warn('⚠️ Email sending error (non-blocking):', emailError);
      // Don't fail the reschedule if email fails
    }

    return NextResponse.json({
      success: true,
      message: 'Session rescheduled successfully',
      booking: {
        ...updatedBooking,
        meeting_link: newMeetingLink,
      },
    });
  } catch (error) {
    console.error('❌ Reschedule error:', error);
    return NextResponse.json(
      { error: 'Failed to reschedule booking' },
      { status: 500 }
    );
  }
}
