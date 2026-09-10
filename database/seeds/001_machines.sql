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
