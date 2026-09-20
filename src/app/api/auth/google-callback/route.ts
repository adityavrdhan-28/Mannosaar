import { equalSecret } from '@/lib/whatsapp/core';
import { protectToken } from '@/lib/google-calendar/token-protection';
import { isWhatsAppAdmin } from '@/lib/whatsapp/admin';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function GET(request: NextRequest) {
  try {
    const searchParams = new URL(request.url).searchParams;
    const code = searchParams.get('code');
    const error = searchParams.get('error');

    console.log('🔐 [Google Callback] Received request');
    console.log('📋 [Google Callback] Code:', !!code, 'Error:', error);

    if (error) {
      console.error('❌ [Google Callback] Google OAuth error:', error);
      return NextResponse.redirect(
        new URL(`/admin?error=Google%20authentication%20failed:%20${error}`, request.url)
      );
    }

    if (!code) {
      console.error('❌ [Google Callback] No authorization code');
      return NextResponse.redirect(
        new URL('/admin?error=No%20authorization%20code%20received', request.url)
      );
    }

    // Get the current session
    const session = await auth();
    console.log('📋 [Google Callback] Session user:', session?.user?.id);
    
    if (!session?.user?.id) {
      console.error('❌ [Google Callback] Not authenticated');
      return NextResponse.redirect(
        new URL('/auth/login?error=please_login_first', request.url)
      );
    }

    if (!await isWhatsAppAdmin() || !equalSecret(searchParams.get('state') || '', request.cookies.get('google_oauth_state')?.value || '')) {
      return new Response('Invalid OAuth state', { status: 403 });
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/google-callback`,
        grant_type: 'authorization_code',
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      console.error('Token exchange error:', error);
      return NextResponse.redirect(
        new URL(`/admin?error=Failed to exchange authorization code`, request.url)
      );
    }

    const tokens = await tokenResponse.json();
    if (!tokens.access_token || !tokens.refresh_token) throw new Error('GOOGLE_OFFLINE_CONSENT_REQUIRED');

    // Get user information to get their email
    const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      throw new Error('Failed to fetch user info from Google');
    }

    const userInfo = await userInfoResponse.json();

    // Calculate token expiry time
    const expiryTime = new Date();
    expiryTime.setSeconds(expiryTime.getSeconds() + tokens.expires_in);

    // Store credentials in Supabase
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { error: upsertError } = await supabase
      .from('google_oauth_credentials')
      .upsert(
        {
          user_id: session.user.id,
          access_token: protectToken(tokens.access_token),
          refresh_token: protectToken(tokens.refresh_token),
          token_expiry: expiryTime.toISOString(),
          email: userInfo.email,
        },
        {
          onConflict: 'user_id',
        }
      );

    if (upsertError) {
      console.error('Database error:', upsertError);
      return NextResponse.redirect(
        new URL('/admin?error=Failed to save Google credentials', request.url)
      );
    }

    const response = NextResponse.redirect(new URL('/admin?success=Google%20account%20connected', request.url));
    response.cookies.delete('google_oauth_state');
    return response;
  } catch (error) {
    console.error('Google OAuth callback error:', error);
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.redirect(
      new URL(`/admin?error=${encodeURIComponent(errorMsg)}`, request.url)
    );
  }
}
