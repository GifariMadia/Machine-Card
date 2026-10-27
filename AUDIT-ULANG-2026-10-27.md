# Audit ulang Machine Card — 27 Oktober 2026

## Kesimpulan

Ditemukan 6 kelompok masalah: 3 prioritas P1 dan 3 prioritas P2. Build dan seluruh pengujian yang dijalankan berhasil, tetapi cakupan tes belum membuktikan seluruh kontrol pada jalur produksi. Temuan terpenting adalah arsip kode dan cadangan database dapat diakses tanpa login melalui server Vite yang sedang berjalan.

Audit ini memeriksa sumber frontend/backend, konfigurasi yang benar-benar dimuat, pengujian otomatis, serta HTTP lokal. Tidak mengubah data operasional, mengirim Discord nyata, atau melakukan perbaikan kode produksi. Uji PostgreSQL menggunakan skema sementara dengan pembersihan otomatis. Direktori ini tidak memiliki repository Git sehingga perbandingan terhadap commit sebelumnya tidak tersedia.

## Temuan

### RA-01 — P1: Cadangan kode dan database disajikan tanpa autentikasi

Lokasi: `apps/web/vite.config.js:6–8`, dibandingkan `apps/web/vite.config.ts`.

Vite memuat `vite.config.js`, bukan konfigurasi TypeScript yang berisi pembatasan host dan larangan akses direktori privat. Pemeriksaan menggunakan API `resolveConfig` menghasilkan `host:true`, `allowedHosts:true`, dan daftar larangan bawaan tanpa `.audit-backups`. Ini juga sesuai dengan server aktif yang mengumumkan alamat jaringan.

Bukti HTTP tanpa cookie, menggunakan HEAD saja tanpa mengambil isi cadangan:

- `/@fs/C:/Users/ASUS/Workspace/02_projects/web/fullstack/Machine%20Card/.audit-backups/before-fixes-20261026.zip`: **200**, `application/zip`, 315440 byte.
- `/@fs/C:/Users/ASUS/Workspace/02_projects/web/fullstack/Machine%20Card/.audit-backups/database-before-runtime-fixes-20261026.dump`: **200**, `application/octet-stream`, 66865 byte.

Siapa pun yang dapat menjangkau port Vite dan mengetahui/menebak jalur tersebut dapat memperoleh cadangan. Audit ini tidak mengunduh atau memeriksa isinya dan tidak membuktikan bahwa pihak lain sudah mengaksesnya.

Perbaikan: hapus konflik konfigurasi, pastikan skrip menunjuk konfigurasi yang diperkeras, bind localhost untuk penggunaan lokal, blokir cadangan/berkas privat, dan pindahkan cadangan keluar dari akar yang dapat disajikan. Setelah restart, ulangi HEAD dan pastikan 403/404 serta cek alamat listener.

### RA-02 — P1: Teknisi penerus tidak dapat mengambil pekerjaan milik teknisi shift sebelumnya

Lokasi: `apps/api/internal/db/document_policy.go:186–192`; alur UI `apps/web/src/TechnicianDashboard.tsx:1630` dan `:1756`.

Validasi menolak perubahan oleh teknisi lain setiap kali `technicianNik` lama terisi. UI handover hanya menambahkan catatan dan tetap mempertahankan pemilik. Ketika teknisi berikutnya mencoba mengambil/melanjutkan tiket, server mengembalikan konflik, meskipun tiket memang perlu diteruskan lintas shift.

Bukti: tes tambahan mereproduksi perpindahan tiket IN_PROGRESS dari T1 ke T2 yang ditolak `ErrConflict`. Pembatasan claim serentak memang diperlukan, tetapi perlu transaksi transfer kepemilikan yang eksplisit agar alur handover sah tetap berfungsi.

Perbaikan: tambahkan aksi handover dengan penerima, alasan, versi tiket, dan audit; tentukan siapa yang dapat menerima serta kapan pemilik berubah. Pertahankan larangan pengambilalihan biasa.

### RA-03 — P1: Durasi negatif dari teknisi diterima dan dapat mengubah KPI server

Lokasi: `apps/api/internal/db/document_policy.go:202`, `apps/api/internal/db/document_timestamps.go:78–84`.

Teknisi boleh mengubah `durasiTungguMenit` tanpa validasi nilai numerik/nonnegatif. Saat pekerjaan selesai, server menghitung menit perbaikan sebagai selisih waktu dikurangi nilai tunggu dari klien. Nilai negatif memperbesar durasi perbaikan; nilai terlalu besar dapat membuat durasi menjadi nol. Pembatasan minimum nol pada hasil tidak menyelesaikan input negatif.

Bukti: transisi IN_PROGRESS ke SELESAI_PERBAIKAN dengan `durasiTungguMenit:-999999` diterima validator. Tidak ada validasi lanjutan terhadap durasi ini sebelum canonicalDocument menghitung dan menyimpan hasil.

Perbaikan: validasi semua durasi dan batas terhadap interval aktual; hitung waktu tunggu dari transisi bertimestamp server. Batasi koreksi manual pada peran yang berwenang dengan alasan wajib.

### RA-04 — P2: Koreksi Supervisor tidak memerlukan alasan pada server

Lokasi: `apps/api/internal/db/document_policy.go:205–222`.

