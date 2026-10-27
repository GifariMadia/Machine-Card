# Penyelesaian audit Machine Card

Tanggal: 26 Oktober 2026. Dokumen ini menindaklanjuti 23 kelompok temuan pada AUDIT-SISTEM-2026-10-26.md. Perbaikan dilakukan pada sumber aplikasi, API, dan penyimpanan PostgreSQL. Daftar ini menyatakan penyelesaian temuan yang diperiksa, bukan jaminan bahwa aplikasi bebas dari semua kemungkinan cacat.

## Perubahan per temuan

| Temuan | Perbaikan |
| --- | --- |
| AUD-01 | Login diverifikasi server, sandi di-hash, sesi acak memakai cookie HttpOnly/SameSite, akun aktif dan peran diperiksa ulang. Sandi bawaan diganti acak; pembatasan percobaan login disimpan di database. |
| AUD-02 | API mensyaratkan sesi dan izin per peran. Identitas aktor berasal dari sesi; endpoint data lama dihentikan. Permintaan perubahan dari origin lain ditolak. |
| AUD-03 | Reset otomatis data bisnis dihapus. Catatan browser lama dipertahankan dan tersedia untuk impor sekali oleh Admin. |
| AUD-04 | Data bisnis lintas panel terpusat di dokumen PostgreSQL. Browser hanya menyimpan preferensi dan salinan lama; tidak menjadi fallback operasional. |
| AUD-05 | Closing mengacu tiket, bukan ID mesin; pencarian SQL lama memakai syarat identitas yang tidak ambigu. Jalur produksi memakai validasi transisi tiket pada server. |
| AUD-06 | Gagal simpan tidak lagi dianggap berhasil. Aplikasi menampilkan status belum tersimpan dan meminta pemuatan ulang setelah konflik/kegagalan. |
| AUD-07 | Setiap simpan menggunakan versi dokumen; perubahan serentak ditolak bila versinya basi. Batch disimpan atomik, tanpa penimpaan diam-diam. |
| AUD-08 | Status terkirim berasal dari catatan pengiriman server. Worker otomatis berjalan setelah akhir shift dan kelengkapan nyata; simulasi dibedakan dari pengiriman. |
| AUD-09 | Laporan memakai tanggal operasional, shift, anggota, dan area mesin yang sesuai. Shift malam diperhitungkan lintas tanggal. |
| AUD-10 | Durasi buatan dihapus. MTTR memakai durasi tersedia; downtime mengacu awal gangguan hingga konfirmasi kembali operasi. Data tidak lengkap ditampilkan N/A. |
| AUD-11 | PM compliance mengecualikan jadwal masa depan dan menghitung kepatuhan terhadap tanggal jatuh tempo. Tanpa data ditampilkan N/A. |
| AUD-12 | Lifetime kalender bergerak mengikuti tanggal; lifetime jam memakai meter kumulatif dan baseline terverifikasi. Tanpa baseline ditampilkan belum tersedia. |
| AUD-13 | Penggantian terbaru diprioritaskan dibanding snapshot lama. Formula master terbaru digunakan pada proyeksi komponen. |
| AUD-14 | Detail mesin dan pemantauan global menggunakan sumber proyeksi part yang sama. |
| AUD-15 | Pekerjaan menunggu/pending tetap masuk backlog dan aging; tidak disamakan dengan pekerjaan selesai. |
| AUD-16 | Waktu pekerjaan selesai, tiket ditutup, dan kembali operasi dipisahkan. Server memvalidasi urutan waktu serta menolak waktu masa depan. Selesai teknisi bukan bukti mesin aman/beroperasi. |
| AUD-17 | Komponen terpasang dibedakan berdasarkan mesin, part, dan posisi, sehingga perubahan satu posisi tidak menghapus posisi lain. |
| AUD-18 | Kunci permintaan dan hasil tersimpan di PostgreSQL. Pengiriman Discord direservasi sebelum jaringan; hasil tidak pasti tidak otomatis dikirim ulang. |
| AUD-19 | Audit server menyimpan aktor, waktu, serta perubahan sebelum/sesudah dalam transaksi. Panel Admin/Supervisor membaca audit server; jurnal UI bukan sumber audit utama. |
| AUD-20 | Perubahan PM selalu mencatat alasan dan aktor, termasuk bila tanggal tetap. Status berjalan dipertahankan, jadwal selesai tidak dapat diedit seperti jadwal baru. |
| AUD-21 | Rekap mesin menghitung mesin unik; jumlah kegagalan tidak lagi dipaksa minimal satu. Data operasi yang tidak lengkap tidak menghasilkan MTBF semu. |
| AUD-22 | Kontrol simulasi disembunyikan pada jalur operasional, versi negatif dihapus, jam shift diperbarui, dan revisi tidak tersedia sebelum ada pengiriman nyata. |
| AUD-23 | Claim dan transisi pekerjaan diperiksa secara atomik oleh server. Teknisi lain tidak dapat mengambil atau menyelesaikan pekerjaan yang sudah dimiliki. |

