'use client';

import { usePathname } from 'next/navigation';

export default function PageTitle() {
  const pathname = usePathname();

  let title = 'Overview';

  if ((pathname || '').startsWith('/boq')) {
    title = 'BOQ Workspace';
  } else if ((pathname || '').includes('/material-issuance')) {
    title = 'Manage and track materials issued from inventory against the Consolidated BOQ.';
  } else if ((pathname || '').includes('/projects')) {
    title = 'Projects';
  } else if ((pathname || '').includes('/inventory')) {
    title = 'Inventory Management';
  } else if ((pathname || '').includes('/material-requests')) {
    title = 'Material Requests';
  }

  return <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 'normal' }}>{title}</h2>;
}
