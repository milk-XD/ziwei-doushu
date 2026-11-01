'use client';
import { useState } from 'react';

/**
 * Access code entry page (added 2026-11-01 for Muse). The gate
 * middleware redirects here when SITE_ACCESS_CODE is configured and the
 * visitor has no valid gate cookie yet.
 */
export default function AccessPage() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        setError('口令不正确，请重新输入。');
        setBusy(false);
        return;
      }
      const next = new URLSearchParams(window.location.search).get('next') || '/chart';
      window.location.href = next;
    } catch {
      setError('网络异常，请稍后重试。');
      setBusy(false);
    }
  };

  return (
    <main
      style={{
        minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '48px 20px',
      }}
    >
      <form
        onSubmit={submit}
        style={{
          width: '100%', maxWidth: 360, textAlign: 'center',
          border: '1px solid var(--t-border, #2a2a35)', borderRadius: 16,
          padding: '36px 28px', background: 'var(--t-card, rgba(255,255,255,0.02))',
        }}
      >
        <div style={{ fontSize: 22, letterSpacing: 6, marginBottom: 6, color: 'var(--t-gold, #d4a843)' }}>✦</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>紫微斗数命盘</h1>
        <p style={{ color: '#888', fontSize: 13, marginBottom: 24 }}>本站需要访问口令，请输入后继续。</p>
        <input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="访问口令"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10,
            border: '1px solid var(--t-border, #2a2a35)', background: 'transparent',
            color: 'inherit', fontSize: 14, marginBottom: 12, textAlign: 'center',
          }}
        />
        {error && <p style={{ color: '#e06c5c', fontSize: 12, marginBottom: 12 }}>{error}</p>}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          style={{
            width: '100%', padding: '10px 0', borderRadius: 10, cursor: 'pointer',
            border: '1px solid rgba(212,168,67,0.4)', background: 'rgba(212,168,67,0.12)',
            color: 'var(--t-gold, #d4a843)', fontSize: 14, fontWeight: 600,
            opacity: busy || !code.trim() ? 0.5 : 1,
          }}
        >
          {busy ? '验证中…' : '进入'}
        </button>
      </form>
    </main>
  );
}
