# Audit logika dan fungsi Machine Card

> Dokumen ini adalah potret sebelum perbaikan. Tindak lanjut implementasi, hasil pengujian terbaru, dan langkah perpindahan data dicatat dalam [PERBAIKAN-AUDIT-2026-10-26.md](PERBAIKAN-AUDIT-2026-10-26.md). Pemeriksaan karakterisasi tambahan telah diubah menjadi pengujian regresi.

Tanggal: 26 Oktober 2026. Ruang lingkup: aplikasi web empat peran, API Go, akses database, tiket breakdown, closing, PM, penggantian part, lifetime, pelaporan shift, KPI dan audit trail.

## Kesimpulan

Ditemukan **23 kelompok cacat: 3 P0, 17 P1, 3 P2**. Aplikasi saat ini masih memiliki perilaku prototipe/simulasi di jalur operasional. Belum layak dijadikan satu-satunya sumber catatan maintenance atau indikator kondisi mesin untuk pemakaian bersama lintas perangkat.

P0 = risiko akses atau perubahan data kritis; P1 = hasil operasional salah, data hilang/tidak konsisten, atau fungsi inti belum lengkap; P2 = ketidakakuratan tambahan atau keterlacakan tidak lengkap. Prioritas ini penilaian audit, bukan skor CVSS.

Tidak ada perbaikan kode aplikasi dalam pekerjaan audit ini. Berkas tambahan hanya laporan dan pemeriksaan karakterisasi terisolasi. Temuan juga mencakup cacat dalam perubahan fitur terbaru, termasuk PM dan pembacaan part.

## Bukti dan batas pemeriksaan

- `npm test`: pengujian Go yang tersedia lolos; frontend **100 pengujian pada 11 berkas lolos**.
- Pemeriksaan audit tambahan: **6/6 berhasil mereproduksi perilaku cacat**. Kelulusan pemeriksaan ini berarti cacat terbukti terjadi, bukan aplikasi sudah benar.
- Pemeriksaan HTTP baca tanpa kredensial: `/api/health`, `/api/open-work`, dan `/api/observability` masing-masing mengembalikan HTTP 200 pada server lokal.
- Tidak menjalankan POST terhadap data nyata, migrasi, reset, penghapusan, pengiriman Discord, atau perubahan akun. Uji render menggunakan jsdom dan storage terisolasi; jaringan pada pemeriksaan audit dimatikan.
- Pengujian API yang ada menggunakan repository pengganti; paket database tidak memiliki pengujian. Belum ada verifikasi transaksi PostgreSQL nyata untuk kasus salah tiket, tab bersamaan, atau restart server. Kasus tersebut ditandai berdasarkan alur kode, bukan klaim kerusakan data produksi yang sudah terjadi.
- Belum melakukan pemeriksaan visual browser, uji beban, pemindaian dependensi, atau uji penetrasi menyeluruh. Pemeriksaan ini berfokus pada logika dan integrasi kode yang tersedia.

Jalankan ulang bukti khusus dari `apps/web`: `npx vitest run --config audit/vitest.config.ts`.

## P0 — paling dahulu

### AUD-01 — Login dan peran dipercaya dari browser

**Bukti:** `apps/web/src/operator.ts` fungsi `authenticateUser`/`authenticateOperator`; `apps/web/src/App.tsx:183`; `apps/web/src/LoginPage.tsx:159`.

Autentikasi berlangsung di JavaScript, akun bawaan menerima sandi generik, dan isi sesi termasuk peran dibaca langsung dari sessionStorage. Pemilik browser dapat mengubah peran atau identitas tanpa validasi server. Audit mereproduksi penerimaan akun admin dengan sandi generik. Menonaktifkan akun juga tidak mencabut sesi aktif karena pemeriksaan aktif berlangsung saat login.

**Dampak:** pembatasan antarpanel bukan kontrol akses yang dapat dipercaya. **Perbaikan:** autentikasi server, hash sandi yang diverifikasi server, sesi server/cookie aman, pemeriksaan peran dan akun aktif pada setiap aksi. Hilangkan pintasan akun/sandi dari jalur operasional.

