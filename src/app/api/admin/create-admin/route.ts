import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

// Administrator provisioning must happen outside an HTTP request. This legacy
// endpoint previously promoted every account and must never mutate user roles.
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
