'use client';

import { useLinkStatus } from 'next/link';

/** Put inside a <Link>: shows "Opening…" while the navigation is in progress so the click visibly registers. */
export default function PendingLabel({ children, pendingText = 'Opening…' }: { children: React.ReactNode; pendingText?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite">{pending ? pendingText : children}</span>;
}