### AUD-02 — API tidak memverifikasi identitas pemanggil

**Bukti:** `apps/api/internal/server/server.go:30`; `apps/api/internal/server/handlers.go`; `apps/api/internal/db/db.go:210` dan `:294`.

Rantai middleware tidak memuat autentikasi/otorisasi. Identitas pembuat/penutup diambil dari NIK yang dikirim pemanggil; lookup operator aktif bukan bukti bahwa pemanggil adalah operator tersebut. API tiket dan observability benar-benar bisa dibaca tanpa autentikasi. Endpoint pengiriman laporan juga tidak memiliki pemeriksaan peran server.

**Dampak:** pihak yang dapat menjangkau API berpotensi membaca catatan atau melakukan aksi dengan identitas orang lain. **Perbaikan:** ambil aktor dari sesi terverifikasi, bukan payload; terapkan otorisasi endpoint dan audit aktor server. CORS tidak menggantikan autentikasi.

### AUD-05 — Closing dapat mengenai tiket berbeda

**Bukti:** `apps/web/src/OperatorDashboard.tsx:529`; `apps/api/internal/db/db.go:318`.

Frontend mengirim `id_work` menggunakan `id_mesin`. Query backend mencari `ow.id_work = $1 OR ow.nomor_work = $2`, lalu mengambil satu baris. Jika ID mesin sama dengan ID work tiket lain, dua tiket bisa cocok dan satu yang tidak dimaksud dapat dipilih. Risiko ini terlihat dari kontrak/query; belum dicoba dengan transaksi data nyata.

**Perbaikan:** simpan ID work hasil API secara terpisah. Pilih satu identitas tiket yang otoritatif, dan tolak pasangan ID/nomor yang tidak merujuk baris sama.

## P1 — integritas dan fungsi inti

### AUD-03 — Inisialisasi dapat menghapus data bisnis

**Bukti:** `apps/web/src/App.tsx:208`. **Direproduksi:** pemeriksaan AUD-03.

Jika flag `mc-clean-slate-v4` belum ada, mount aplikasi menghapus tiket, master part, pengguna, PM, audit, dan revisi laporan dari localStorage. Data lama bisa hilang pada browser yang menyimpan data tetapi belum memiliki flag tersebut.

**Perbaikan:** hapus reset otomatis dari runtime; migrasi data berversi dengan backup. Reset pengujian harus berupa aksi khusus lingkungan uji dan tidak tersambung data operasional.

### AUD-04 — Database dan browser menjadi dua sumber kebenaran

**Bukti:** route API di `apps/api/internal/server/server.go`; mutasi di `TechnicianDashboard.tsx:1424`, `SupervisorDashboard.tsx:2973`, dan `SupervisorPMPlanner.tsx`.

Pembuatan/closing tiket mencoba API, tetapi pengerjaan teknisi, PM, part, verifikasi, pengguna dan koreksi terutama ditulis ke storage browser. Tidak tersedia route mutasi lengkap untuk alur tersebut, dan daftar tiket pada panel diinisialisasi dari storage lokal. Akibatnya, browser/perangkat lain tidak menerima keadaan operasional yang sama; salinan database tidak mengikuti seluruh siklus tiket.

**Perbaikan:** satu sumber data server, API untuk seluruh siklus, frontend sebagai cache. Mode offline membutuhkan antrean sinkronisasi eksplisit beserta status belum tersinkron dan konflik.

### AUD-06 — Gagal menyimpan di server tetap dilaporkan berhasil

**Bukti:** `OpenWorkDrawer.tsx:214` dan `:224`; `OperatorDashboard.tsx:522`.

Pembuatan tiket menangkap semua kegagalan API, termasuk respons penolakan, lalu membuat tiket lokal dan menampilkan sukses. Closing tidak menunggu hasil fetch atau memeriksa status HTTP, lalu langsung mengubah tiket lokal menjadi CLOSED. Timeout setelah server sempat commit dapat menghasilkan tiket server dan tiket lokal berbeda. Kegagalan storage lokal juga dapat tertelan.