## Verifikasi

- Build TypeScript/Vite produksi berhasil. Ada peringatan ukuran bundel JavaScript; tidak menghalangi build dan belum dilakukan pemisahan bundel pada pekerjaan ini.
- Pengujian frontend: **107/107 lolos pada 13 berkas**, mencakup alur panel, status mesin/tiket, PM, part, metrik, penyimpanan server, retry, dan konflik versi.
- Pemeriksaan regresi audit: **6/6 lolos**, menggantikan pemeriksaan yang sebelumnya mereproduksi cacat.
- `MC_DB_INTEGRATION=1 go test -count=1 ./...` berhasil, termasuk lima pengujian integrasi PostgreSQL: autentikasi/sesi, claim serentak dan replay, pengiriman persisten, seluruh siklus tiket, serta rollback batch tanpa izin. Skema pengujian terisolasi dibersihkan setelah pengujian.
- Tidak mengirim pesan Discord nyata atau membuat tiket operasional percobaan pada data pengguna. Konfigurasi Discord belum terpasang pada lingkungan lokal; pengiriman nyata perlu diperiksa setelah konfigurasi dipasang.
- Pemeriksaan HTTP pada server versi baru: login/sesi/data/audit/health 200, data tanpa login 401, endpoint tiket lama 410, logout 200, halaman web 200. Cookie sesi HttpOnly dengan path `/`.

## Memakai versi baru

1. Buka aplikasi di http://localhost:5173 dan login kembali. Sandi lama bawaan tidak berlaku; kredensial acak tersimpan lokal pada `%APPDATA%/MachineCard/private/initial-accounts-*.json`.
2. Pada browser yang memiliki catatan lama, masuk Admin lalu gunakan **Impor catatan lama ke server**. Tinjau daftar sumber sebelum menekan tombol. Catatan asli tidak dihapus. Profil tambahan mendapat sandi acak dalam berkas `imported-accounts-*.json` di folder privat server.
3. Lengkapi jam operasi dan baseline meter komponen bila memakai formula jam; tanpa data ini aplikasi menampilkan N/A.
4. Untuk pengiriman otomatis, pasang webhook baru pada lingkungan server dan mulai ulang API. Webhook yang sebelumnya pernah tertanam pada kode telah dihapus; bila masih aktif, ganti melalui pengaturan Discord. Pengiriman berstatus tidak pasti memerlukan pemeriksaan channel sebelum tindakan lanjutan.

Cadangan sebelum perubahan: `.audit-backups/before-fixes-20261026.zip` dan `.audit-backups/database-before-runtime-fixes-20261026.dump`. Direktori cadangan dan berkas privat diblokir dari penyajian Vite. Jangan menjalankan reset/seed untuk melakukan perpindahan catatan lama.

Pengujian otomatis dan pemeriksaan HTTP tidak menggantikan uji penerimaan pengguna pada seluruh browser/peran, uji beban, pengujian pemulihan cadangan, atau penilaian keamanan menyeluruh untuk penyebaran publik.
