import { NextResponse } from 'next/server';
import { upsertSubscription, removeSubscription } from '@/lib/pushStore';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { subscription, symbols } = await req.json();
  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Ugyldig subscription' }, { status: 400 });
  }
  upsertSubscription(subscription, symbols || []);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { endpoint } = await req.json();
  if (endpoint) removeSubscription(endpoint);
  return NextResponse.json({ ok: true });
}