**Perbaikan:** bedakan penolakan validasi, gangguan koneksi, dan status commit tidak diketahui. Jangan tampilkan sukses server sebelum konfirmasi. Jika offline didukung, tampilkan status antrean lokal dan lakukan rekonsiliasi idempoten.

### AUD-07 — Snapshot tab lama dapat menimpa perubahan pengguna lain

**Bukti:** `OperatorDashboard.tsx:182`, `:197`, `:543`; `SupervisorDashboard.tsx:2973`; `TechnicianDashboard.tsx:757`.

Panel Operator tidak mendengarkan perubahan storage umum seperti panel Supervisor yang sudah diperbarui. Closing memetakan seluruh `myTickets` dari snapshot lama dan menulis ulang array global. Supervisor melakukan pola serupa pada koreksi/void. Pembaruan tiket atau part dari tab lain dapat hilang. Pembacaan terbaru dalam PM masih diikuti penggabungan seluruh objek lama sehingga konflik pada record yang sama tetap mungkin.

**Perbaikan:** mutasi per-record di server dengan version check; konflik tidak boleh ditimpa diam-diam. Sinkronisasi storage bukan pengganti transaksi.

### AUD-08 — Laporan mengaku lengkap dan terkirim tanpa pengiriman

**Bukti:** `SupervisorDashboard.tsx:1793`, `:2226`, `:6483`; pemanggilan Discord di `:2771`. **Direproduksi:** AUD-08.

Status default `COMPLETE` berasal dari state simulasi. Kelengkapan teknisi ditentukan skenario, bukan bukti submit, dan UI menampilkan “Terkirim Otomatis” sebelum request kirim dilakukan. Tidak ditemukan scheduler server yang mengirim laporan di akhir shift; pengiriman berasal dari handler request.

**Perbaikan:** pisahkan DRAFT/READY/SENDING/SENT/FAILED dari kelengkapan laporan. SENT hanya setelah bukti dispatch tersimpan. Simulasi harus dipisahkan dari jalur operasional; pengiriman terjadwal memerlukan worker server.

### AUD-09 — Laporan shift mencampur tanggal dan shift lain

**Bukti:** `SupervisorDashboard.tsx:2174`. **Direproduksi:** AUD-09.

`realItems` mengambil semua tiket non-VOID tanpa filter tanggal/shift. Mengganti Shift 1 ke Shift 2 tidak membatasi tiket ke shift pilihan; tanggal laporan adalah hari ini meski tiket historis. Anggota laporan diambil dari daftar teknisi aktif, bukan penugasan shift yang terverifikasi. Area juga ditebak dari teks nama/keluhan sehingga Ilapak dapat selalu masuk Filling meski master menyatakan Packaging.

**Perbaikan:** identitas laporan wajib `(tanggal_operasional, shift, plant)`, dengan penugasan dan area dari master. Definisikan aturan pekerjaan lintas shift dan tanggal operasional shift malam.

### AUD-10 — MTTR/downtime memakai angka buatan dan nama field berbeda

**Bukti:** `SupervisorDashboard.tsx:3190`; `TechnicianDashboard.tsx:1386`, `:1443`.

KPI memakai `durasiPerbaikanMenit || 60`; data tidak ada bahkan nol berubah menjadi 60 menit. Teknisi menyimpan `durasiJam` dan `durasiTungguMenit`, sementara KPI membaca `durasiPerbaikanMenit` dan `waktuTungguPartMenit`. Durasi menunggu dapat diabaikan dan durasi perbaikan direkayasa satu jam per tiket. Total downtime dihitung dari agregasi ini, bukan seluruh interval berhenti hingga kembali operasi.

**Perbaikan:** kontrak field tunggal, durasi berbasis event waktu, pisahkan repair/wait/downtime. Data yang tidak cukup harus N/A, bukan angka default.

### AUD-11 — Kepatuhan PM tidak menilai ketepatan tanggal

