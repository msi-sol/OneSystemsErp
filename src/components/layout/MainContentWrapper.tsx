'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

const AUTH_SCREEN_ROUTES = ['/login', '/forgot-password', '/reset-password', '/change-password'];

export default function MainContentWrapper({ 
  children, 
  permissions, 
  user,
  topbar
}: { 
  children: React.ReactNode, 
  permissions: any, 
  user: any,
  topbar?: React.ReactNode
}) {
  const pathname = usePathname();

  // Render public auth routes without any protected shell
  const isPublicAuth = AUTH_SCREEN_ROUTES.some(
    (route) => pathname === route || pathname?.startsWith(route + '?')
  );
  if (isPublicAuth) {
    return <>{children}</>;
  }

  const isExecutive = pathname?.startsWith('/executive');
  const isSecurity = pathname?.startsWith('/admin/security');
  
  // Show main sidebar everywhere except inside the executive command center (and we keep sidebar for security, but hide topbar)
  const showMainSidebar = !isExecutive;
  const showTopbar = showMainSidebar && !isSecurity;
  const sidebarWidthVar = showMainSidebar ? 'var(--sidebar-width)' : '0px';
  const removePadding = isExecutive || isSecurity;

  return (
    <>
      {showMainSidebar && <Sidebar permissions={permissions} user={user} />}
      <div style={{ marginLeft: sidebarWidthVar, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: '100vh', transition: 'margin-left 0.3s ease' }}>
        {showTopbar && topbar}
        <main style={{ padding: removePadding ? '0px' : '30px', flex: 1, minWidth: 0, backgroundColor: 'var(--bg-primary)' }}>
          {children}
        </main>
      </div>
    </>
  );
}
