import styles from './page.module.css';
import UploadReferenceButton from './UploadReferenceButton';
import { getReferenceFiles } from '../actions/notebookActions';

export const dynamic = 'force-dynamic';

export default async function AINotebookPage() {
  const files = await getReferenceFiles();
  
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>AI Notebook Reference Center</h1>
          <p className={styles.subtitle}>Manage mandatory knowledge files for AI validation and workflow support.</p>
        </div>
        <UploadReferenceButton />
      </header>

      <div className={styles.mainContent}>
        {files.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: 'var(--text-secondary)' }}>
            <p>No reference files uploaded yet.</p>
            <p style={{ fontSize: '0.9rem', marginTop: '10px' }}>Upload your first BOQ, policy, or template to begin.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)' }}>
                <th style={{ padding: '15px' }}>Reference Title</th>
                <th style={{ padding: '15px' }}>Category</th>
                <th style={{ padding: '15px' }}>Target Module</th>
                <th style={{ padding: '15px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((f: any) => (
                <tr key={f.id} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '15px' }}>
                    <strong>{f.title}</strong>
                    <br />
                    <small style={{ color: 'var(--text-secondary)' }}>{f.fileName}</small>
                    {f.versions && f.versions[0] && (
                      <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px' }}>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)' }}>
                          <strong>AI Summary:</strong> {f.versions[0].aiSummary}
                        </div>
                        {f.versions[0].aiKeywords && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--accent-color)', marginTop: '5px' }}>
                            <strong>Keywords:</strong> {f.versions[0].aiKeywords}
                          </div>
                        )}
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          Status: {f.versions[0].indexedStatus}
                        </div>
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '15px' }}>{f.category}</td>
                  <td style={{ padding: '15px' }}>{f.moduleScope}</td>
                  <td style={{ padding: '15px' }}>
                    <span style={{ 
                      padding: '4px 8px', 
                      borderRadius: '4px', 
                      backgroundColor: f.mandatoryFlag ? 'rgba(255,0,0,0.2)' : 'rgba(0,255,0,0.2)',
                      color: f.mandatoryFlag ? '#ff6b6b' : '#51cf66',
                      fontSize: '0.8rem'
                    }}>
                      {f.mandatoryFlag ? 'MANDATORY' : 'OPTIONAL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
