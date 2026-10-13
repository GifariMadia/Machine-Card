import { useEffect, useState } from 'react';

type Event = { id: number; actor_nik: string; actor_role: string; request_key: string; created_at: string; changes: unknown };
export default function ServerAuditPanel() {
  const [events, setEvents] = useState<Event[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    if (import.meta.env.MODE === 'test') return;
    const controller = new AbortController();
    void fetch('/api/events', { signal: controller.signal, credentials: 'same-origin' }).then(async (response) => {
      if (!response.ok) throw new Error('Riwayat server belum dapat dimuat');
      setEvents(await response.json());
    }).catch((error) => { if (error.name !== 'AbortError') setError(error.message); });
    return () => controller.abort();
  }, []);
  return <section className="spv-analytics-section" style={{ padding: 20, marginTop: 20 }}>
    <h3>Audit transaksi server</h3><p>Aktor dan waktu dicatat oleh server. Riwayat ini tidak dapat diedit melalui formulir.</p>
    {error && <p role="alert">{error}</p>}
    <div style={{ overflowX: 'auto' }}><table className="spv-table"><thead><tr><th>Waktu</th><th>Pengguna</th><th>Transaksi</th><th>Perubahan</th></tr></thead>
      <tbody>{events.map((event) => <tr key={event.id}><td>{new Date(event.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}</td><td>{event.actor_nik} · {event.actor_role}</td><td>{event.request_key}</td><td><details><summary>Nilai sebelum / sesudah</summary><pre style={{ maxWidth: 600, maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap' }}>{JSON.stringify(event.changes, null, 2)}</pre></details></td></tr>)}</tbody>
    </table></div>{!events.length && !error && <p>Belum ada transaksi server tercatat.</p>}
  </section>;
}
