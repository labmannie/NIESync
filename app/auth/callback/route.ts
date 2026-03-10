import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/lost-and-found'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error) {
      // Check if user has an existing profile
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        if (!user.email?.endsWith('@nie.ac.in')) {
          await supabase.auth.signOut()
          return NextResponse.redirect(`${origin}/login?error=invalid-domain`)
        }

        const { data: profile } = await supabase.from('profiles').select('id').eq('id', user.id).single()
        
        if (!profile) {
          // New user, redirect to profile completion
          return NextResponse.redirect(`${origin}/signup/complete`)
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host') 
      const isLocalEnv = process.env.NODE_ENV === 'development'
      
      if (isLocalEnv) {
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // Auth failed
  return NextResponse.redirect(`${origin}/login?error=auth-callback-failed`)
}