**Bukti:** `SupervisorDashboard.tsx:3218`; `TechnicianDashboard.tsx` fungsi `handleCompletePM`; tabel PM Supervisor.

Semua status SELESAI dihitung tepat waktu tanpa membandingkan tanggal selesai dan jatuh tempo. PM masa depan masuk denominator, dan tidak ada PM menghasilkan 100%. Penyelesaian PM selalu menetapkan SELESAI meskipun terlambat; tabel kemudian menyebutnya “Selesai Tepat Waktu”.

**Perbaikan:** hitung hanya jadwal yang relevan/jatuh tempo di periode; bandingkan tanggal aktual dengan baseline dan aturan reschedule. Tanpa jadwal yang dinilai tampilkan N/A.

### AUD-12 — Lifetime tidak bertambah mengikuti kalender/jam operasi

**Bukti:** `machine-parts.ts:55`; `AdminDashboard.tsx:1215`; `SupervisorDashboard.tsx:3285`. **Direproduksi:** AUD-12.

Part hasil input/rekonstruksi diinisialisasi dengan usage nol. Tidak ditemukan kalkulasi ulang berdasarkan selisih tanggal pemasangan atau delta jam operasi yang menjadi input progress. Part tahun lama tetap bisa 0% dan lengkap, sehingga pengingat 80%/100% tidak dapat diandalkan.

**Perbaikan:** kalender dari tanggal penggantian aktual; jam operasi dari meter awal pemasangan dan meter terverifikasi saat ini. Jika baseline hilang, tandai belum lengkap.

### AUD-13 — Penggantian terbaru kalah oleh snapshot part lama

**Bukti:** `machine-parts.ts:37` dan pemeriksaan `list.some` di `add`. **Direproduksi:** AUD-13.

Daftar dimulai dari monitoredParts lalu approval, baru tiket yang diurutkan terbaru. Part dengan nama+posisi sama langsung diabaikan, sehingga penggantian baru tidak mengubah tanggal pemasangan maupun usage lama. Pemakaian terkini dan riwayat kejadian juga bercampur dalam satu deduplikasi.

**Perbaikan:** simpan setiap replacement sebagai kejadian terpisah; pilih kejadian terbaru per mesin/posisi untuk installed-part snapshot, pertahankan histori.

### AUD-14 — Monitoring part global memakai sumber berbeda dari detail mesin

**Bukti:** `SupervisorDashboard.tsx:3282` dibanding `:3627`.

Detail mesin memakai helper yang menggabungkan tiket, approval dan master. Tabel prioritas global hanya memakai monitoredParts. Part bisa terlihat pada detail tetapi tidak masuk alert/prioritas global; perubahan rumus master pun dapat tertahan oleh snapshot lama.

**Perbaikan:** gunakan satu proyeksi installed-parts dan lifetime untuk semua panel dan alert.

### AUD-15 — Tiket pending/menunggu hilang dari hitungan gangguan dan aging

**Bukti:** `SupervisorDashboard.tsx:1803`, `:3187`, `:3316`.

Beberapa agregasi masih membatasi status ke OPEN/IN_PROGRESS. PENDING, MENUNGGU_PART, MENUNGGU_DUKUNGAN dan handover dapat tidak dihitung sebagai pekerjaan belum selesai, padahal badge detail mesin sudah memperlakukan status tersebut sebagai belum tuntas. Angka lini dan aging dapat bertentangan.

**Perbaikan:** definisikan predicate status aktif bersama, termasuk fase menunggu konfirmasi Operator sebagai kategori terpisah. Gunakan di seluruh agregasi dan filter.

### AUD-16 — Waktu closing tidak terpisah dari waktu aktual mesin hidup

**Bukti:** `apps/api/internal/db/db.go:376`; `OperatorDashboard.tsx:505`; `apps/api/internal/domain/openwork.go` fungsi `ValidateTimelineInvariant`.

