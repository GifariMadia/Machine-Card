BEGIN;

-- 1. Optimistic Concurrency Control (Bab 19 & Lab 2): Kolom version untuk mencegah lost update pada tiket & breakdown
ALTER TABLE open_work ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;
ALTER TABLE breakdown ADD COLUMN IF NOT EXISTS version INT NOT NULL DEFAULT 1;

-- 2. Invariant Temporal Database (Bab 2 & Bab 18): Waktu mesin beroperasi kembali tidak boleh sebelum waktu tiket dibuka
ALTER TABLE open_work DROP CONSTRAINT IF EXISTS open_work_waktu_beroperasi_check;
ALTER TABLE open_work ADD CONSTRAINT open_work_waktu_beroperasi_check
    CHECK (waktu_mesin_beroperasi IS NULL OR waktu_mesin_beroperasi >= waktu_dibuka);

-- 3. Idempotency Store (Bab 17 & Lab 3): Menyimpan scope + key + payload fingerprint + hasil secara durabel
CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope VARCHAR(100) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    payload_hash VARCHAR(64) NOT NULL,
    response_status INT NOT NULL,
    response_body JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '24 hours'),
    PRIMARY KEY (scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_expires_at ON idempotency_keys(expires_at);

-- 4. Durable Audit Trail GxP ALCOA+ (Bab 33): Mencatat pelaku, aksi, objek, waktu, request_id, dan hasil
CREATE TABLE IF NOT EXISTS audit_trail (
    id_audit BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    request_id VARCHAR(64) NOT NULL,
    actor_nik VARCHAR(50) NOT NULL,
    actor_role VARCHAR(30) NOT NULL,
    action VARCHAR(80) NOT NULL,
    entity_type VARCHAR(50) NOT NULL,
    entity_id VARCHAR(64) NOT NULL,
    status_code INT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_audit_trail_created_at ON audit_trail(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_actor ON audit_trail(actor_nik, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_trail_entity ON audit_trail(entity_type, entity_id);

-- 5. Foreign Key & Query Plan Indexes (Bab 18 & Bab 20): PostgreSQL tidak otomatis membuat index pada FK
CREATE INDEX IF NOT EXISTS idx_open_work_id_mesin ON open_work(id_mesin);
CREATE INDEX IF NOT EXISTS idx_open_work_id_pembuat ON open_work(id_pembuat);
CREATE INDEX IF NOT EXISTS idx_open_work_id_penutup ON open_work(id_penutup);
CREATE INDEX IF NOT EXISTS idx_catatan_pengerjaan_id_work ON catatan_pengerjaan(id_work);
CREATE INDEX IF NOT EXISTS idx_catatan_pengerjaan_id_teknisi ON catatan_pengerjaan(id_teknisi);
CREATE INDEX IF NOT EXISTS idx_penggantian_part_id_catatan ON penggantian_part(id_catatan);

COMMIT;
