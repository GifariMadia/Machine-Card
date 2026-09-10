INSERT INTO mesin (kode_mesin, nama_mesin, section)
SELECT kode_mesin, nama_mesin,
  CASE section
    WHEN 'Chimei' THEN 'Packaging'
    WHEN 'Ilapak' THEN 'Filling'
    WHEN 'Jinsung & Jih Cheng' THEN 'Packaging'
    WHEN 'ST (Sachet)' THEN 'Compounding / Filling'
    WHEN 'SIG & JOYEA' THEN 'Filling / Packaging'
    ELSE 'Production Support'
  END
FROM (VALUES
('CHI-01', 'Chimei 10A/Jinsung 3', 'Chimei', 1),
('CHI-02', 'Chimei 11A/Jinsung 4', 'Chimei', 2),
('CHI-03', 'Chimei 12A/Jinsung 1', 'Chimei', 3),
('CHI-04', 'Chimei 1B/SIG 6', 'Chimei', 4),
('CHI-05', 'Chimei 4/Yonan', 'Chimei', 5),
('CHI-06', 'Chimei 4B/Jinsung 2', 'Chimei', 6),
('CHI-07', 'Chimei 5A/Ilapak 5', 'Chimei', 7),
('CHI-08', 'Chimei 5B/Unifill B', 'Chimei', 8),
('CHI-09', 'Chimei 6/Ilapak 1', 'Chimei', 9),
('CHI-10', 'Chimei 8A/Ilapak 8', 'Chimei', 10),
('CHI-11', 'Chimei 9A/Ilapak 11', 'Chimei', 11),
('ILA-01', 'Ilapak 1', 'Ilapak', 12),
('ILA-02', 'Ilapak 2', 'Ilapak', 13),
('ILA-03', 'Ilapak 3', 'Ilapak', 14),
('ILA-04', 'Ilapak 4', 'Ilapak', 15),
('ILA-05', 'Ilapak 5', 'Ilapak', 16),
('ILA-06', 'Ilapak 6', 'Ilapak', 17),
('ILA-07', 'Ilapak 7', 'Ilapak', 18),
('ILA-08', 'Ilapak 8', 'Ilapak', 19),
('ILA-09', 'Ilapak 9', 'Ilapak', 20),
('ILA-10', 'Ilapak 10', 'Ilapak', 21),
('ILA-11', 'Ilapak 11', 'Ilapak', 22),
('ILA-12', 'Ilapak 12', 'Ilapak', 23),
('JIN-01', 'Jinsung 1', 'Jinsung & Jih Cheng', 24),
('JIN-02', 'Jinsung 2', 'Jinsung & Jih Cheng', 25),
('JIN-03', 'Jinsung 3', 'Jinsung & Jih Cheng', 26),
('JIN-04', 'Jinsung 4', 'Jinsung & Jih Cheng', 27),
('JIN-05', 'Jinsung 5', 'Jinsung & Jih Cheng', 28),
('JHC-01', 'Jih Cheng Tube', 'Jinsung & Jih Cheng', 29),
('ST-03', 'ST 3 RCL 3', 'ST (Sachet)', 30),
('ST-04', 'ST 4 RCL 1', 'ST (Sachet)', 31),
('ST-06', 'ST 6 RCL 3', 'ST (Sachet)', 32),
('ST-10', 'ST 10 RCL 1', 'ST (Sachet)', 33),
('ST-12', 'ST 12 RCL 1', 'ST (Sachet)', 34),
('ST-15', 'ST 15 RCL 1', 'ST (Sachet)', 35),
('SIG-05', 'SIG 5', 'SIG & JOYEA', 36),
('SIG-06', 'SIG 6', 'SIG & JOYEA', 37),
('JOY-01', 'JOYEA', 'SIG & JOYEA', 38),
('JOY-02', 'JOYEA Cartoning', 'SIG & JOYEA', 39),
('OTH-01', 'Filling Liquid 1', 'Lainnya', 40),
('OTH-02', 'MT Silverson', 'Lainnya', 41),
('OTH-03', 'Temach', 'Lainnya', 42),
('OTH-04', 'Unifill B', 'Lainnya', 43)
) AS seed(kode_mesin, nama_mesin, section, urutan)
ON CONFLICT (kode_mesin) DO UPDATE SET
  nama_mesin = EXCLUDED.nama_mesin,
  section = EXCLUDED.section;
