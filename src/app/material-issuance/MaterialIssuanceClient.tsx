'use client';

import { useState } from 'react';
import styles from '../projects/page.module.css';
import issuanceStyles from './issuance.module.css';
import { returnableMaterials } from '@/lib/procurement/material-returns';
import CreateIssuanceModal from './CreateIssuanceModal';
import IssuanceDetailsModal from './IssuanceDetailsModal';

import ReturnDetailsModal from './ReturnDetailsModal';
import CreateReturnModal from './CreateReturnModal';
import PermissionGuard from '@/components/PermissionGuard';

export default function MaterialIssuanceClient({ issuances, projects, users, returns = [], permissions }: { issuances: any[], projects: any[], users: any[], returns?: any[], permissions?: any }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isCreateReturnOpen, setIsCreateReturnOpen] = useState(false);
  const [selectedIssuance, setSelectedIssuance] = useState<any>(null);
  const [selectedReturn, setSelectedReturn] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('ISSUANCES');

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING': return 'rgba(255,165,0,0.2)'; // Orange
      case 'PROCESSED': return 'rgba(52,152,219,0.2)'; // Blue
      case 'APPROVED': return 'rgba(155,89,182,0.2)'; // Purple
      case 'RELEASED': return 'rgba(0,255,163,0.2)'; // Green
      case 'COMPLETED': return 'rgba(0,255,163,0.2)'; // Green
      case 'REJECTED': return 'rgba(255,50,50,0.2)'; // Red
      default: return 'rgba(255,255,255,0.1)';
    }
  };

  const getStatusTextColor = (status: string) => {
    switch (status) {
      case 'PENDING': return '#ffa500';
      case 'PROCESSED': return '#3498db';
      case 'APPROVED': return '#9b59b6';
      case 'RELEASED': return 'var(--accent-color)';
      case 'COMPLETED': return 'var(--accent-color)';
      case 'REJECTED': return '#ff6b6b';
      default: return '#fff';
    }
  };

  return (
    <>
      <div className={styles.headerActions} style={{ display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div className={issuanceStyles.tabs} style={{ background: 'rgba(0,0,0,0.2)', padding: '5px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <button 
            onClick={() => setActiveTab('ISSUANCES')}
            style={{ 
              background: activeTab === 'ISSUANCES' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'ISSUANCES' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'ISSUANCES' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            Material Issuances
          </button>
          <button 
            onClick={() => setActiveTab('RETURNS')}
            style={{ 
              background: activeTab === 'RETURNS' ? 'var(--accent-color)' : 'transparent', 
              color: activeTab === 'RETURNS' ? '#000' : 'var(--text-secondary)', 
              border: 'none', padding: '10px 24px', borderRadius: '8px', cursor: 'pointer',
              fontWeight: activeTab === 'RETURNS' ? 'bold' : 'normal',
              transition: 'all 0.2s', whiteSpace: 'nowrap'
            }}
          >
            Material Returns
          </button>
        </div>
        
        <div style={{ marginLeft: 'auto' }}>
          {activeTab === 'ISSUANCES' && (
            <PermissionGuard permissions={permissions} moduleName="MATERIAL_ISSUANCE" action="canCreate">
              <button onClick={() => setIsCreateOpen(true)} style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <span style={{ fontSize: '1.2rem' }}>+</span> New Issuance Slip
              </button>
            </PermissionGuard>
          )}
          
          {activeTab === 'RETURNS' && (
            <PermissionGuard permissions={permissions} moduleName="MATERIAL_ISSUANCE" action="canCreate">
              <button onClick={() => setIsCreateReturnOpen(true)} style={{ background: 'var(--accent-color)', color: '#000', border: 'none', padding: '12px 24px', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', boxShadow: '0 4px 12px rgba(0, 255, 163, 0.2)', transition: 'transform 0.2s' }} onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'} onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}>
                <span style={{ fontSize: '1.2rem' }}>+</span> New Return Slip
              </button>
            </PermissionGuard>
          )}
        </div>
      </div>

      <div className={styles.projectsGrid} style={{ marginTop: '30px', overflowX: 'auto', background: 'var(--bg-secondary)', borderRadius: '16px', border: '1px solid var(--glass-border)' }}>
        {activeTab === 'ISSUANCES' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '15px' }}>SLIP NO.</th>
              <th style={{ padding: '15px' }}>DATE</th>
              <th style={{ padding: '15px', width: '25%', maxWidth: '250px' }}>PROJECT</th>
              <th style={{ padding: '15px' }}>FOREMAN</th>
              <th style={{ padding: '15px', textAlign: 'center' }}>ITEMS</th>
              <th style={{ padding: '15px' }}>STATUS</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {issuances.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
                  No material issuance slips found.
                </td>
              </tr>
            ) : issuances.map(issuance => (
              <tr key={issuance.id} style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'} onClick={() => setSelectedIssuance(issuance)}>
                <td style={{ padding: '15px', fontWeight: 'bold' }}>{issuance.misNumber}</td>
                <td style={{ padding: '15px' }}>{new Date(issuance.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '15px', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={issuance.project.name}>{issuance.project.name}</td>
                <td style={{ padding: '15px' }}>{issuance.foreman?.name || 'N/A'}</td>
                <td style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold' }}>{issuance.items.length}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ 
                    padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold',
                    background: getStatusColor(issuance.status),
                    color: getStatusTextColor(issuance.status),
                    border: `1px solid ${getStatusColor(issuance.status).replace('0.2', '0.5')}`
                  }}>
                    {issuance.status}
                  </span>
                </td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedIssuance(issuance); }} 
                    style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#000'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', color: '#fff' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left', color: 'var(--text-secondary)', fontSize: '0.85rem', textTransform: 'uppercase', letterSpacing: '0.05em', background: 'rgba(0,0,0,0.2)' }}>
              <th style={{ padding: '15px' }}>MRS NO.</th>
              <th style={{ padding: '15px' }}>DATE</th>
              <th style={{ padding: '15px', width: '25%', maxWidth: '250px' }}>PROJECT</th>
              <th style={{ padding: '15px' }}>ISSUANCE REF</th>
              <th style={{ padding: '15px', textAlign: 'center' }}>ITEMS</th>
              <th style={{ padding: '15px' }}>STATUS</th>
              <th style={{ padding: '15px', textAlign: 'right' }}>ACTION</th>
            </tr>
          </thead>
          <tbody>
            {returns.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: '#aaa' }}>
                  No material return slips found.
                </td>
              </tr>
            ) : returns.map(ret => (
              <tr key={ret.id} style={{ borderBottom: '1px solid var(--glass-border)', cursor: 'pointer', transition: 'background 0.2s' }} onMouseOver={e => e.currentTarget.style.background = 'rgba(255,255,255,0.02)'} onMouseOut={e => e.currentTarget.style.background = 'transparent'} onClick={() => setSelectedReturn(ret)}>
                <td style={{ padding: '15px', fontWeight: 'bold' }}>{ret.mrsNumber}</td>
                <td style={{ padding: '15px' }}>{new Date(ret.createdAt).toLocaleDateString()}</td>
                <td style={{ padding: '15px', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={ret.project.name}>{ret.project.name}</td>
                <td style={{ padding: '15px', color: 'var(--text-secondary)' }}>{ret.issuance.misNumber}</td>
                <td style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold' }}>{ret.items.length}</td>
                <td style={{ padding: '15px' }}>
                  <span style={{ 
                    padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 'bold',
                    background: ret.status === 'COMPLETED' ? 'rgba(0,255,163,0.1)' : 'rgba(255,165,0,0.1)',
                    color: ret.status === 'COMPLETED' ? '#00ffa3' : '#ffa500',
                    border: ret.status === 'COMPLETED' ? '1px solid rgba(0,255,163,0.3)' : '1px solid rgba(255,165,0,0.3)'
                  }}>
                    {ret.status}
                  </span>
                </td>
                <td style={{ padding: '15px', textAlign: 'right' }}>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedReturn(ret); }} 
                    style={{ background: 'transparent', border: '1px solid var(--accent-color)', color: 'var(--accent-color)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
                    onMouseOver={e => { e.currentTarget.style.background = 'var(--accent-color)'; e.currentTarget.style.color = '#000'; }}
                    onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--accent-color)'; }}
                  >
                    View Details
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {isCreateOpen && (
        <CreateIssuanceModal 
          projects={projects}
          users={users}
          onClose={() => setIsCreateOpen(false)} 
        />
      )}

      {selectedIssuance && (
        <IssuanceDetailsModal 
          issuance={selectedIssuance}
          users={users}
          onClose={() => setSelectedIssuance(null)} 
        />
      )}

      {selectedReturn && (
        <ReturnDetailsModal 
          materialReturn={selectedReturn}
          users={users}
          onClose={() => setSelectedReturn(null)} 
        />
      )}
      {isCreateReturnOpen && (
        <CreateReturnModal 
          releasedIssuances={issuances.filter(i => ['RELEASED', 'COMPLETED'].includes(i.status) && returnableMaterials(i).length > 0)}
          onClose={() => setIsCreateReturnOpen(false)} 
        />
      )}
    </>
  );
}
