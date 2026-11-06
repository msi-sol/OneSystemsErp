'use client';

import { usePathname } from 'next/navigation';

export default function PageTitle() {
  const pathname = usePathname();

  let title = 'Overview';

  if ((pathname || '').startsWith('/boq')) {
    title = 'BOQ Workspace';
  } else if ((pathname || '').includes('/material-issuance')) {
    title = 'Material Issuance';
  } else if ((pathname || '').includes('/projects')) {
    title = 'Projects';
  } else if ((pathname || '').includes('/inventory')) {
    title = 'Inventory Management';
  } else if ((pathname || '').includes('/material-requests')) {
    title = 'Material Requests';
  } else if ((pathname || '').startsWith('/procurement/canvassing')) {
    title = 'Supplier Canvassing';
  } else if ((pathname || '').startsWith('/procurement/purchase-orders')) {
    title = 'Purchase Orders';
  } else if ((pathname || '').startsWith('/procurement')) {
    title = 'Procurement';
  } else if ((pathname || '').startsWith('/deliveries')) {
    title = 'Deliveries';
  }

  return <h2 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-primary)', fontWeight: 'normal' }}>{title}</h2>;
}
