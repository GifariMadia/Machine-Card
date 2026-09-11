CREATE OR REPLACE VIEW monitoring_lifetime_part AS
WITH dasar AS (
    SELECT
        pm.id_part_mesin,
        m.id_mesin,
        m.nama_mesin,
        m.section,
        mp.nama_part,
        mp.spesifikasi,
        pm.posisi_part,
        pm.klasifikasi,
        pm.status_kelengkapan,
        pm.lifetime_hari,
        al.aktif AS aturan_aktif,
        terakhir.waktu_penggantian,
        pm.lifetime_hari * al.persentase_batas_penggantian / 100.0 AS interval_penggantian_hari,
        al.persentase_awal_peringatan
    FROM part_mesin pm
    JOIN mesin m ON m.id_mesin = pm.id_mesin
    JOIN master_part mp ON mp.id_part = pm.id_part
    LEFT JOIN aturan_lifetime al ON al.id_aturan = pm.id_aturan
    LEFT JOIN LATERAL (
        SELECT pp.waktu_penggantian
        FROM penggantian_part pp
        WHERE pp.id_part_mesin = pm.id_part_mesin
        ORDER BY pp.waktu_penggantian DESC, pp.id_penggantian DESC
