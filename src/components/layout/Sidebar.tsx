'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, type ReactNode } from 'react';
import { logout } from '@/app/actions/auth';
import { FileSpreadsheet } from 'lucide-react';

export default function Sidebar({ permissions = {}, user }: { permissions?: Record<string, any>, user?: { name?: string | null, email?: string | null } | null }) {
  const pathname = usePathname();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth <= 768);
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isMobile) {
      document.documentElement.style.setProperty('--sidebar-width', '0px');
    } else {
      document.documentElement.style.setProperty('--sidebar-width', isCollapsed ? '80px' : '280px');
      setMobileOpen(false);
    }
  }, [isCollapsed, isMobile]);

  interface SidebarLink {
    name: string;
    href: string;
    icon: ReactNode;
    moduleKey?: string;
    subItems?: { name: string; href: string }[];
  }

  const links: SidebarLink[] = [
    { name: 'Dashboard', href: '/', icon: '⌂', moduleKey: 'DASHBOARD' },
    { name: 'Executive', href: '/executive/home', icon: '👑', moduleKey: 'PROJECT_MANAGEMENT' },
    { name: 'BOQ Workspace', href: '/boq', icon: <FileSpreadsheet size={20} strokeWidth={1.7} />, moduleKey: 'PROJECT_MANAGEMENT' },
    { name: 'Projects', href: '/projects', icon: '🏗️', moduleKey: 'PROJECT_MANAGEMENT' },
    { name: 'Procurement', href: '/procurement', icon: '🛒', moduleKey: 'PROCUREMENT' },
    { name: 'Inventory', href: '/inventory', icon: '📦', moduleKey: 'INVENTORY' },
    { name: 'Material Issuance', href: '/material-issuance', icon: '📤', moduleKey: 'MATERIAL_ISSUANCE' },
    { name: 'Finance', href: '/finance', icon: '💰', moduleKey: 'FINANCE' },
    { name: 'Subcontracting', href: '/subcontracting', icon: '👷', moduleKey: 'SUBCONTRACTING' },
    { name: 'Accomplishments', href: '/accomplishments', icon: '📈', moduleKey: 'ACCOMPLISHMENTS' },
    { name: 'Project Scheduling', href: '/scheduling', icon: '📅', moduleKey: 'PROJECT_MANAGEMENT' },
    { name: 'Payroll', href: '/payroll', icon: '👥', moduleKey: 'PAYROLL' },
    { name: 'Equipment', href: '/equipment', icon: '🚜', moduleKey: 'EQUIPMENT' },
    { name: 'Variation Orders', href: '/variation-orders', icon: '🔄', moduleKey: 'VARIATION_ORDERS' },
    { name: 'Reports', href: '/reports', icon: '📊', moduleKey: 'REPORTS' },
    { name: 'Documents', href: '/documents', icon: '📂', moduleKey: 'DOCUMENTS' },
    { name: 'Knowledge Center', href: '/knowledge-center', icon: '🧠', moduleKey: 'KNOWLEDGE_CENTER' },
    { name: 'Users', href: '/users', icon: '👤', moduleKey: 'SYSTEM_ROLES' },
    { name: 'Security (SOC)', href: '/admin/security', icon: '🛡️', moduleKey: 'SYSTEM_SETTINGS' },
    { name: 'Settings', href: '/settings', icon: '⚙️', moduleKey: 'SYSTEM_SETTINGS' },
  ];

  const visibleLinks = links.filter(link => {
    if (link.moduleKey === 'DASHBOARD') return true;
    if (permissions?.IS_ADMIN) return true;
    if (!link.moduleKey) return true;
    return permissions[link.moduleKey]?.canView;
  });

  return (
    <>
      {isMobile && (
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          style={{
            position: 'fixed',
            top: '12px',
            left: '15px',
            zIndex: 101,
            backgroundColor: 'var(--accent-color)',
            border: 'none',
            color: '#000',
            padding: '8px 14px',
            borderRadius: '6px',
            cursor: 'pointer',
            boxShadow: '0 0 12px var(--accent-glow)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            justifyContent: 'center',
            fontSize: '1.2rem',
            fontWeight: 'bold',
            transition: 'all 0.2s ease'
          }}
        >
          ☰ <span style={{ fontSize: '0.9rem', textTransform: 'uppercase' }}>Menu</span>
        </button>
      )}

      {isMobile && mobileOpen && (
        <div 
          onClick={() => setMobileOpen(false)}
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 99, backdropFilter: 'blur(2px)'
          }}
        />
      )}

      <aside style={{
        width: isMobile ? '280px' : (isCollapsed ? '80px' : 'var(--sidebar-width)'),
        backgroundColor: 'var(--bg-secondary)',
        borderRight: '1px solid var(--glass-border)',
        position: 'fixed',
        left: 0,
        top: 0,
        bottom: 0,
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        transform: isMobile && !mobileOpen ? 'translateX(-100%)' : 'translateX(0)',
        zIndex: 100,
        boxShadow: '5px 0 20px rgba(0,0,0,0.5)'
      }}>
      <div style={{ 
        padding: '20px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: isCollapsed ? 'center' : 'space-between',
        borderBottom: '1px solid var(--glass-border)'
      }}>
        {!isCollapsed && (
          <Link href="/" style={{ textDecoration: 'none' }}>
            <h2 style={{ margin: 0, color: 'var(--accent-color)', fontSize: '1.25rem', letterSpacing: '1px', textShadow: '0 0 10px var(--accent-color)', cursor: 'pointer' }}>
              OneSystemsErp
            </h2>
          </Link>
        )}
        <button 
          onClick={() => setIsCollapsed(!isCollapsed)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            padding: '5px',
            borderRadius: '4px',
            transition: 'color 0.2s, background-color 0.2s'
          }}
          className="collapse-btn"
        >
          {isCollapsed ? '»' : '«'}
        </button>
      </div>

      <nav style={{ flex: 1, padding: '10px', display: 'flex', flexDirection: 'column', gap: '4px', overflowY: 'auto', overflowX: 'hidden' }}>
        {visibleLinks.map((link) => {
          const isActive = pathname === link.href || (link.href !== '/' && (pathname || '').startsWith(link.href) && (!link.subItems || link.subItems.every(sub => !(pathname || '').startsWith(sub.href))));
          const hasActiveSub = link.subItems?.some(sub => (pathname || '').startsWith(sub.href));

          return (
            <div key={link.name}>
              <Link 
                href={link.href} 
                style={{ 
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '8px 12px', 
                  borderRadius: '6px', 
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)', 
                  color: (isActive || hasActiveSub) ? '#fff' : 'var(--text-secondary)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  fontWeight: (isActive || hasActiveSub) ? '600' : '400',
                  backgroundColor: isActive ? 'rgba(0, 240, 255, 0.15)' : 'transparent',
                  borderLeft: (isActive || hasActiveSub) ? '3px solid var(--accent-color)' : '3px solid transparent',
                  textShadow: isActive ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
                  justifyContent: isCollapsed ? 'center' : 'flex-start'
                }} 
                className={`sidebar-link ${isActive ? 'active' : ''}`}
                title={isCollapsed ? link.name : ''}
              >
                <span style={{ fontSize: '1.1rem' }}>{link.icon}</span>
                {!isCollapsed && <span>{link.name}</span>}
              </Link>
              
              {!isCollapsed && link.subItems && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px', paddingLeft: '45px' }}>
                  {link.subItems.map(sub => {
                    const isSubActive = (pathname || '').startsWith(sub.href);
                    return (
                      <Link 
                        key={sub.name}
                        href={sub.href}
                        style={{
                          padding: '8px 10px',
                          borderRadius: '6px',
                          color: isSubActive ? 'var(--accent-color)' : 'var(--text-secondary)',
                          textDecoration: 'none',
                          fontSize: '0.9rem',
                          backgroundColor: isSubActive ? 'rgba(0, 240, 255, 0.05)' : 'transparent',
                          transition: 'color 0.2s, background-color 0.2s'
                        }}
                        className="sub-link"
                      >
                        {sub.name}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div style={{
        padding: '15px',
        borderTop: '1px solid var(--glass-border)',
        display: 'flex',
        flexDirection: 'column',
        gap: '15px',
        backgroundColor: 'rgba(0, 0, 0, 0.2)',
        width: '100%',
        boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden', width: '100%', justifyContent: isCollapsed ? 'center' : 'flex-start' }}>
          <div style={{
            width: '35px',
            height: '35px',
            borderRadius: '50%',
            backgroundColor: 'var(--accent-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#000',
            fontWeight: 'bold',
            flexShrink: 0
          }}>
            {user ? (user.name ? user.name.substring(0, 2).toUpperCase() : user.email?.substring(0, 2).toUpperCase() || 'U') : 'U'}
          </div>
          {!isCollapsed && (
            <div style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <span style={{ color: 'var(--text-primary)', fontSize: '0.9rem', fontWeight: 'bold', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {user?.name || user?.email?.split('@')[0] || 'User'}
              </span>
              <span style={{ color: 'var(--accent-color)', fontSize: '0.75rem', letterSpacing: '1px' }}>ONLINE</span>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
          <form action={logout} style={{ width: '100%' }}>
          <button 
            type="submit"
            className="collapse-btn allow-guest"
            style={{
              width: '100%',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '8px',
              borderRadius: '6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s',
              fontWeight: 'bold',
              gap: '6px'
            }}
            title="Sign Out"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'; }}
          >
            🚪 {!isCollapsed && <span style={{ fontSize: '0.8rem' }}>Log Out</span>}
          </button>
        </form>
        <Link href="/profile" style={{ textDecoration: 'none' }}>
            <button
              className="collapse-btn"
              style={{
                width: '100%',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: 'var(--text-primary)',
                cursor: 'pointer',
                fontSize: '1rem',
                padding: '8px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s',
                fontWeight: 'bold',
                gap: '6px'
              }}
              title="My Profile"
            >
              ⚙️ {!isCollapsed && <span style={{ fontSize: '0.8rem' }}>My Profile</span>}
            </button>
          </Link>
        </div>
      </div>

      <style>{`
        .sidebar-link:hover:not(.active) {
          background-color: rgba(255, 255, 255, 0.05);
          color: var(--text-primary) !important;
          transform: translateX(4px);
        }
        .sub-link:hover {
          color: var(--text-primary) !important;
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
        .collapse-btn:hover {
          background-color: rgba(255, 255, 255, 0.1);
          color: var(--text-primary) !important;
        }
      `}</style>
    </aside>
    </>
  );
}
