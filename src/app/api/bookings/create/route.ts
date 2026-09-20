import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { createGoogleCalendarEvent } from '@/lib/google-calendar';
import { sendBookingConfirmationEmail } from '@/lib/email';
import { getTherapistNotificationRecipients } from '@/lib/therapist-email';
import { sendBookingConfirmationWhatsApp } from '@/lib/whatsapp';

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.email || !session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, slotId, sessionType, sessionDates, bundle, notes } = await request.json();
    
    const isBundleBooking = sessionDates && sessionDates.length > 0;
    
    console.log('📝 Booking request received:', { 
      userId, 
      slotId, 
      sessionType,
      isBundleBooking,
      bundleSize: sessionDates?.length,
      sessionUserId: session.user?.id,
      sessionEmail: session.user?.email 
    });

    if (!userId || !sessionType) {
      console.error('❌ Missing required fields:', { userId, sessionType, slotId, isBundleBooking });
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    if (userId !== session.user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    // Validate either slotId (single) or sessionDates (bundle) is provided
    if (!isBundleBooking && !slotId) {
      console.error('❌ Missing slotId for single booking');
      return NextResponse.json(
        { error: 'Missing slotId for single booking' },
        { status: 400 }
      );
    }

    if (isBundleBooking && (!sessionDates || sessionDates.length === 0)) {
      console.error('❌ Invalid bundle booking data');
      return NextResponse.json(
        { error: 'Invalid bundle booking data' },
        { status: 400 }
      );
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let slotData: any = null;
    let userData: any = null;

    // Fetch user details
    console.log('🔵 Fetching user:', userId);
    const { data: userDataResult, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !userDataResult) {
      console.error('❌ User not found:', userError);
      return NextResponse.json(
        { error: 'User not found' },
        { status: 400 }
      );
    }
    userData = userDataResult;
    console.log('✅ User found:', userData);

    // For single bookings, fetch slot details
    if (!isBundleBooking) {
      console.log('🔵 Fetching slot:', slotId);
      const { data: slotDataResult, error: slotError } = await supabase
        .from('therapy_slots')
        .select('*')
        .eq('id', slotId)
        .single();

      if (slotError || !slotDataResult) {
        console.error('❌ Slot not found:', slotError);
        return NextResponse.json(
          { error: 'Slot not found' },
          { status: 400 }
        );
      }
      slotData = slotDataResult;
      console.log('✅ Slot found:', slotData);

      // Check if slot is already booked (prevent race condition)
      console.log('🔵 Checking if slot is still available...');
      const { data: slotCheck, error: checkError } = await supabase
        .from('therapy_slots')
        .select('is_available, id')
        .eq('id', slotId)
        .single();

      if (checkError || !slotCheck?.is_available) {
        console.error('❌ Slot no longer available:', checkError);
        return NextResponse.json(
          { error: 'Slot is no longer available. Please refresh and select another slot.' },
          { status: 409 }
        );
      }
    }

    // First create the booking in database
    console.log('🔵 Creating booking...');
    
    const { count: previousBookingCount, error: countError } = await supabase
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('status', 'confirmed');

    if (countError) {
      console.warn('⚠️ Could not calculate previous booking count:', countError);
    }
    
    let bookingPayload: any = {
      user_id: userId,
      user_name: userData.name || 'Client',
      user_email: userData.email,
      user_phone: userData.phone || userData.phone_number || '',
      session_type: sessionType,
      status: 'confirmed',
      notes: notes?.trim() || null,
      sessions_taken_before: (previousBookingCount || 0) + 1,
    };

    if (isBundleBooking) {
      // Bundle booking
      console.log('🔵 Processing bundle booking with', sessionDates.length, 'sessions');
      bookingPayload.number_of_sessions = sessionDates.length;
      bookingPayload.session_dates = sessionDates.map((session: any) => ({
        date: session.date,
        slot_id: session.slotId,
        start_time: session.startTime,
        end_time: session.endTime,
      }));
      // Use first session's date/time for slot_date fields (for backward compatibility)
      if (sessionDates[0]) {
        bookingPayload.slot_id = sessionDates[0].slotId;
        bookingPayload.slot_date = sessionDates[0].date;
        bookingPayload.slot_start_time = sessionDates[0].startTime;
        bookingPayload.slot_end_time = sessionDates[0].endTime;
      }
    } else {
      // Single booking
      bookingPayload.slot_id = slotId;
      bookingPayload.slot_date = slotData.date;
      bookingPayload.slot_start_time = slotData.start_time;
      bookingPayload.slot_end_time = slotData.end_time;
    }

    const insertBooking = async (initialPayload: Record<string, unknown>) => {
      let payload = { ...initialPayload };

      for (let attempt = 0; attempt < 8; attempt += 1) {
        const { data, error } = await supabase
          .from('bookings')
          .insert([payload])
          .select();

        if (!error) {
          return { data, error };
        }

        const missingColumnMatch =
          error.code === 'PGRST204'
            ? error.message?.match(/Could not find the '([^']+)' column/i)
            : null;
        const missingColumn = missingColumnMatch?.[1];

        if (!missingColumn || !(missingColumn in payload)) {
          return { data, error };
        }

        console.warn(`⚠️ bookings.${missingColumn} is unavailable, retrying without the field`);
        const { [missingColumn]: _ignored, ...nextPayload } = payload;
        payload = nextPayload;
      }

      const { data, error } = await supabase
        .from('bookings')
        .insert([payload])
        .select();

      return { data, error };
    };

    let { data: bookingData, error: bookingError } = await insertBooking(bookingPayload);

    if (bookingError) {
      console.error('❌ Booking creation error:', bookingError);
      return NextResponse.json({ error: bookingError.message }, { status: 400 });
    }

    const booking = bookingData?.[0];
    if (!booking) {
      return NextResponse.json({ error: 'Booking could not be created' }, { status: 400 });
    }
    console.log('✅ Booking created:', booking);

    // Mark slots as unavailable
    if (isBundleBooking) {
      // Mark each slot in the bundle as unavailable
      for (const session of sessionDates) {
        const { error: slotUpdateError } = await supabase
          .from('therapy_slots')
          .update({ is_available: false })
          .eq('id', session.slotId);

        if (slotUpdateError) {
          console.warn(`⚠️ Failed to mark slot ${session.slotId} unavailable:`, slotUpdateError);
        } else {
          console.log(`✅ Slot ${session.slotId} marked as unavailable`);
        }
      }
    } else {
      // Single booking - mark single slot
      console.log('🔵 Marking slot as unavailable...');
      const { error: slotUpdateError } = await supabase
        .from('therapy_slots')
        .update({ is_available: false })
        .eq('id', slotId);

      if (slotUpdateError) {
        console.warn('⚠️ Failed to update slot availability:', slotUpdateError);
      } else {
        console.log('✅ Slot marked as unavailable');
      }
    }

    // Create Google Calendar event(s)
    const meetingLinks: string[] = [];
    let googleCalendarEventId = booking.google_calendar_event_id || '';
    const therapistId = slotData?.therapist_id || 'default-therapist';
    
    try {
      if (isBundleBooking) {
        // Create calendar event for each session in bundle
        for (const [index, session] of sessionDates.entries()) {
          try {
            console.log(`🔵 Creating calendar event for session ${index + 1}/${sessionDates.length}...`);
            const calendarResult = await createGoogleCalendarEvent(
              therapistId,
              userData.email,
              userData.name || 'Client',
              session.date,
              session.startTime,
              session.endTime,
              sessionType
            );

            if (calendarResult?.meetLink) {
              meetingLinks.push(calendarResult.meetLink);
              googleCalendarEventId = calendarResult.eventId || googleCalendarEventId;
              console.log(`✅ Meeting link ${index + 1} generated:`, calendarResult.meetLink);
            }
          } catch (sessionError) {
            console.warn(`❌ Failed to create calendar event for session ${index + 1}:`, sessionError);
          }
        }
      } else {
        console.log('🔵 Creating Google Calendar event...');
        const calendarResult = await createGoogleCalendarEvent(
          therapistId,
          userData.email,
          userData.name || 'Client',
          slotData.date,
          slotData.start_time,
          slotData.end_time,
          sessionType
        );

        console.log('✅ Calendar result:', calendarResult);

        if (calendarResult?.meetLink) {
          meetingLinks.push(calendarResult.meetLink);
          googleCalendarEventId = calendarResult.eventId || googleCalendarEventId;
          console.log('✅ Meeting link generated:', calendarResult.meetLink);
        } else {
          console.warn('⚠️ No meeting link returned from calendar event creation');
        }
      }

      // Update booking with meeting links
      if (meetingLinks.length > 0) {
        console.log('🔵 Updating booking with meeting links...');
        const updatePayload: any = {};

        if (isBundleBooking && meetingLinks.length > 1) {
          // Store all meeting links as JSON array for bundle
          updatePayload.meeting_links = meetingLinks;
          updatePayload.meeting_link = meetingLinks[0]; // Also store first link in meeting_link for backward compatibility
        } else {
          // Single booking or bundle with only one link
          updatePayload.meeting_link = meetingLinks[0];
        }

        if (googleCalendarEventId) {
          updatePayload.google_calendar_event_id = googleCalendarEventId;
        }

        const { data: updatedBooking, error: updateError } = await supabase
          .from('bookings')
          .update(updatePayload)
          .eq('id', booking.id)
          .select()
          .single();

        if (updateError) {
          console.error('❌ Error updating meeting links:', updateError);
        } else {
          console.log('✅ Booking updated with meeting links:', updatedBooking);
          // Update the booking with the returned updated data
          Object.assign(booking, updatedBooking);
        }
      }
    } catch (calendarError) {
      console.error('❌ Error in calendar processing:', calendarError instanceof Error ? calendarError.message : calendarError);
      // Don't fail the booking if calendar fails
    }

    // Send confirmation emails to client and therapist
    try {
      // Fetch therapist details, then fall back to env-based therapist email if needed
      const therapistId = slotData?.therapist_id || 'default-therapist';
      const { data: therapistData } = await supabase
        .from('users')
        .select('email, name')
        .eq('id', therapistId)
        .single();

      const therapistEmail = getTherapistNotificationRecipients(
        therapistData?.email
      );
      const therapistName = therapistData?.name || 'Therapist';
      const emailDate = isBundleBooking ? `${sessionDates.length} sessions scheduled` : slotData.date;
      const emailStartTime = isBundleBooking ? 'Varies' : slotData.start_time;
      const emailEndTime = isBundleBooking ? 'Varies' : slotData.end_time;
      const sessionSchedule = isBundleBooking
        ? sessionDates.map((session: any) => ({
            date: session.date,
            startTime: session.startTime,
            endTime: session.endTime,
          }))
        : [
            {
              date: slotData.date,
              startTime: slotData.start_time,
              endTime: slotData.end_time,
            },
          ];

      await sendBookingConfirmationEmail({
        clientEmail: userData.email,
        clientName: userData.name || 'Client',
        therapistEmail,
        therapistName,
        sessionType,
        date: emailDate,
        startTime: emailStartTime,
        endTime: emailEndTime,
        sessionSchedule,
        meetingLink: meetingLinks[0] || '',
      });
    } catch (emailError) {
      console.warn('⚠️ Email sending error (non-blocking):', emailError);
      // Don't fail the booking if email fails
    }

    // Send WhatsApp confirmation if user has WhatsApp number linked
    try {
      // Fetch user profile to get WhatsApp number
      const { data: profileData } = await supabase
        .from('profiles')
        .select('whatsapp_number')
        .eq('id', userData.id)
        .maybeSingle();

      if (profileData?.whatsapp_number) {
        const therapistId = slotData?.therapist_id || 'default-therapist';
        const { data: therapistData } = await supabase
          .from('users')
          .select('name')
          .eq('id', therapistId)
          .single();

        const whatsappDate = isBundleBooking
          ? `${sessionDates.length} sessions scheduled`
          : slotData.date;
        const whatsappStartTime = isBundleBooking ? 'Varies' : slotData.start_time;
        const whatsappEndTime = isBundleBooking ? 'Varies' : slotData.end_time;

        await sendBookingConfirmationWhatsApp({
          toPhoneNumber: profileData.whatsapp_number,
          clientName: userData.name || 'Client',
          therapistName: therapistData?.name || 'Therapist',
          date: whatsappDate,
          startTime: whatsappStartTime,
          endTime: whatsappEndTime,
          meetingLink: meetingLinks[0] || '',
          sessionType,
        });
        
        console.log('✅ WhatsApp confirmation sent to:', profileData.whatsapp_number);
      } else {
        console.log('ℹ️ User has no WhatsApp number linked, skipping WhatsApp notification');
      }
    } catch (whatsappError) {
      console.warn('⚠️ WhatsApp sending error (non-blocking):', whatsappError);
      // Don't fail the booking if WhatsApp fails
    }

    console.log('✅ Booking API returning:', { booking });
    return NextResponse.json({ success: true, booking }, { status: 201 });
  } catch (error) {
    console.error('❌ Create booking error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create booking' },
      { status: 500 }
    );
  }
}
