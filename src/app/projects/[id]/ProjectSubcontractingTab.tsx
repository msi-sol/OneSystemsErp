import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Users, Building2, Layers, Pickaxe, CheckCircle2, CircleDollarSign } from 'lucide-react';

export default async function ProjectSubcontractingTab({ projectId }: { projectId: string }) {
  const packages = await prisma.subcontractPackage.findMany({
    where: { projectId },
    include: {
      subcontractor: { select: { name: true } }
    },
    orderBy: { createdAt: 'desc' }
  });

  const totalPackages = packages.length;
  // "Active / Awarded" = awarded through execution, before billing/closure (see PackageStatus enum).
  const ACTIVE_PACKAGE_STATUSES = ['APPROVED', 'AGREEMENT_ISSUED', 'JOB_ORDER_ISSUED', 'ONGOING', 'FOR_INSPECTION', 'PARTIALLY_ACCOMPLISHED'];
  const activePackages = packages.filter((p: any) => ACTIVE_PACKAGE_STATUSES.includes(p.status)).length;
  const totalValue = packages.reduce((sum: number, p: any) => sum + (p.contractAmount || 0), 0);

  if (packages.length === 0) {
    return (
      <div style={{ 
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid rgba(236, 72, 153, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(236, 72, 153, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(236, 72, 153, 0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(236, 72, 153, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(236, 72, 153, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMovePink 15s linear infinite',
          opacity: 0.5,
          zIndex: 0
        }} />
        <style>{`
          @keyframes gridMovePink {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes float3dPink {
            0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(236, 72, 153, 0.1), inset 0 1px 0 rgba(255,255,255,0.2); }
            50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(236, 72, 153, 0.2), inset 0 1px 0 rgba(255,255,255,0.3); }
          }
          @keyframes pulseGlowPink {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(236, 72, 153, 0.5)); }
            50% { filter: drop-shadow(0 0 25px rgba(236, 72, 153, 0.8)); }
          }
          .tech-button-pink {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .tech-button-pink::before {
            content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s ease;
          }
          .tech-button-pink:hover::before { left: 100%; }
          .tech-button-pink:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(236, 72, 153, 0.4); }
        `}</style>
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '50px 60px',
          background: 'rgba(10, 15, 30, 0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(236, 72, 153, 0.15)',
          borderTop: '1px solid rgba(236, 72, 153, 0.4)',
          borderLeft: '1px solid rgba(236, 72, 153, 0.4)',
          textAlign: 'center',
          animation: 'float3dPink 6s ease-in-out infinite',
          transformStyle: 'preserve-3d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(236,72,153,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(236,72,153,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(236,72,153,0.5), 0 0 30px rgba(236,72,153,0.2)',
            animation: 'pulseGlowPink 3s infinite', transform: 'translateZ(40px)'
          }}>
            <Building2 size={48} color="#ec4899" strokeWidth={1.5} />
          </div>

          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ 
              margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', 
              background: 'linear-gradient(to right, #ffffff, #ec4899)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              Subcontracting Control
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No subcontract packages have been awarded or mapped to this project yet.
            </p>
          </div>

          <Link href="/subcontracting/dashboard" className="tech-button-pink" style={{
              marginTop: '10px', backgroundColor: '#ec4899', color: '#fff',
              padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex',
              alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <Layers size={20} /> View Subcontracts
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#9e9e9e';
      case 'BIDDING': return '#2196f3';
      case 'AWARDED': return '#4caf50';
      case 'ONGOING': return '#ec4899';
      case 'COMPLETED': return '#ff9800';
      case 'TERMINATED': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-pink {
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
        .card-pink:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(236, 72, 153, 0.05);
        }
        .card-pink::after {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          pointer-events: none;
        }
        .row-hover-pink {
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .row-hover-pink:hover {
          background: rgba(236, 72, 153, 0.05);
          transform: scale(1.01);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          z-index: 10;
          position: relative;
          border-radius: 8px;
        }
        .header-button-pink:hover {
          transform: scale(1.05) !important;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(236,72,153,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(236,72,153,0.2)' }}>
            <Building2 size={24} color="#ec4899" />
          </div>
          Subcontracting Control
        </h2>
        <Link 
          href="/subcontracting/dashboard" 
          className="header-button-pink"
          style={{
            background: 'linear-gradient(135deg, #ec4899, #f472b6)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(236,72,153,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          <Layers size={18} /> Manage Packages
        </Link>
      </div>

      {/* 3D Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card-pink" style={{ borderBottom: '2px solid #ec4899' }}>
          <div style={{ fontSize: '0.85rem', color: '#ec4899', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Layers size={16} /> Total Packages
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ec4899', textShadow: '0 0 10px rgba(236,72,153,0.3)' }}>
            {totalPackages}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Registered Subcontracts</div>
        </div>
        
        <div className="card-pink">
          <div style={{ fontSize: '0.85rem', color: '#4caf50', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Pickaxe size={16} /> Active / Awarded
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#4caf50' }}>
            {activePackages}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Ongoing Site Work</div>
        </div>
        
        <div className="card-pink">
          <div style={{ fontSize: '0.85rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <CircleDollarSign size={16} /> Total Contract Value
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fbbf24' }}>
            ₱ {totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Value of Subcontracted Work</div>
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
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Package No.</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Subcontractor</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Description</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Contract Amount</th>
            </tr>
          </thead>
          <tbody>
            {packages.map((p: any) => (
              <tr key={p.id} className="row-hover-pink" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px' }}>
                  <Link href={`/subcontracting/packages/${p.id}`} style={{ 
                    color: '#ec4899', 
                    textDecoration: 'none', 
                    fontWeight: 'bold',
                  }}>
                    {p.packageNumber}
                  </Link>
                </td>
                <td style={{ padding: '16px', color: '#fff', fontWeight: 'bold' }}>
                  {p.subcontractor?.name || 'Unassigned'}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.scopeOfWork}
                </td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: '900',
                    letterSpacing: '0.5px',
                    backgroundColor: `${getStatusColor(p.status)}15`,
                    color: getStatusColor(p.status),
                    border: `1px solid ${getStatusColor(p.status)}40`,
                    boxShadow: `0 0 10px ${getStatusColor(p.status)}20`
                  }}>
                    {p.status}
                  </span>
                </td>
                <td style={{ 
                  padding: '16px', 
                  textAlign: 'right', 
                  fontWeight: '900', 
                  color: '#fbbf24',
                  borderTopRightRadius: '8px', 
                  borderBottomRightRadius: '8px' 
                }}>
                  ₱ {(p.contractAmount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
