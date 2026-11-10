/** Route loading screen: immediate feedback while a server-rendered page loads. */
export default function PageLoading({ title, message }: { title: string; message: string }) {
  return (
    <div role="status" aria-live="polite" style={{ maxWidth: '1000px', margin: '0 auto', padding: '40px 20px' }}>
      <h1 style={{ margin: '0 0 8px' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span aria-hidden="true" style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--glass-border)', borderTopColor: 'var(--accent-color)', display: 'inline-block', animation: 'page-loading-spin 0.8s linear infinite' }} />
        {message}
      </p>
      <style>{'@keyframes page-loading-spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}
