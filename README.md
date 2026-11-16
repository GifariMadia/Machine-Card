# Machine Card

Pondasi aplikasi monitoring lifetime part mesin. Project memakai React + TypeScript untuk antarmuka, Golang untuk API backend, dan PostgreSQL sebagai sumber data.

## Menjalankan lokal

1. Salin `.env.example` menjadi `.env`.
2. Jalankan database: `docker compose up -d`.
3. Instal dependensi: `npm install`.
4. Jalankan migrasi dan seed: `npm run db:migrate && npm run db:seed`.
5. Jalankan pengujian: `npm test` (menjalankan Go tests & Vitest).
6. Jalankan aplikasi: `npm run dev`.

Web tersedia di `http://localhost:5173`, API (Golang) di `http://localhost:4000`.

Login dan data operasional memerlukan API serta PostgreSQL aktif. Browser tidak lagi menjadi sumber data bisnis atau cadangan keberhasilan ketika API gagal. Endpoint operasional lama mengembalikan 410; aplikasi menggunakan `/api/state` dengan versi dokumen, transaksi, dan sesi server.

Pada startup pertama, server mengganti sandi bawaan yang dapat ditebak dan menulis kredensial acak ke `%APPDATA%/MachineCard/private/initial-accounts-*.json`. Buka berkas ini secara lokal; jangan unggah atau masukkan ke source control. Akun yang dinonaktifkan atau sandinya direset kehilangan sesi aktif. Sesi kedaluwarsa setelah 30 menit tanpa aktivitas.

Jika sebelumnya menggunakan versi yang menyimpan catatan di browser, masuk Admin pada browser asal lalu gunakan **Impor catatan lama ke server**. Data lama tetap disimpan. Impor hanya tersedia sekali, tidak menimpa dokumen server yang sudah berubah sejak inisialisasi, dan akun tambahan menerima kredensial acak di `imported-accounts-*.json` pada folder privat yang sama.

Pengiriman shift otomatis memerlukan `DISCORD_WEBHOOK_URL` pada lingkungan server. Tanpa konfigurasi, laporan tidak diberi status terkirim. Worker menunggu akhir shift dan kelengkapan laporan teknisi, mencatat hasil pengiriman secara persisten, dan tidak mengulang pengiriman yang hasilnya belum pasti. Pratinjau/simulasi bukan bukti pengiriman nyata.

Untuk pengujian integrasi PostgreSQL terisolasi di PowerShell, jalankan dari `apps/api`: `$env:MC_DB_INTEGRATION='1'; go test -count=1 ./...`. Pengujian membuat dan menghapus skema khusus pengujian, bukan menghapus tabel operasional. Pemeriksaan regresi audit: dari `apps/web`, `npx vitest run --config audit/vitest.config.ts`.

Rincian penyelesaian audit: [PERBAIKAN-AUDIT-2026-10-26.md](PERBAIKAN-AUDIT-2026-10-26.md).

## Catatan perubahan skema

Baseline database mengikuti model RBAC `pengguna -> akses_mesin -> mesin` dan workflow
`open_work -> breakdown -> catatan_pengerjaan`. Jika database pernah dibuat menggunakan
baseline lama sebelum RBAC, buat database kosong baru sebelum menjalankan migrasi. Jangan
menjalankan baseline baru di atas tabel lama karena nama kolom dan relasinya tidak kompatibel.
