package server

import (
	"fmt"
	"html"
	"net/http"
	"time"
)

// BackendConsole merender antarmuka Engineering & Observability Console pada GET / (port 4000)
// Menggunakan desain Swiss Industrial Precision (IBM Plex Sans + IBM Plex Mono, tabular-nums, hairline grid, bebas dekorasi AI).
func (h *Handler) BackendConsole(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	dbStatus := "CONNECTED (PostgreSQL)"
	dbBadgeClass := "status-ok"
	if _, err := h.repo.Health(ctx); err != nil {
		dbStatus = "DEGRADED FALLBACK (Mock Repository Active)"
		dbBadgeClass = "status-warn"
	}

	var (
		uptimeSec         int64
		totalReq          int64
		errReq            int64
		availSLI          float64 = 100.0
		p50Ms             float64
		p95Ms             float64
		idemReplays       int64
		rateLimited       int64
		recentAuditTrails []AuditEntry
	)

	if h.obs != nil {
		snap := h.obs.Snapshot()
		if v, ok := snap["uptime_seconds"].(int64); ok {
			uptimeSec = v
		}
		if v, ok := snap["total_requests"].(int64); ok {
			totalReq = v
		}
		if v, ok := snap["server_error_requests"].(int64); ok {
			errReq = v
		}
		if v, ok := snap["availability_sli_percent"].(float64); ok {
			availSLI = v
		}
		if v, ok := snap["p50_latency_ms"].(float64); ok {
			p50Ms = v
		}
		if v, ok := snap["p95_latency_ms"].(float64); ok {
			p95Ms = v
		}
		if v, ok := snap["idempotent_replays"].(int64); ok {
			idemReplays = v
		}
		if v, ok := snap["rate_limited_requests"].(int64); ok {
			rateLimited = v
		}
		if v, ok := snap["audit_trail_recent"].([]AuditEntry); ok {
			recentAuditTrails = v
		}
	}

	auditRowsHTML := ""
	if len(recentAuditTrails) == 0 {
		auditRowsHTML = `<tr><td colspan="7" class="empty-row">Belum ada transaksi mutasi yang tercatat pada sesi ini.</td></tr>`
	} else {
		for _, a := range recentAuditTrails {
			auditRowsHTML += fmt.Sprintf(
				`<tr>
					<td data-label="Request ID" class="mono">%s</td>
					<td data-label="Actor NIK" class="mono"><strong>%s</strong></td>
					<td data-label="Role"><span class="role-tag">%s</span></td>
					<td data-label="Action" class="mono">%s</td>
					<td data-label="Entity ID" class="mono">%s</td>
					<td data-label="HTTP" class="mono">%d</td>
					<td data-label="Timestamp" class="mono">%s</td>
				</tr>`,
				html.EscapeString(a.RequestID),
				html.EscapeString(a.ActorNIK),
				html.EscapeString(a.ActorRole),
				html.EscapeString(a.Action),
				html.EscapeString(a.EntityID),
				a.StatusCode,
				html.EscapeString(a.Timestamp),
			)
		}
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	page := fmt.Sprintf(`<!doctype html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Machine Card API · Backend Service &amp; Observability Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #f3f5f4;
      --surface: #ffffff;
      --ink: #0f172a;
      --muted: #475569;
      --subtle: #64748b;
      --border: #d8e0dc;
      --forest: #0a1c14;
      --emerald: #059669;
      --amber: #b45309;
      --crimson: #be123c;
      --mono: 'IBM Plex Mono', ui-monospace, SFMono-Regular, Consolas, monospace;
      --sans: 'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font-family: var(--sans);
      font-size: 14px;
      line-height: 1.5;
      -webkit-font-smoothing: antialiased;
    }
    .topbar {
      background: var(--forest);
      color: #ffffff;
      padding: 12px 24px;
      border-bottom: 1px solid #163024;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 12px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .brand-mark {
      width: 30px;
      height: 30px;
      background: #123123;
      border: 1px solid rgba(52, 211, 153, 0.4);
      border-radius: 5px;
      display: grid;
      place-items: center;
      font-family: var(--mono);
      font-weight: 600;
      font-size: 12px;
      color: #6ee7b7;
    }
    .brand-title strong {
      display: block;
      font-size: 13px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .brand-title small {
      color: #94a3b8;
      font-size: 11px;
      font-family: var(--mono);
    }
    .topbar-right {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--mono);
      font-size: 12px;
    }
    .status-pill {
      padding: 4px 10px;
      border-radius: 4px;
      font-weight: 500;
      font-size: 11px;
    }
    .status-ok {
      background: rgba(16, 185, 129, 0.16);
      color: #6ee7b7;
      border: 1px solid rgba(52, 211, 153, 0.35);
    }
    .status-warn {
      background: rgba(245, 158, 11, 0.16);
      color: #fde68a;
      border: 1px solid rgba(251, 191, 36, 0.35);
    }
    .btn-link {
      color: #ffffff;
      text-decoration: none;
      background: #059669;
      padding: 5px 12px;
      border-radius: 5px;
      font-family: var(--sans);
      font-weight: 600;
      font-size: 12px;
    }
    .btn-link:hover { background: #047857; }
    .container {
      max-width: 1320px;
      margin: 0 auto;
      padding: 24px;
    }
    .section-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .section-head h1, .section-head h2 {
      margin: 0;
      font-size: 16px;
      font-weight: 700;
      color: var(--ink);
    }
    .section-head span {
      font-size: 12px;
      color: var(--subtle);
      font-family: var(--mono);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .kpi-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-top: 2px solid var(--forest);
      border-radius: 6px;
      padding: 14px 16px;
    }
    .kpi-box.emerald { border-top-color: var(--emerald); }
    .kpi-box.amber { border-top-color: var(--amber); }
    .kpi-label {
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--subtle);
    }
    .kpi-val {
      font-family: var(--mono);
      font-size: 22px;
      font-weight: 600;
      color: var(--ink);
      margin: 6px 0 2px;
      font-variant-numeric: tabular-nums;
    }
    .kpi-sub {
      font-size: 11px;
      color: var(--muted);
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
    }
    .panel-header {
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      background: #f8faf9;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .panel-header h3 {
      margin: 0;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--ink);
    }
    table {
      width: 100%%;
      border-collapse: collapse;
      font-size: 13px;
      font-variant-numeric: tabular-nums;
    }
    th {
      text-align: left;
      padding: 10px 16px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--subtle);
      background: #fbfcfc;
      border-bottom: 1px solid var(--border);
    }
    td {
      padding: 10px 16px;
      border-bottom: 1px solid #eef2f0;
      vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    .mono {
      font-family: var(--mono);
      font-size: 12px;
    }
    .method {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--mono);
      font-size: 11px;
      font-weight: 600;
    }
    .method.get { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
    .method.post { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
    .role-tag {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: var(--mono);
      font-size: 11px;
      background: #f1f5f9;
      color: #334155;
    }
    .empty-row {
      text-align: center;
      color: var(--subtle);
      padding: 24px !important;
    }
    a.ep-link {
      color: #047857;
      text-decoration: none;
      font-weight: 500;
    }
    a.ep-link:hover { text-decoration: underline; }
    .table-scroll {
      width: 100%%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    @media (max-width: 768px) {
      .topbar { padding: 12px 16px; }
      .topbar-right { width: 100%%; justify-content: space-between; }
      .container { padding: 16px 12px; }
      .section-head { flex-direction: column; gap: 4px; align-items: flex-start; }
      .kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
      .kpi-val { font-size: 18px; }
      .panel-header { flex-direction: column; align-items: flex-start; gap: 4px; }
      table, thead, tbody, tr, td { display: block; width: 100%%; min-width: 0; }
      thead { display: none; }
      tbody { padding: 10px; display: flex; flex-direction: column; gap: 10px; background: #f3f5f4; }
      tr { background: #ffffff; border: 1px solid var(--border); border-radius: 8px; padding: 4px 12px; }
      td { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px dashed #e2e8f0; text-align: right; }
      td:last-child { border-bottom: none; }
      td[data-label]::before { content: attr(data-label); font-family: var(--sans); font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--subtle); text-align: left; }
    }
    @media (max-width: 420px) {
      .kpi-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <header class="topbar">
    <div class="brand">
      <div class="brand-mark">B7</div>
      <div class="brand-title">
        <strong>PT Bintang Toedjoe · Machine Card Backend Engine</strong>
        <small>Golang net/http · pgx/v5 · GxP ALCOA+ Validated</small>
      </div>
    </div>
    <div class="topbar-right">
      <span class="status-pill %s">%s</span>
      <a class="btn-link" href="http://localhost:5173/">Buka Web Portal (:5173) &rarr;</a>
    </div>
  </header>

  <main class="container">
    <div class="section-head">
      <h1>Observability, SLI/SLO &amp; Runtime Telemetry (Bab 33–36)</h1>
      <span>Server Time: %s</span>
    </div>

    <div class="kpi-grid">
      <div class="kpi-box emerald">
        <div class="kpi-label">Availability SLI</div>
        <div class="kpi-val">%.2f%%</div>
        <div class="kpi-sub">Target SLO: &gt;= 99.50%% (5xx: %d)</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Latency (p50 / p95)</div>
        <div class="kpi-val">%.2f / %.2f ms</div>
        <div class="kpi-sub">Distribusi waktu respons aktual</div>
      </div>
      <div class="kpi-box">
        <div class="kpi-label">Total Requests</div>
        <div class="kpi-val">%d</div>
        <div class="kpi-sub">Uptime: %d detik</div>
      </div>
      <div class="kpi-box amber">
        <div class="kpi-label">Idempotency &amp; Guard</div>
        <div class="kpi-val">%d / %d</div>
        <div class="kpi-sub">Replay Idempoten / Rate-Limited (429)</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Kontrak Layanan REST API (Bab 16 &amp; Bab 17)</h3>
        <span class="mono">Base URL: http://localhost:4000</span>
      </div>
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Endpoint</th>
            <th>Proteksi &amp; Invariant</th>
            <th>Deskripsi Kontrak</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td data-label="Method"><span class="method get">GET</span></td>
            <td data-label="Endpoint" class="mono"><a class="ep-link" href="/api/health">/api/health</a></td>
            <td data-label="Proteksi" class="mono">Readiness Probe</td>
            <td data-label="Deskripsi">Status koneksi PostgreSQL &amp; sinkronisasi waktu server</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method get">GET</span></td>
            <td data-label="Endpoint" class="mono"><a class="ep-link" href="/api/observability">/api/observability</a></td>
            <td data-label="Proteksi" class="mono">SLI/SLO + Audit</td>
            <td data-label="Deskripsi">Snapshot JSON metrik latensi p50/p95, error budget, dan jejak audit GxP</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method get">GET</span></td>
            <td data-label="Endpoint" class="mono"><a class="ep-link" href="/api/machines">/api/machines</a></td>
            <td data-label="Proteksi" class="mono">Unrestricted Field Access</td>
            <td data-label="Deskripsi">Daftar seluruh mesin aktif pabrik tanpa restriksi operator</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method get">GET</span></td>
            <td data-label="Endpoint" class="mono"><a class="ep-link" href="/api/open-work">/api/open-work</a></td>
            <td data-label="Proteksi" class="mono">Timeline Comparison</td>
            <td data-label="Deskripsi">Daftar tiket breakdown beserta komparasi durasi teknisi vs downtime operasional</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method post">POST</span></td>
            <td data-label="Endpoint" class="mono">/api/open-work</td>
            <td data-label="Proteksi" class="mono">Idempotency-Key + Timeline Check</td>
            <td data-label="Deskripsi">Pelaporan tiket breakdown baru oleh operator aktif</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method post">POST</span></td>
            <td data-label="Endpoint" class="mono">/api/open-work/close</td>
            <td data-label="Proteksi" class="mono">Optimistic Lock + State Machine</td>
            <td data-label="Deskripsi">Penutupan tiket oleh operator saat mesin beroperasi kembali (mendukung ganti shift)</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method get">GET</span></td>
            <td data-label="Endpoint" class="mono"><a class="ep-link" href="/api/analytics/breakdown">/api/analytics/breakdown</a></td>
            <td data-label="Proteksi" class="mono">MTTR / MTBF / Pareto</td>
            <td data-label="Deskripsi">Agregasi MTTR Operasional, MTTR Teknis, MTBF, Availability, &amp; Pareto Mesin</td>
          </tr>
          <tr>
            <td data-label="Method"><span class="method post">POST</span></td>
            <td data-label="Endpoint" class="mono">/api/shift-report/discord</td>
            <td data-label="Proteksi" class="mono">SSRF Guard + Idempotency-Key</td>
            <td data-label="Deskripsi">Pengiriman laporan serah-terima shift otomatis ke webhook resmi Discord</td>
          </tr>
        </tbody>
      </table>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header">
        <h3>Jejak Audit Operasional Terbaru (GxP ALCOA+ Audit Trail · Bab 33)</h3>
        <span class="mono">Correlation: X-Request-ID</span>
      </div>
      <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Request ID</th>
            <th>Actor NIK</th>
            <th>Role</th>
            <th>Action</th>
            <th>Entity ID</th>
            <th>HTTP</th>
            <th>Timestamp</th>
          </tr>
        </thead>
        <tbody>
          %s
        </tbody>
      </table>
      </div>
    </div>
  </main>
</body>
</html>`,
		dbBadgeClass,
		html.EscapeString(dbStatus),
		time.Now().Format(time.RFC3339),
		availSLI,
		errReq,
		p50Ms,
		p95Ms,
		totalReq,
		uptimeSec,
		idemReplays,
		rateLimited,
		auditRowsHTML,
	)

	_, _ = w.Write([]byte(page))
}
