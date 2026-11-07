import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { Receipt, PlusCircle, TrendingUp, DollarSign, Wallet, FileText, ArrowUpRight } from 'lucide-react';

export default async function ProjectExpenseLedgerTab({ projectId }: { projectId: string }) {
  const expenses = await prisma.expense.findMany({
    where: { projectId },
    include: {
      loggedBy: { select: { name: true } }
    },
    orderBy: { date: 'desc' }
  });

  const totalExpenses = expenses.reduce((sum, e) => sum + e.netAmount, 0);
  const approvedExpenses = expenses.filter(e => e.status === 'APPROVED');
  const totalApproved = approvedExpenses.reduce((sum, e) => sum + e.netAmount, 0);
  const totalPending = expenses.filter(e => e.status !== 'APPROVED').reduce((sum, e) => sum + e.netAmount, 0);

  const directExpenses = approvedExpenses.filter(e => e.costType === 'DIRECT').reduce((sum, e) => sum + e.netAmount, 0);
  const indirectExpenses = approvedExpenses.filter(e => e.costType === 'INDIRECT').reduce((sum, e) => sum + e.netAmount, 0);

  if (expenses.length === 0) {
    return (
      <div style={{ 
        position: 'relative',
        minHeight: '400px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderRadius: '16px',
        border: '1px solid rgba(255, 107, 107, 0.2)',
        background: 'radial-gradient(circle at 50% 50%, rgba(255, 107, 107, 0.05) 0%, rgba(0, 0, 0, 0.4) 100%)',
        boxShadow: 'inset 0 0 50px rgba(255,107,107,0.05), 0 10px 30px rgba(0,0,0,0.5)'
      }}>
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'linear-gradient(rgba(255, 107, 107, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 107, 107, 0.05) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
          transform: 'perspective(500px) rotateX(60deg) translateY(-100px) translateZ(-200px)',
          animation: 'gridMoveRed 15s linear infinite',
          opacity: 0.5,
          zIndex: 0
        }} />
        <style>{`
          @keyframes gridMoveRed {
            0% { background-position: 0 0; }
            100% { background-position: 0 40px; }
          }
          @keyframes float3dRed {
            0%, 100% { transform: translateY(0) rotateX(10deg) rotateY(-5deg); box-shadow: 0 20px 40px rgba(255,107,107,0.1), inset 0 1px 0 rgba(255,255,255,0.2); }
            50% { transform: translateY(-15px) rotateX(15deg) rotateY(0deg); box-shadow: 0 35px 50px rgba(255,107,107,0.2), inset 0 1px 0 rgba(255,255,255,0.3); }
          }
          @keyframes pulseGlowRed {
            0%, 100% { filter: drop-shadow(0 0 10px rgba(255,107,107,0.5)); }
            50% { filter: drop-shadow(0 0 25px rgba(255,107,107,0.8)); }
          }
          .tech-button-red {
            position: relative;
            overflow: hidden;
            transition: all 0.3s ease;
          }
          .tech-button-red::before {
            content: ''; position: absolute; top: 0; left: -100%; width: 100%; height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
            transition: left 0.5s ease;
          }
          .tech-button-red:hover::before { left: 100%; }
          .tech-button-red:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 0 20px rgba(255, 107, 107, 0.4); }
        `}</style>
        
        <div style={{
          position: 'relative',
          zIndex: 1,
          padding: '50px 60px',
          background: 'rgba(10, 15, 30, 0.6)',
          backdropFilter: 'blur(16px)',
          borderRadius: '24px',
          border: '1px solid rgba(255, 107, 107, 0.15)',
          borderTop: '1px solid rgba(255, 107, 107, 0.4)',
          borderLeft: '1px solid rgba(255, 107, 107, 0.4)',
          textAlign: 'center',
          animation: 'float3dRed 6s ease-in-out infinite',
          transformStyle: 'preserve-3d',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '24px'
        }}>
          <div style={{
            width: '100px', height: '100px', borderRadius: '50%',
            background: 'linear-gradient(135deg, rgba(255,107,107,0.2), rgba(0,0,0,0.8))',
            border: '2px solid rgba(255,107,107,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: 'inset 0 0 20px rgba(255,107,107,0.5), 0 0 30px rgba(255,107,107,0.2)',
            animation: 'pulseGlowRed 3s infinite', transform: 'translateZ(40px)'
          }}>
            <Receipt size={48} color="#ff6b6b" strokeWidth={1.5} />
          </div>

          <div style={{ transform: 'translateZ(30px)' }}>
            <h2 style={{ 
              margin: '0 0 12px 0', fontSize: '2rem', fontWeight: '800', 
              background: 'linear-gradient(to right, #ffffff, #ff6b6b)', 
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              letterSpacing: '1px'
            }}>
              Expense Ledger
            </h2>
            <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', maxWidth: '400px', lineHeight: '1.6', margin: 0 }}>
              No expenses, petty cash transactions, or direct costs have been logged for this project yet.
            </p>
          </div>

          <Link href="/expenses" className="tech-button-red" style={{
              marginTop: '10px', backgroundColor: '#ff6b6b', color: '#fff',
              padding: '14px 32px', borderRadius: '12px', fontWeight: '900',
              fontSize: '1.1rem', textDecoration: 'none', display: 'inline-flex',
              alignItems: 'center', gap: '10px', textTransform: 'uppercase',
              letterSpacing: '1px', transform: 'translateZ(50px)'
            }}>
            <PlusCircle size={20} /> Log First Expense
          </Link>
        </div>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return '#9e9e9e';
      case 'SUBMITTED': case 'PENDING': return '#2196f3';
      case 'APPROVED': return '#4caf50';
      case 'REJECTED': return '#f44336';
      default: return '#9e9e9e';
    }
  };

  return (
    <div style={{ position: 'relative', zIndex: 1 }}>
      <style>{`
        .card-red {
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
        .card-red:hover {
          transform: translateY(-5px);
          box-shadow: 0 15px 30px rgba(0,0,0,0.4), inset 0 0 20px rgba(255,107,107,0.05);
        }
        .card-red::after {
          content: ''; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
          background: linear-gradient(135deg, rgba(255,255,255,0.05) 0%, transparent 100%);
          pointer-events: none;
        }
        .row-hover-red {
          transition: background 0.2s ease, transform 0.2s ease;
        }
        .row-hover-red:hover {
          background: rgba(255, 107, 107, 0.05);
          transform: scale(1.01);
          box-shadow: 0 4px 15px rgba(0,0,0,0.2);
          z-index: 10;
          position: relative;
          border-radius: 8px;
        }
        .header-button-red:hover {
          transform: scale(1.05) !important;
        }
      `}</style>

      {/* Title Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '12px', fontSize: '1.6rem', color: '#fff' }}>
          <div style={{ background: 'rgba(255,107,107,0.1)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,107,107,0.2)' }}>
            <Receipt size={24} color="#ff6b6b" />
          </div>
          Project Expense Ledger
        </h2>
        <Link 
          href="/expenses" 
          className="header-button-red"
          style={{
            background: 'linear-gradient(135deg, #ff6b6b, #ff4757)',
            color: '#fff',
            padding: '10px 24px',
            borderRadius: '8px',
            fontWeight: 'bold',
            textDecoration: 'none',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(255,107,107,0.3)',
            transition: 'transform 0.2s'
          }}
        >
          <PlusCircle size={18} /> Record Expense
        </Link>
      </div>

      {/* 3D Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '20px', marginBottom: '30px' }}>
        <div className="card-red" style={{ borderBottom: '2px solid #ff6b6b' }}>
          <div style={{ fontSize: '0.85rem', color: '#ff6b6b', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={16} /> Total Expenses
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#ff6b6b', textShadow: '0 0 10px rgba(255,107,107,0.3)' }}>
            ₱ {totalExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>{expenses.length} Records Logged</div>
        </div>
        
        <div className="card-red">
          <div style={{ fontSize: '0.85rem', color: '#4caf50', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={16} /> Total Approved
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#4caf50' }}>
            ₱ {totalApproved.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Authorized Deductions</div>
        </div>
        
        <div className="card-red">
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <FileText size={16} /> Direct Costs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff' }}>
            ₱ {directExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Site Operations</div>
        </div>
        
        <div className="card-red">
          <div style={{ fontSize: '0.85rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ArrowUpRight size={16} /> Indirect Costs
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: '900', color: '#fff' }}>
            ₱ {indirectExpenses.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)', marginTop: '12px' }}>Overhead & Admins</div>
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
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Date</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Category</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Description / Payee</th>
              <th style={{ padding: '16px', textAlign: 'left', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Logged By</th>
              <th style={{ padding: '16px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Status</th>
              <th style={{ padding: '16px', textAlign: 'right', color: 'rgba(255,255,255,0.5)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '1px', fontSize: '0.8rem' }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e: any) => (
              <tr key={e.id} className="row-hover-red" style={{ background: 'rgba(255,255,255,0.02)' }}>
                <td style={{ padding: '16px', borderTopLeftRadius: '8px', borderBottomLeftRadius: '8px', color: '#fff' }}>
                  {new Date(e.date).toLocaleDateString()}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.8)' }}>
                  <span style={{ background: 'rgba(255,255,255,0.1)', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem' }}>
                    {e.category}
                  </span>
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.9)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <div style={{ fontWeight: 'bold' }}>{e.description}</div>
                  {e.supplierName && <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.5)' }}>Payee: {e.supplierName}</div>}
                </td>
                <td style={{ padding: '16px', color: 'rgba(255,255,255,0.7)' }}>{e.loggedBy?.name || 'System'}</td>
                <td style={{ padding: '16px', textAlign: 'center' }}>
                  <span style={{
                    display: 'inline-block',
                    padding: '6px 12px',
                    borderRadius: '8px',
                    fontSize: '0.75rem',
                    fontWeight: '900',
                    letterSpacing: '0.5px',
                    backgroundColor: `${getStatusColor(e.status)}15`,
                    color: getStatusColor(e.status),
                    border: `1px solid ${getStatusColor(e.status)}40`,
                    boxShadow: `0 0 10px ${getStatusColor(e.status)}20`
                  }}>
                    {e.status}
                  </span>
                </td>
                <td style={{ 
                  padding: '16px', 
                  textAlign: 'right', 
                  fontWeight: '900', 
                  color: '#ff6b6b',
                  borderTopRightRadius: '8px', 
                  borderBottomRightRadius: '8px' 
                }}>
                  ₱ {e.netAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