Database mengisi `waktu_ditutup` dan `waktu_mesin_beroperasi` dari timestamp yang sama. Closing terlambat menghilangkan waktu administrasi sebenarnya. Validasi hanya membandingkan resume terhadap awal breakdown; timestamp masa depan atau sebelum selesai perbaikan tidak dicegah pada jalur tersebut. Parse gagal di beberapa helper diperlakukan seolah valid atau diganti waktu sekarang.

**Perbaikan:** simpan timestamp submit server, actual resume terkonfirmasi, dan akhir pengerjaan sebagai event berbeda; validasi urutan, format dan alasan koreksi/backdate.

### AUD-17 — Pendaftaran part dapat menghapus posisi lain

**Bukti:** `AdminDashboard.tsx:1220`.

Filter penggantian entry monitoredParts menggunakan mesin + ID/nama part, tidak memasukkan posisi. Verifikasi part sejenis di Line 2 dapat menghapus pemasangan Line 1. ID master juga dipakai sebagai ID pemasangan, sehingga identitas part katalog dan instalasi tidak terpisah.

**Perbaikan:** installed-part ID tersendiri, kunci mesin/posisi yang eksplisit, dan replacement event tanpa menghapus instalasi posisi lain.

### AUD-18 — Idempotency tidak atomik dan tidak tahan restart

**Bukti:** `apps/api/internal/server/middleware.go:205`, `:225`, `:250`; `handlers.go:167`.

Check dan Save masing-masing terkunci, tetapi operasi bisnis di antaranya tidak melakukan reservation. Dua request bersamaan dengan key sama dapat sama-sama lolos Check. Record hanya disimpan di map proses; restart/replika lain tidak mengetahui request sebelumnya. Tabel migrasi tidak berarti jalur runtime sudah memakainya.

**Perbaikan:** key+payload+hasil tersimpan di database, unique constraint dan reservation transaksional, serta pemulihan status request yang belum pasti. Verifikasi dengan uji concurrency dan restart terisolasi.

### AUD-19 — Audit trail tidak memiliki jaminan persistensi dan identitas

**Bukti:** `middleware.go` `ObservabilityCollector.RecordAudit`; `database/migrations/004_audit_idempotency_and_optimistic_lock.sql:27`; penyimpanan koreksi/void frontend.

Audit server disimpan dalam kolektor memori; jalur repository yang diperiksa tidak menulis tabel audit_trail. Audit browser dapat diubah/dihapus dan ikut reset. Aktor diambil dari input/sesi browser, dan beberapa timestamp/metadata audit UI bersifat buatan. Ini tidak cukup untuk menjamin klaim keterlacakan permanen.

**Perbaikan:** event audit persisten dalam transaksi bisnis, aktor dari autentikasi server, timestamp server, aturan akses dan retensi. Hindari label kepatuhan sebelum mekanismenya terpenuhi.

### AUD-23 — Pengambilan pekerjaan belum memiliki klaim pemilik atomik

**Bukti:** `TechnicianDashboard.tsx:1704`; `:757`; alur `updateWorkStatus`.

Pengambilan breakdown dan mulai PM menulis status/pelaksana dari browser tanpa pemeriksaan versi/pemilik server. Dua teknisi dapat melihat antrean lama dan mengambil pekerjaan sama. Pembaruan status berikutnya juga tidak memakai conditional write terhadap status/versi terbaru; snapshot lama dapat mengembalikan status yang lebih maju.

**Perbaikan:** claim transaksional jika belum ada pemilik, actor dari sesi, expected_version untuk mutasi, dan respons konflik dengan refresh. Pengujian harus memakai dua klien, bukan satu render saja.

## P2 — ketepatan tambahan dan keterlacakan

### AUD-20 — Alasan perubahan PM bisa hilang dan status pengerjaan disederhanakan

**Bukti:** `SupervisorPMPlanner.tsx:46`; `SupervisorDashboard.tsx` tabel PM.

