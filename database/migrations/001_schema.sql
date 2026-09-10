BEGIN;

CREATE TABLE pengguna (
    id_pengguna BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nama VARCHAR(100) NOT NULL,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    peran VARCHAR(20) NOT NULL CHECK (peran IN ('ADMIN', 'OPERATOR', 'TEKNISI')),
    aktif BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE mesin (
    id_mesin BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    kode_mesin VARCHAR(50) NOT NULL UNIQUE,
    nama_mesin VARCHAR(100) NOT NULL,
    section VARCHAR(100) NOT NULL,
    status_mesin VARCHAR(20) NOT NULL DEFAULT 'AKTIF' CHECK (status_mesin IN ('AKTIF', 'NONAKTIF'))
);

CREATE TABLE akses_mesin (
    id_operator BIGINT NOT NULL REFERENCES pengguna(id_pengguna),
    id_mesin BIGINT NOT NULL REFERENCES mesin(id_mesin),
    boleh_open_work BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY (id_operator, id_mesin)
);

CREATE TABLE open_work (
    id_work BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nomor_work VARCHAR(50) NOT NULL UNIQUE,
    id_mesin BIGINT REFERENCES mesin(id_mesin),
    id_pembuat BIGINT NOT NULL REFERENCES pengguna(id_pengguna),
    jenis_pekerjaan VARCHAR(30) NOT NULL CHECK (jenis_pekerjaan IN ('BREAKDOWN', 'PM', 'PBJT', 'WORKSHOP', 'OTHER')),
    keluhan_atau_pekerjaan TEXT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'IN_PROGRESS', 'CLOSED')),
    waktu_dibuka TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    waktu_selesai_perbaikan TIMESTAMPTZ,
    waktu_ditutup TIMESTAMPTZ,
    UNIQUE (id_work, id_mesin),
    CHECK (jenis_pekerjaan <> 'BREAKDOWN' OR id_mesin IS NOT NULL),
    CHECK (waktu_selesai_perbaikan IS NULL OR waktu_selesai_perbaikan >= waktu_dibuka),
    CHECK (waktu_ditutup IS NULL OR (waktu_selesai_perbaikan IS NOT NULL AND waktu_ditutup >= waktu_selesai_perbaikan)),
    CHECK ((status = 'CLOSED' AND waktu_ditutup IS NOT NULL) OR (status <> 'CLOSED' AND waktu_ditutup IS NULL))
);

CREATE TABLE breakdown (
    id_breakdown BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_work BIGINT NOT NULL UNIQUE,
    tanggal DATE NOT NULL,
    bulan VARCHAR(20) GENERATED ALWAYS AS (EXTRACT(YEAR FROM tanggal)::INTEGER::TEXT || '-' || LPAD(EXTRACT(MONTH FROM tanggal)::INTEGER::TEXT, 2, '0')) STORED,
    shift SMALLINT NOT NULL CHECK (shift BETWEEN 1 AND 3),
