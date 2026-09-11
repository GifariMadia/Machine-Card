BEGIN;

-- Izinkan status SELESAI_PERBAIKAN pada open_work agar operator tahu mesin sudah selesai diperbaiki teknisi dan siap running test / closing
ALTER TABLE open_work DROP CONSTRAINT IF EXISTS open_work_status_check;
ALTER TABLE open_work ADD CONSTRAINT open_work_status_check CHECK (status IN ('OPEN', 'IN_PROGRESS', 'SELESAI_PERBAIKAN', 'CLOSED'));

-- Tambahkan kolom tracking penutupan tiket oleh operator (termasuk skenario ganti shift)
ALTER TABLE open_work ADD COLUMN IF NOT EXISTS id_penutup BIGINT REFERENCES pengguna(id_pengguna);
ALTER TABLE open_work ADD COLUMN IF NOT EXISTS shift_penutup SMALLINT CHECK (shift_penutup BETWEEN 1 AND 3);
ALTER TABLE open_work ADD COLUMN IF NOT EXISTS waktu_mesin_beroperasi TIMESTAMPTZ;
ALTER TABLE open_work ADD COLUMN IF NOT EXISTS catatan_closing_operator TEXT;

-- Tambahkan kolom pada breakdown untuk rekonsiliasi downtime operasional vs perbaikan teknisi
ALTER TABLE breakdown ADD COLUMN IF NOT EXISTS waktu_mesin_beroperasi TIMESTAMPTZ;
ALTER TABLE breakdown ADD COLUMN IF NOT EXISTS id_operator_penutup BIGINT REFERENCES pengguna(id_pengguna);
ALTER TABLE breakdown ADD COLUMN IF NOT EXISTS shift_penutup SMALLINT CHECK (shift_penutup BETWEEN 1 AND 3);
ALTER TABLE breakdown ADD COLUMN IF NOT EXISTS durasi_perbaikan_teknisi_jam NUMERIC(12,4);

CREATE INDEX IF NOT EXISTS idx_open_work_status_waktu ON open_work(status, waktu_dibuka);
CREATE INDEX IF NOT EXISTS idx_breakdown_tanggal_shift ON breakdown(tanggal, shift);
CREATE INDEX IF NOT EXISTS idx_breakdown_kategori ON breakdown(kategori_breakdown);

COMMIT;