Form meminta alasan untuk semua edit, tetapi alasan disimpan ke riwayat hanya ketika tanggal berubah. Edit kegiatan/periode tanpa perubahan tanggal kehilangan alasan dan aktor. Tabel Supervisor juga tidak memiliki cabang DALAM_PENGERJAAN sehingga status tersebut dapat ditampilkan sebagai Terjadwal.

**Perbaikan:** audit setiap perubahan field dengan nilai sebelum/sesudah, serta pemetaan status lengkap dan konsisten.

### AUD-21 — Jumlah mesin dihitung dari jumlah tiket

**Bukti:** `SupervisorDashboard.tsx:2247` dan `:2259`.

Jumlah mesin dianggap total mesin dikurangi jumlah tiket OPEN, bukan jumlah mesin unik. Dua tiket pada satu mesin mengurangi dua mesin. `Math.max(1, ...)` memaksa setidaknya satu mesin tersisa. Pada cabang gangguan, ringkasan masih menyebut mesin “siap operasi” meskipun tidak ada konfirmasi operasi.

**Perbaikan:** hitung set ID mesin unik dan pisahkan metrik tiket dari kondisi operasi; nol harus boleh tampil jika memang benar.

### AUD-22 — Ketepatan pelaporan dan versi laporan memakai nilai simulasi

**Bukti:** `SupervisorDashboard.tsx:6883`, `:6496`, `:1791`.

Jam submit aktual ditulis sebagai string tetap, dengan Shift 3 menggunakan cabang jam Shift 2. Tidak berasal dari event submit. Laporan awal tanpa revisi menampilkan Rev -1. Shift aktif di-memo berdasarkan kategori hari tanpa clock yang memicu pembaruan, sehingga dapat tertinggal saat halaman dibiarkan terbuka.

**Perbaikan:** timestamp submit dan nomor revisi dari record laporan persisten; kategori hari ditentukan kalender, dan clock UI harus memperbarui shift tanpa menulis ulang histori.

## Urutan pengerjaan yang disarankan

1. **Lindungi data dan identitas:** hentikan reset otomatis, perbaiki ID closing, autentikasi/otorisasi server; pisahkan demonstrasi dari mode operasional.
2. **Satukan penyimpanan:** server sebagai sumber utama, kontrak data tunggal, versioning, klaim pekerjaan dan idempotency transaksional.
3. **Benarkan workflow:** status tiket/operasi terpisah, closing dan waktu resume, penugasan teknisi, PM dan histori perubahan.
4. **Benarkan kalkulasi:** lifecycle penggantian part/lifetime, PM compliance, durasi maintenance dan KPI.
5. **Benarkan pelaporan:** scope tanggal/shift, bukti kelengkapan, dispatch aktual, revisi dan audit permanen.

## Kriteria uji penerimaan setelah perbaikan

- Dua perangkat membaca tiket/PM/part yang sama; restart tidak menghilangkan catatan.
- HTTP 401/403 benar-benar menolak aksi dan UI tidak mengaku sukses.
- ID mesin tidak pernah dipakai sebagai ID tiket; pasangan ID/nomor salah ditolak.
- Dua teknisi mengambil pekerjaan bersamaan: tepat satu berhasil, yang lain menerima konflik.
- Selesai teknisi tidak menyatakan mesin aman; resume aktual dan closing administratif tercatat terpisah.
- Tiket menunggu part tetap muncul pada backlog/aging; tidak dihitung sebagai mesin sehat.
- Laporan Shift 2 tidak membawa tiket historis Shift 1 kecuali handover yang memang terkait.
- SENT hanya setelah dispatch tersimpan; kegagalan Discord ditampilkan sebagai gagal, bukan lengkap terkirim.
- PM selesai terlambat tidak dihitung tepat waktu; PM mendatang tidak menurunkan compliance periode saat ini.
- Penggantian kedua mereset baseline instalasi terbaru tanpa menghapus riwayat atau posisi lain.
- Part kalender 90 hari melewati 80%/100% sesuai tanggal nyata; part jam operasi memakai delta meter terverifikasi.
- Semua mutasi memiliki aktor terverifikasi, timestamp server, before/after dan jejak persisten.