Supervisor dapat mengubah durasi, kategori, dan waktu mulai tanpa menyertakan `changeReason`. Field tersebut hanya diizinkan, bukan diwajibkan. Pembatalan VOID memerlukan alasan, tetapi koreksi biasa tidak. Audit transaksi tetap mencatat aktor dan before/after; alasan bisnis perubahan dapat hilang.

Bukti: perubahan `durasiPerbaikanMenit` tiket CLOSED dari 10 menjadi 9999 tanpa alasan diterima validator. Ini tidak sesuai klaim penyelesaian audit sebelumnya bahwa koreksi penting selalu mencantumkan alasan.

Perbaikan: wajibkan alasan bermakna ketika field terkontrol berubah dan periksa timeline setelah koreksi. Terapkan pemeriksaan pada endpoint produksi `/api/state`.

### RA-05 — P2: Middleware keamanan, pembatasan request, dan telemetry tidak membungkus endpoint runtime

Lokasi: `apps/api/internal/server/server.go:41–50`, `apps/api/internal/server/runtime.go:63–138` dan `:182`.

Rantai CORS, request ID/logging, header keamanan, dan rate limiter dibangun untuk router core. SecureRouter kemudian mendaftarkan `/api/state`, `/api/events`, dan endpoint sesi di mux luar. Request ke handler tersebut tidak melewati rantai core. Autentikasi dan pemeriksaan origin tetap berjalan, serta `/api/state` memiliki batas body sendiri; masalahnya adalah proteksi/telemetry lain tidak diterapkan konsisten.

Dampak: operasi state dan audit tidak masuk metrik request core, tidak menerima header keamanan/request ID yang sama, dan tidak terkena rate limiter global. Hal ini menyulitkan deteksi gangguan dan memungkinkan request intensif terhadap database tanpa pembatasan aplikasi yang dimaksudkan.

Perbaikan: bungkus router final dengan middleware bersama, lalu pisahkan limiter login dan limiter endpoint yang membutuhkan kebijakan khusus. Tambahkan tes HTTP terhadap router final.

### RA-06 — P2: Closing shift mempercayai deklarasi klien tanpa verifikasi kelengkapan server

Lokasi: `apps/api/internal/db/document_policy.go:59–86`; `apps/api/internal/server/shift_worker.go` pada pemeriksaan `closure.Complete`.

Validator closing memeriksa kepemilikan prefiks key, tanggal tidak di masa depan, keanggotaan shift, dan `complete:true`. Server tidak mencocokkan tanggal/shift dalam value dengan suffix key atau menghitung kembali kelengkapan laporan dari tiket/catatan. Worker memakai deklarasi Complete sebagai bukti teknisi sudah melapor.

Bukti: key untuk T1 pada 26 Oktober menerima value bertanggal 25 Oktober selama shift sesuai dan Complete bernilai true. Pemeriksaan kode juga menunjukkan tidak ada query/verifikasi isi laporan pada jalur validasi closing. Dengan request langsung, pengguna terautentikasi dapat mendeklarasikan selesai tanpa memenuhi pemeriksaan UI.

Perbaikan: gunakan aksi closing eksplisit dengan identitas/tanggal/shift terstruktur, cocokkan key/value, validasi seluruh persyaratan laporan di transaksi server, lalu hasilkan flag complete dari hasil pemeriksaan tersebut.

## Hasil verifikasi

| Pemeriksaan | Hasil |
| --- | --- |
| `npm test` | Go tests lulus; frontend 107/107, 13 berkas |
| `npm run build` | API dan frontend berhasil |
| `npx vitest run --config audit/vitest.config.ts` | 6/6 lulus |
| `MC_DB_INTEGRATION=1 go test -count=1 ./...` | Lulus, termasuk 5 tes integrasi PostgreSQL |
| `go vet ./...` | Lulus |
| `go test ./internal/db -run TestReaudit20261027Evidence -v` | 4 reproduksi perilaku cacat terkonfirmasi |
| Resolusi konfigurasi Vite | Memuat vite.config.js yang lebih terbuka |
| HEAD cadangan tanpa login | Kedua cadangan mendapat 200 |

Tes bukti tambahan disimpan di `apps/api/internal/db/reaudit_20261027_test.go`. Tes ini sengaja mendokumentasikan perilaku cacat saat ini: status PASS berarti cacat berhasil direproduksi, bukan sudah diperbaiki. Balik ekspektasinya ketika perbaikan diimplementasikan.

Sebagian besar tes HTTP lama di `server_test.go` membuat router sendiri dengan handler legacy. Endpoint legacy tersebut mengembalikan 410 pada router produksi. Tes UI juga memakai mode penyimpanan lokal khusus test. Karena itu, angka tes lulus harus dilengkapi pengujian lintas peran terhadap `/api/state` dan router final.

Build menghasilkan JS utama 727,28 kB (gzip 170,29 kB), dengan peringatan chunk melebihi 500 kB. Ini peluang optimasi setelah temuan akses cadangan dan integritas transaksi diselesaikan.

## Batas pemeriksaan

Belum dilakukan uji manual seluruh browser/peran, uji beban, pemulihan cadangan, pengiriman Discord nyata, atau pemindaian dependensi terhadap advisori terkini. Tidak ada klaim bahwa audit ini merupakan penilaian keamanan menyeluruh atau membuktikan adanya kebocoran sebelumnya. Kode produksi belum diperbaiki dalam pekerjaan audit ini.
