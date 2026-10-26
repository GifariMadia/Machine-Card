# Laporan Audit Penuh & Implementasi Blueprint Full Stack 2026 — Machine Card

Dokumen ini memetakan audit menyeluruh dan implementasi teknis proyek **Machine Card (PT Bintang Toedjoe - Site Pulogadung)** berdasarkan standar **Kitab Full Stack Developer dan AI Orchestrator (Edisi 2026 · 60 Bab)**.

---

## 1. Pemetaan Audit Lintas Lapisan (Bagian I – IX)

| Bagian & Bab Rujukan | Temuan Audit Sebelum Perbaikan | Implementasi & Bukti Verifikasi |
| :--- | :--- | :--- |
| **Bagian I (Bab 1–8)**<br>Fondasi, Invariant, Reproduksibilitas & Modularitas | Terdapat residu kode legacy TypeScript/JS (`apps/api/src`, `apps/api/dist`) di dalam modul backend Go; invariant urutan waktu belum ditegakkan di domain & DB. | - Menghapus artefak legacy TS/JS dari `apps/api` agar boundary modul Go bersih.<br>- Menambahkan `ValidateTimelineInvariant` di [`openwork.go`](../apps/api/internal/domain/openwork.go) dan constraint `CHECK (waktu_mesin_beroperasi >= waktu_dibuka)` di [`004_audit_idempotency_and_optimistic_lock.sql`](../database/migrations/004_audit_idempotency_and_optimistic_lock.sql). |
| **Bagian II (Bab 9–15)**<br>Interaction Design, WCAG 2.2, State, & Sinkronisasi | - Modal/Drawer belum merespons tombol `Escape`.<br>- `fetch` mesin belum memakai `AbortController`.<br>- Perubahan `localStorage` belum sinkron lintas tab browser.<br>- Indikator `:focus-visible` keyboard belum seragam. | - Menambahkan handler `Escape` pada [`OpenWorkDrawer.tsx`](../apps/web/src/OpenWorkDrawer.tsx), [`OperatorDashboard.tsx`](../apps/web/src/OperatorDashboard.tsx), dan [`App.tsx`](../apps/web/src/App.tsx).<br>- Menambahkan `AbortController` dan listener `storage` lintas tab (Playbook F).<br>- Menambahkan `role="alert" aria-live="assertive"`, `:focus-visible`, dan `@media (prefers-reduced-motion: reduce)`. |
| **Bagian III (Bab 16–24)**<br>Kontrak API, State Machine, Idempotensi, Concurrency, SQL Index | - Error API belum memiliki kode error mesin yang stabil (`code` + `request_id`).<br>- Belum ada proteksi `Idempotency-Key` pada mutasi.<br>- Penutupan tiket belum memiliki *Optimistic Concurrency Control* (`version`) & *State Machine* eksplisit.<br>- Kolom Foreign Key PostgreSQL belum seluruhnya memiliki indeks. | - Kontrak error terstruktur (`code`, `message`, `request_id`).<br>- Engine `IdempotencyStore` (SHA-256 payload fingerprint, replay `X-Idempotent-Replayed: true`, dan `409 Conflict` bila payload berbeda).<br>- `ValidateTicketTransition` & `version` check (`FOR UPDATE` + `WHERE status <> 'CLOSED'`).<br>- Indeks FK di migrasi `004`. |
| **Bagian IV (Bab 25–30)**<br>Keamanan Aplikasi, Threat Modeling, SSRF & Testing Berbasis Risiko | - Input `webhookUrl` pada laporan shift Discord belum memvalidasi domain/skema (celah SSRF).<br>- Ukuran body request belum dibatasi.<br>- Security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`) belum dipasang. | - Fungsi `ValidateDiscordWebhookURL` di [`discord.go`](../apps/api/internal/domain/discord.go) memblokir IP internal/metadata/non-HTTPS (`ERR_SSRF_BLOCKED`).<br>- `http.MaxBytesReader` (batas 1 MB) & `SecurityHeadersMiddleware` di [`middleware.go`](../apps/api/internal/server/middleware.go).<br>- Suite pengujian konkurensi 20 goroutine, idempotensi, SSRF, dan rate limit di [`server_test.go`](../apps/api/internal/server/server_test.go). |
| **Bagian V (Bab 31–36)**<br>Observability, SLI/SLO, Audit Trail, Timeout & Backpressure | - Log belum memiliki `X-Request-ID` terkororelasi.<br>- Belum ada endpoint telemetri SLI/SLO (p50/p95 latency) & *Audit Trail* GxP.<br>- Belum ada *Rate Limiter* per IP. | - `RequestIDAndLoggingMiddleware` menyematkan `X-Request-ID`.<br>- `ObservabilityCollector` & endpoint `GET /api/observability` menyajikan SLI availability, p50/p95 latency, dan *Audit Trail* GxP ALCOA+.<br>- `RateLimiter` middleware (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `429 Too Many Requests` + `Retry-After`). |

---

## 2. Tabel Transisi State Machine Tiket Breakdown (Bab 17)

| Status Saat Ini | Status Tujuan | Peran Diizinkan | Syarat & Invariant | Hasil Jika Dilanggar |
| :--- | :--- | :--- | :--- | :--- |
| `OPEN` | `IN_PROGRESS` | `TEKNISI`, `ADMIN` | Teknisi mulai menangani mesin di lapangan | `409 Conflict` (`ERR_CONFLICT_STATE`) |
| `OPEN` | `SELESAI_PERBAIKAN` | `TEKNISI`, `ADMIN` | Perbaikan langsung selesai dicatat teknisi | `409 Conflict` |
| `OPEN` | `CLOSED` | `OPERATOR`, `ADMIN` | Operator mengonfirmasi mesin beroperasi kembali (`waktu_mesin_beroperasi >= waktu_mulai`) | `400 Bad Request` / `409 Conflict` |
| `IN_PROGRESS` | `SELESAI_PERBAIKAN` | `TEKNISI`, `ADMIN` | Teknisi menyelesaikan tindakan perbaikan | `409 Conflict` |
| `IN_PROGRESS` | `CLOSED` | `OPERATOR`, `ADMIN` | Operator menutup tiket setelah running test berhasil | `409 Conflict` |
| `SELESAI_PERBAIKAN` | `CLOSED` | `OPERATOR`, `ADMIN` | Operator shift aktif mengonfirmasi running test sukses | `403 Forbidden` jika bukan Operator/Admin |
| `SELESAI_PERBAIKAN` | `IN_PROGRESS` | `OPERATOR`, `TEKNISI` | Rework apabila running test gagal | `409 Conflict` |
| `CLOSED` | *(Apa pun)* | *(Tidak ada)* | **Terminal State**: Tiket tertutup tidak boleh ditutup ulang / dibuka kembali tanpa tiket baru | `409 Conflict` (`ERR_CONFLICT_STATE`) |

---

## 3. Architecture Decision Record (ADR · Bab 7 & Bab 58)

- **Judul Keputusan**: ADR-001 — Modular Monolith Golang + PostgreSQL dengan Degraded Fallback & Idempotent Mutations
- **Tanggal & Status**: 20 Oktober 2026 · **Diterima (Accepted)**
- **Masalah & Konteks**: Aplikasi Machine Card digunakan oleh Operator, Teknisi, Supervisor, dan Admin di lingkungan lantai produksi pabrik (Plant Pulogadung) yang terkadang mengalami fluktuasi jaringan Wi-Fi tablet atau gangguan koneksi database.
- **Keputusan**:
  1. Menggunakan **Golang (`net/http` + `pgx/v5`)** sebagai backend utama untuk latensi rendah, konkurensi aman, dan binary tunggal.
  2. Menerapkan **Idempotency-Key + SHA-256 Payload Fingerprint** pada seluruh endpoint POST mutasi (`open-work`, `open-work/close`, `shift-report/discord`).
  3. Menerapkan **Optimistic Concurrency Control (`version`) + Row Locking (`FOR UPDATE`)** saat penutupan tiket lintas shift.
  4. Menyediakan **Graceful Degraded Mode** ketika PostgreSQL belum terjangkau agar pelaporan di lapangan tidak terhenti.

- **Judul Keputusan**: ADR-002 — Penahapan Integrasi Data Jam Operasi Aktual & Roadmap OEE (URS 3.6 & URS 7.6)
- **Tanggal & Status**: 24 Oktober 2026 · **Diterima (Accepted)**
- **Masalah & Konteks**: Terdapat peluang integrasi analitik ke arah OEE (*Overall Equipment Effectiveness*) berbasis jam operasional mesin. Namun kalkulasi OEE lengkap membutuhkan input gabungan yang kompleks (Availability, Performance / Ideal Cycle Time, dan Quality / Scrap Rate). Memaksakan integrasi otomatis IoT/PLC dan kalkulasi OEE sekaligus pada fase awal berisiko mempersulit adopsi di lantai produksi dan memicu bias akurasi data.
- **Keputusan**:
  1. **Fase 1 (Penyederhanaan Baseline)**: Memfokuskan integrasi waktu operasi mesin pada **input manual terverifikasi oleh SPV Maintenance dan Admin** (berbasis logbook fisik/shift) sesuai kepatuhan klausul URS 3.6.
  2. **Pemisahan Waktu Riil**: Memastikan waktu operasi aktual (`jamOperasiAktual`) tetap terpisah dari durasi shift kalender (`jamShiftKalender`) untuk menghasilkan metrik MTBF presisi.
  3. **Kesiapan Ekstensi OEE (Fase 2)**: Model data yang telah stabil ini diposisikan sebagai pilar komponen *Availability* ($\text{Operating Hours} / \text{Planned Shift Hours}$) yang siap dihubungkan ke kalkulasi OEE penuh ketika integrasi counter output/reject telah matang.

---

## 4. Matriks Kesiapan & Checklist Rilis (Bab 57)

- [x] Tujuan, invariant waktu (`waktu_mesin_beroperasi >= waktu_mulai`), dan state machine (`OPEN -> IN_PROGRESS -> SELESAI_PERBAIKAN -> CLOSED`) terverifikasi.
- [x] Input dan URL webhook eksternal divalidasi pada trust boundary (proteksi SSRF & batas payload 1 MB).
- [x] Transaksi dan konkurensi diuji dengan simulasi 20 goroutine serentak (hanya 1 sukses, 19 ditolak dengan `409 Conflict`).
- [x] Retry memiliki semantik idempoten (`Idempotency-Key` menghasilkan replay `X-Idempotent-Replayed: true` dan menolak payload berbeda dengan `409 Conflict`).
- [x] Aksesibilitas keyboard (`Escape`, `:focus-visible`, `role="alert"`, `prefers-reduced-motion`) dan sinkronisasi lintas tab telah diuji.
- [x] Observability (`X-Request-ID`, p50/p95 latency, SLI availability, dan GxP Audit Trail) tersedia melalui `/api/observability`.
