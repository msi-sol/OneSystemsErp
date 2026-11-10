import { verifySession } from '@/lib/dal/auth';
import { prisma } from '@/lib/prisma';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { getUserPermissions } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

export default async function KnowledgeCenterPage() {
  const cookieStore = await cookies();
  const __session = await verifySession();
  const sessionId = __session?.id || '';
  const permissions = await getUserPermissions(sessionId);
  const totalRecords = await prisma.knowledgeRecord.count();
  const approvedRecords = await prisma.knowledgeRecord.count({ where: { status: 'Approved' } });
  const reviewRecords = await prisma.knowledgeRecord.count({ where: { status: 'For Review' } });

  return (
    <div>
      <header style={{ marginBottom: '30px' }}>
        <h1 style={{ margin: 0, fontSize: '2.5rem' }}>Knowledge Center</h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: '5px' }}>
          Manage Gemini Notebook links, Business Rules, SOPs, and AI Validation configuration.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '40px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', padding: '20px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: 'var(--text-secondary)' }}>Total Knowledge Records</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold' }}>{totalRecords}</p>
        </div>
        <div style={{ background: 'rgba(46, 204, 113, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(46, 204, 113, 0.3)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#2ecc71' }}>Approved Rules & SOPs</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#2ecc71' }}>{approvedRecords}</p>
        </div>
        <div style={{ background: 'rgba(241, 196, 15, 0.1)', padding: '20px', borderRadius: '12px', border: '1px solid rgba(241, 196, 15, 0.3)' }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#f1c40f' }}>Pending Review</h3>
          <p style={{ margin: 0, fontSize: '2.5rem', fontWeight: 'bold', color: '#f1c40f' }}>{reviewRecords}</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '20px' }}>
        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: '0 0 15px 0' }}>Gemini Notebooks</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Link Gemini NotebookLM workspaces to act as the knowledge base for specific ERP modules.
          </p>
          <Link href="/knowledge-center/notebooks" style={{ padding: '10px 20px', background: 'var(--accent-color)', color: '#000', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block', textAlign: 'center', lineHeight: 1.3 }}>
            Manage Notebooks
          </Link>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: '0 0 15px 0' }}>Business Rules</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Define rigid business rules that the AI Rule Checker will enforce across the ERP.
          </p>
          <Link href="/knowledge-center/business-rules" style={{ padding: '10px 20px', background: 'var(--accent-color)', color: '#000', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block', textAlign: 'center', lineHeight: 1.3 }}>
            Manage Rules
          </Link>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: '0 0 15px 0' }}>AI Assistant</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Chat with the AI Data Center to query projects, workers, and read uploaded files.
          </p>
          <Link href="/knowledge-center/chat" style={{ padding: '10px 20px', background: 'var(--accent-color)', color: '#000', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block', textAlign: 'center', lineHeight: 1.3 }}>
            Open Chat
          </Link>
        </div>

        <div style={{ background: 'rgba(0,0,0,0.3)', padding: '25px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
          <h2 style={{ margin: '0 0 15px 0' }}>User Manual</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
            View standard operating procedures, daily tasks, and best practices for all ERP roles.
          </p>
          <Link href="/knowledge-center/manual" style={{ padding: '10px 20px', background: 'var(--accent-color)', color: '#000', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block', textAlign: 'center', lineHeight: 1.3 }}>
            Read Manual
          </Link>
        </div>

        {permissions.IS_ADMIN && (
          <div style={{ background: 'rgba(231, 76, 60, 0.1)', padding: '25px', borderRadius: '12px', border: '1px solid rgba(231, 76, 60, 0.3)' }}>
            <h2 style={{ margin: '0 0 15px 0', color: '#e74c3c' }}>AI Control Panel</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
              Master settings for Bulk Autodiscovery, RAG Keyword Registry, and Embeddings.
            </p>
            <Link href="/knowledge-center/admin-center" style={{ padding: '10px 20px', background: '#e74c3c', color: '#fff', borderRadius: '6px', textDecoration: 'none', fontWeight: 'bold', display: 'inline-block', textAlign: 'center', lineHeight: 1.3 }}>
              Open Admin AI Center
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
