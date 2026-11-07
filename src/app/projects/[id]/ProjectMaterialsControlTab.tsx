import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { PackageOpen, ArrowRightCircle, ArrowLeftCircle, HardHat, PackageSearch, AlertTriangle, PlayCircle } from 'lucide-react';

export default async function ProjectMaterialsControlTab({ projectId }: { projectId: string }) {
  const issuances = await prisma.materialIssuance.findMany({
    where: { projectId },
    include: {
      foreman: { select: { name: true } },
      items: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalIssuances = issuances.length;
  const pendingIssuances = issuances.filter(i => i.status === 'PENDING').length;
  const releasedIssuances = issuances.filter(i => i.status === 'RELEASED').length;
  const totalItemsIssued = issuances.reduce((sum, i) => sum + (i.status === 'RELEASED' ? i.items.length : 0), 0);

  if (issuances.length === 0) {
    return (
      <div style={{ 
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid rgba(255, 152, 0, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(255, 152, 0, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(255,152,0,0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255, 152, 0, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 152, 0, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMoveOrange 15s linear infinite',
          opacity: 0.5,
          zIndex: 0
        }} />
        <style>{`
          @keyframes gridMoveOrange {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes float3dOrange {
            0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(255,152,0,0.1), inset 0 1px 0 rgba(255,255,255,0.2); }
            50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(255,152,0,0.2), inset 0 1px 0 rgba(255,255,255,0.3); }
          }
          @keyframes pulseGlowOrange {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(255,152,0,0.5)); }
            50% { filter: drop-shadow(0 0 25px rgba(255,152,0,0.8)); }
          }
          .tech-button-orange {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .tech-button-orange::before {
            content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s ease;
          }
          .tech-button-orange:hover::before { left: 100%; }
          .tech-button-orange:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(255, 152, 0, 0.4); }
        `}</style>
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '50px 60px',
          background: 'rgba(10, 15, 30, 0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 152, 0, 0.15)',
          borderTop: '1px solid rgba(255, 152, 0, 0.4)',
          borderLeft: '1px solid rgba(255, 152, 0, 0.4)',
          textAlign: 'center',
          animation: 'float3dOrange 6s ease-in-out infinite',
          transformStyle: 'preserve-3d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,152,0,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(255,152,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(255,152,0,0.5), 0 0 30px rgba(255,152,0,0.2)',
            animation: 'pulseGlowOrange 3s infinite', transform: 'translateZ(40px)'
          }}>
            <PackageOpen size={48} color="#ff9800" strokeWidth={1.5} />
          </div>

          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ 
              margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', 
              background: 'linear-gradient(to right, #ffffff, #ff9800)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              Materials Control
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No material issuances or returns have been recorded for this project site yet.
            </p>
          </div>

          <Link href="/material-issuance" className="tech-button-orange" style={{
              marginTop: '10px', backgroundColor: '#ff9800', color: '#000',
              padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex',
              alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <PlayCircle size={20} /> Request Materials
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#9e9e9e';
      case 'PENDING': return '#2196f3';
      case 'RELEASED': return '#4caf50';
      case 'PARTIAL': return '#ff9800';
      case 'REJECTED': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-orange {
          background: rgba(10, 15, 30, 0.7);
          backdrop-filter: blur(12px);
          border: 1px solid rgba(255,255,255,0.05);
          border-top: 1px solid rgba(255,255,255,0.15);
          border-left: 1px solid rgba(255,255,255,0.1);
          border-radius: 16px;
          padding: 24px;
          transition: transform 0.3s ease, box-shadow 0.3s ease;
          position: relative;
          overflow: hidden;
        }
        .card-orange:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(255, 152, 0, 0.05);
        }
        .card-orange::after {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          pointer-events: none;
        }
        .row-hover-orange {
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .row-hover-orange:hover {
          background: rgba(255, 152, 0, 0.05);
          transform: scale(1.01);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          z-index: 10;
          position: relative;
          border-radius: 8px;
        }
        .header-button-orange:hover {
          transform: scale(1.05) !important;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(255,152,0,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,152,0,0.2)' }}>
            <PackageSearch size={24} color="#ff9800" />
          </div>
          Materials Control
        </h2>
        <Link 
          href="/material-issuance" 
          className="header-button-orange"
          style={{
            background: 'linear-gradient(135deg, #ff9800, #ffb74d)',
            color: '#000',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(255,152,0,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          <ArrowRightCircle size={18} /> Material Issuance (MIS)
        </Link>
      </div>

      {/* 3D Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card-orange" style={{ borderBottom: '2px solid #ff9800' }}>
          <div style={{ fontSize: '0.85rem', color: '#ff9800', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <PackageOpen size={16} /> Total Issuances
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ff9800', textShadow: '0 0 10px rgba(255,152,0,0.3)' }}>
            {totalIssuances}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Total Request Slips</div>
        </div>
        
        <div className="card-orange">
          <div style={{ fontSize: '0.85rem', color: '#4caf50', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowRightCircle size={16} /> Released to Site
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#4caf50' }}>
            {releasedIssuances}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Fully Released Slips</div>
        </div>
        
        <div className="card-orange">
          <div style={{ fontSize: '0.85rem', color: '#2196f3', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} /> Pending Requests
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#2196f3' }}>
            {pendingIssuances}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Awaiting Warehouse</div>
        </div>
        
        <div className="card-orange">
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <HardHat size={16} /> Line Items Issued
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff' }}>
            {totalItemsIssued.toLocaleString()}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Unique Items Dispatched</div>
        </div>
      </div>

      {/* 3D List View */}
      <div style={{ 
        background: 'rgba(10, 15, 30, 0.8)', 
        backdropFilter: 'blur(20px)',
        borderRadius: '16px', 
        border: '1px solid rgba(255,255,255,0.1)', 
        padding: '8px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: '0 4px', fontSize: '0.95rem' }}>
          <thead>
            <tr>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>MIS Number</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Foreman / Requestor</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Activity Reference</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Line Items</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Date Logged</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {issuances.map((i: any) => (
              <tr key={i.id} className="row-hover-orange" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>
                  <Link href="/material-issuance" style={{ 
                    color: '#ff9800', 
                    textDecoration: 'none', 
                    fontWeight: 'bold',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {i.misNumber}
                  </Link>
                </td>
                <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                  {i.foreman?.name || 'Unknown Foreman'}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)' }}>
                  {i.activity}
                </td>
                <td style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.9)' }}>
                  {i.items?.length || 0}
                </td>
                <td style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem' }}>
                  {new Date(i.createdAt).toLocaleDateString()}
                </td>
                <td style={{ 
                  padding: '16px', 
                  textAlign: 'center',
                  borderTopRightRadius: '8px', 
                  borderBottomRightRadius: '8px' 
                }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: '900',
                    letterSpacing: '0.5px',
                    backgroundColor: `${getStatusColor(i.status)}15`,
                    color: getStatusColor(i.status),
                    border: `1px solid ${getStatusColor(i.status)}40`,
                    boxShadow: `0 0 10px ${getStatusColor(i.status)}20`
                  }}>
                    {i.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
