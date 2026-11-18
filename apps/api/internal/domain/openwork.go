package domain

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

var (
	ErrInvalidTransition = errors.New("transisi status tiket tidak sah")
	ErrInvalidTimeline   = errors.New("waktu selesai/beroperasi tidak boleh lebih awal dari waktu mulai breakdown")
)

type OpenWorkRequest struct {
	IDMesin           int64   `json:"id_mesin"`
	NIKPelapor        string  `json:"nik_pelapor"`
	Shift             int     `json:"shift"`
	Keterangan        string  `json:"keterangan"`
	KodeProduk        *string `json:"kode_produk"`
	NoBatch           *string `json:"no_batch"`
	WaktuMulai        string  `json:"waktu_mulai"`
	WaktuSelesai      *string `json:"waktu_selesai"`
	NoWorkRequest     *string `json:"no_work_request"`
	TipeWO            string  `json:"tipe_wo"`
	KategoriBreakdown *string `json:"kategori_breakdown"`
}

type OpenWorkResult struct {
	IDWork      int64     `json:"id_work"`
	NomorWork   string    `json:"nomor_work"`
	Status      string    `json:"status"`
	WaktuDibuka time.Time `json:"waktu_dibuka"`
	Version     int       `json:"version,omitempty"`
}

type OpenWorkCloseRequest struct {
	IDWork               int64  `json:"id_work"`
	NomorWork            string `json:"nomor_work"`
	NIKOperator          string `json:"nik_operator"`
	Shift                int    `json:"shift"`
	WaktuMesinBeroperasi string `json:"waktu_mesin_beroperasi"`
	CatatanClosing       string `json:"catatan_closing"`
	ExpectedVersion      *int   `json:"expected_version,omitempty"`
}

type DetailedTicketItem struct {
	IDWork               int64    `json:"id_work"`
	NomorWork            string   `json:"nomor_work"`
	IDMesin              int64    `json:"id_mesin"`
	KodeMesin            string   `json:"kode_mesin"`
	NamaMesin            string   `json:"nama_mesin"`
	Section              string   `json:"section"`
	PelaporNIK           string   `json:"pelapor_nik"`
	PelaporNama          string   `json:"pelapor_nama"`
	ShiftLapor           int      `json:"shift_lapor"`
	WaktuMulaiBreakdown  string   `json:"waktu_mulai_breakdown"`
	Keterangan           string   `json:"keterangan"`
	KategoriBreakdown    string   `json:"kategori_breakdown"`
	TipeWO               string   `json:"tipe_wo"`
	KodeProduk           string   `json:"kode_produk,omitempty"`
	NoBatch              string   `json:"no_batch,omitempty"`
	NoWorkRequest        string   `json:"no_work_request,omitempty"`
	Status               string   `json:"status"` // 'OPEN' | 'IN_PROGRESS' | 'PENDING' | 'MENUNGGU_PART' | 'MENUNGGU_DUKUNGAN' | 'SELESAI_PERBAIKAN' | 'CLOSED'
	Version              int      `json:"version,omitempty"`
	WaktuMulaiTeknisi    *string  `json:"waktu_mulai_teknisi,omitempty"`
	WaktuSelesaiTeknisi  *string  `json:"waktu_selesai_teknisi,omitempty"`
	TeknisiNIK           *string  `json:"teknisi_nik,omitempty"`
	TeknisiNama          *string  `json:"teknisi_nama,omitempty"`
	TindakanTeknisi      *string  `json:"tindakan_teknisi,omitempty"`
	AlasanPenundaan      *string  `json:"alasan_penundaan,omitempty"`
	WaktuMulaiTunggu     *string  `json:"waktu_mulai_tunggu,omitempty"`
	DurasiTungguMenit    *float64 `json:"durasi_tunggu_menit,omitempty"`
	PenutupNIK           *string  `json:"penutup_nik,omitempty"`
	PenutupNama          *string  `json:"penutup_nama,omitempty"`
	ShiftPenutup         *int     `json:"shift_penutup,omitempty"`
	WaktuMesinBeroperasi *string  `json:"waktu_mesin_beroperasi,omitempty"`
	CatatanClosing       *string  `json:"catatan_closing,omitempty"`
	DurasiDowntimeMenit  *float64 `json:"durasi_downtime_menit,omitempty"`
	DurasiPerbaikanMenit *float64 `json:"durasi_perbaikan_menit,omitempty"`
	DurasiResponMenit    *float64 `json:"durasi_respon_menit,omitempty"`
	IsShiftHandover      bool     `json:"is_shift_handover"`
	OriginalOpenedAt     *string  `json:"original_opened_at,omitempty"`
	KondisiTerakhir      *string  `json:"kondisi_terakhir,omitempty"`
	RencanaTindakLanjut  *string  `json:"rencana_tindak_lanjut,omitempty"`
	StatusHistory        []StatusHistoryEntry   `json:"status_history,omitempty"`
	RiwayatHandover      []HandoverHistoryEntry `json:"riwayat_handover,omitempty"`
}

// StatusHistoryEntry merepresentasikan keterlacakan riwayat perubahan status tiket (URS 5.1).
type StatusHistoryEntry struct {
	FromStatus string `json:"from_status"`
	ToStatus   string `json:"to_status"`
	ChangedBy  string `json:"changed_by"`
	ChangedAt  string `json:"changed_at"`
	Reason     string `json:"reason,omitempty"`
}

// HandoverHistoryEntry merepresentasikan catatan serah-terima pekerjaan lanjutan lintas shift (URS 5.3).
type HandoverHistoryEntry struct {
	Shift         string `json:"shift"`
	Tanggal       string `json:"tanggal"`
	PelaksanaNIK  string `json:"pelaksana_nik"`
	PelaksanaNama string `json:"pelaksana_nama"`
	Progres       string `json:"progres"`
	Kendala       string `json:"kendala"`
	TindakLanjut  string `json:"tindak_lanjut"`
	WaktuDicatat  string `json:"waktu_dicatat"`
}

// ValidateTicketTransition menerapkan State Machine bisnis eksplisit (Bab 17 & URS 3.2, 5.1):
// OPEN -> IN_PROGRESS | PENDING | SELESAI_PERBAIKAN | CLOSED | MENUNGGU_PART | MENUNGGU_DUKUNGAN
// IN_PROGRESS -> PENDING | SELESAI_PERBAIKAN | CLOSED | MENUNGGU_PART | MENUNGGU_DUKUNGAN
// PENDING -> IN_PROGRESS | SELESAI_PERBAIKAN | CLOSED | MENUNGGU_PART
// MENUNGGU_PART -> IN_PROGRESS | PENDING | SELESAI_PERBAIKAN
// MENUNGGU_DUKUNGAN -> IN_PROGRESS | PENDING | SELESAI_PERBAIKAN
// SELESAI_PERBAIKAN -> CLOSED | IN_PROGRESS (rework jika gagal running test)
// CLOSED -> Terminal state (tidak dapat ditutup ulang atau dikembalikan ke OPEN)
func ValidateTicketTransition(currentStatus, targetStatus, actorRole string) error {
	from := strings.ToUpper(strings.TrimSpace(currentStatus))
	to := strings.ToUpper(strings.TrimSpace(targetStatus))
	role := strings.ToUpper(strings.TrimSpace(actorRole))

	if from == "CLOSED" {
		return fmt.Errorf("%w: tiket sudah berstatus CLOSED dan tidak dapat diubah lagi", ErrInvalidTransition)
	}

	if to == "CLOSED" && role != "" && role != "OPERATOR" && role != "ADMIN" {
		return fmt.Errorf("%w: penutupan akhir tiket (mesin beroperasi) hanya boleh dilakukan oleh OPERATOR atau ADMIN", ErrInvalidTransition)
	}

	validTargets, ok := map[string][]string{
		"OPEN":              {"IN_PROGRESS", "PENDING", "SELESAI_PERBAIKAN", "CLOSED", "MENUNGGU_PART", "MENUNGGU_DUKUNGAN"},
		"IN_PROGRESS":       {"PENDING", "SELESAI_PERBAIKAN", "CLOSED", "MENUNGGU_PART", "MENUNGGU_DUKUNGAN", "HANDOVER"},
		"PENDING":           {"IN_PROGRESS", "SELESAI_PERBAIKAN", "CLOSED", "MENUNGGU_PART", "HANDOVER"},
		"MENUNGGU_PART":     {"IN_PROGRESS", "PENDING", "SELESAI_PERBAIKAN", "HANDOVER"},
		"MENUNGGU_DUKUNGAN": {"IN_PROGRESS", "PENDING", "SELESAI_PERBAIKAN", "HANDOVER"},
		"HANDOVER":          {"IN_PROGRESS", "PENDING", "SELESAI_PERBAIKAN", "MENUNGGU_PART", "MENUNGGU_DUKUNGAN", "HANDOVER"},
		"SELESAI_PERBAIKAN": {"CLOSED", "IN_PROGRESS"},
	}[from]

	if !ok {
		return fmt.Errorf("%w: status awal '%s' tidak dikenali", ErrInvalidTransition, from)
	}

	for _, allowed := range validTargets {
		if allowed == to {
			return nil
		}
	}

	return fmt.Errorf("%w: transisi dari '%s' ke '%s' tidak diizinkan", ErrInvalidTransition, from, to)
}

// ValidateTimelineInvariant memastikan invariant waktu: waktu selesai/beroperasi >= waktu mulai breakdown (Bab 2 & Bab 17).
func ValidateTimelineInvariant(startISO, endISO string) error {
	s := strings.TrimSpace(startISO)
	e := strings.TrimSpace(endISO)
	if s == "" || e == "" {
		return nil
	}

	startTime, err1 := parseFlexibleTime(s)
	endTime, err2 := parseFlexibleTime(e)
	if err1 != nil || err2 != nil {
		return nil
	}

	if endTime.Before(startTime) {
		return fmt.Errorf("%w (%s < %s)", ErrInvalidTimeline, endTime.Format(time.RFC3339), startTime.Format(time.RFC3339))
	}
	return nil
}

func parseFlexibleTime(raw string) (time.Time, error) {
	layouts := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02T15:04:05",
		"2006-01-02T15:04",
	}
	for _, layout := range layouts {
		if t, err := time.Parse(layout, raw); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("unrecognized time format: %s", raw)
}

type AreaStatItem struct {
	Section            string  `json:"section"`
	Count              int     `json:"count"`
	TotalDowntimeHours float64 `json:"total_downtime_hours"`
	MTTRHours          float64 `json:"mttr_hours"`
}

type MachineStatItem struct {
	IDMesin            int64   `json:"id_mesin"`
	NamaMesin          string  `json:"nama_mesin"`
	KodeMesin          string  `json:"kode_mesin"`
	Section            string  `json:"section"`
	IncidentCount      int     `json:"incident_count"`
	TotalDowntimeHours float64 `json:"total_downtime_hours"`
	MTTRHours          float64 `json:"mttr_hours"`
	MTBFHours          float64 `json:"mtbf_hours"`
}

type CategoryStatItem struct {
	Category           string  `json:"category"`
	Count              int     `json:"count"`
	TotalDowntimeHours float64 `json:"total_downtime_hours"`
}

type BreakdownAnalytics struct {
	TotalIncidents       int                `json:"total_incidents"`
	OpenIncidents        int                `json:"open_incidents"`
	ClosedIncidents      int                `json:"closed_incidents"`
	TotalDowntimeHours   float64            `json:"total_downtime_hours"`
	TotalRepairHours     float64            `json:"total_repair_hours"`
	MTTROperationalHours float64            `json:"mttr_operational_hours"`
	MTTRTechnicalHours   float64            `json:"mttr_technical_hours"`
	MTBFHours            float64            `json:"mtbf_hours"`
	AvailabilityPercent  float64            `json:"availability_percent"`
	AreaStats            []AreaStatItem     `json:"area_stats"`
	TopMachines          []MachineStatItem  `json:"top_machines"`
	CategoryStats        []CategoryStatItem `json:"category_stats"`
	ShiftHandoverStats   struct {
		TotalHandovers  int     `json:"total_handovers"`
		HandoverPercent float64 `json:"handover_percent"`
	} `json:"shift_handover_stats"`
}

type MonitoringItem struct {
	IDPartMesin             int64      `json:"id_part_mesin"`
	IDMesin                 int64      `json:"id_mesin"`
	NamaMesin               string     `json:"nama_mesin"`
	Section                 string     `json:"section"`
	NamaPart                string     `json:"nama_part"`
	Spesifikasi             string     `json:"spesifikasi"`
	PosisiPart              string     `json:"posisi_part"`
	Klasifikasi             *string    `json:"klasifikasi"`
	LifetimeHari            *float64   `json:"lifetime_hari"`
	WaktuPenggantian        *time.Time `json:"waktu_penggantian"`
	IntervalPenggantianHari *float64   `json:"interval_penggantian_hari"`
	WaktuAwalPeringatan     *time.Time `json:"waktu_awal_peringatan"`
	WaktuWajibGanti         *time.Time `json:"waktu_wajib_ganti"`
	StatusLifetime          string     `json:"status_lifetime"`
}

// ComponentTargetCalculation merepresentasikan kalkulasi target penggantian komponen (URS 2.3 & 2.4).
type ComponentTargetCalculation struct {
	IDPartMesin      int64    `json:"id_part_mesin"`
	NamaPart         string   `json:"nama_part"`
	NomorPart        *string  `json:"nomor_part,omitempty"`
	PosisiPart       string   `json:"posisi_part"`
	DasarPerhitungan string   `json:"dasar_perhitungan"` // "KALENDER" | "JAM_OPERASI"
	IntervalTarget   float64  `json:"interval_target"`
	Satuan           string   `json:"satuan"` // "Hari" | "Jam Operasi"
	NilaiTerpakai    float64  `json:"nilai_terpakai"`
	TargetTanggal    *string  `json:"target_tanggal,omitempty"`
	TargetJamOperasi *float64 `json:"target_jam_operasi,omitempty"`
	IsDataLengkap    bool     `json:"is_data_lengkap"`
	AlasanDataKurang *string  `json:"alasan_data_kurang,omitempty"`
	PernyataanTarget string   `json:"pernyataan_target"`
}

// PreventiveMaintenanceItem merepresentasikan jadwal & realisasi PM terencana (URS 3.3).
type PreventiveMaintenanceItem struct {
	IDPM                     string  `json:"id_pm"`
	NomorPM                  string  `json:"nomor_pm"`
	IDMesin                  int64   `json:"id_mesin"`
	KodeMesin                string  `json:"kode_mesin"`
	NamaMesin                string  `json:"nama_mesin"`
	Periode                  string  `json:"periode"` // 'Mingguan' | 'Bulanan' | '3 Bulanan' | 'Tahunan'
	Kegiatan                 string  `json:"kegiatan"`
	TanggalJatuhTempo        string  `json:"tanggal_jatuh_tempo"`
	TanggalSelesaiAktual     *string `json:"tanggal_selesai_aktual,omitempty"`
	PelaksanaNIK             *string `json:"pelaksana_nik,omitempty"`
	PelaksanaNama            *string `json:"pelaksana_nama,omitempty"`
	HasilTemuan              *string `json:"hasil_temuan,omitempty"`
	Status                   string  `json:"status"` // 'TERJADWAL' | 'DALAM_PENGERJAAN' | 'SELESAI' | 'TERLAMBAT' | 'DIRESCHEDULE'
	AlasanReschedule         *string `json:"alasan_reschedule,omitempty"`
	TanggalSebelumReschedule *string `json:"tanggal_sebelum_reschedule,omitempty"`
}

// MachineOperatingHours merepresentasikan data waktu operasi aktual mesin yang diverifikasi SPV (URS 3.6).
type MachineOperatingHours struct {
	IDMesin          int64   `json:"id_mesin"`
	KodeMesin        string  `json:"kode_mesin"`
	NamaMesin        string  `json:"nama_mesin"`
	PeriodeBulan     string  `json:"periode_bulan"`
	JamOperasiAktual float64 `json:"jam_operasi_aktual"`
	IsVerifiedBySPV  bool    `json:"is_verified_by_spv"`
	VerifiedByNIK    string  `json:"verified_by_nik"`
	VerifiedByNama   string  `json:"verified_by_nama"`
	VerifiedAt       string  `json:"verified_at"`
}

// =========================================================================
// URS 8.1: REVIEW DAN PERBAIKAN DATA (AUDIT TRAIL, KOREKSI PENGUKURAN, VOID ONLY)
// =========================================================================

var (
	ErrUnauthorizedModification = errors.New("pengguna tidak memiliki wewenang untuk mengubah atau membatalkan catatan")
	ErrReasonRequired           = errors.New("alasan perubahan/pembatalan wajib diisi untuk kepatuhan audit ALCOA")
	ErrPermanentDeletionBlocked = errors.New("penghapusan permanen tidak diizinkan; catatan hanya dapat dibatalkan (void) dengan jejak audit")
)

// DataCorrectionAuditEntry mencatat jejak audit perbaikan/koreksi data pengukuran (URS 8.1).
type DataCorrectionAuditEntry struct {
	IDAudit            string   `json:"id_audit"`
	EntityType         string   `json:"entity_type"` // 'BREAKDOWN_TICKET' | 'OPERATING_HOURS' | 'SHIFT_REPORT'
	EntityID           string   `json:"entity_id"`
	FieldChanged       string   `json:"field_changed"`
	BeforeValue        string   `json:"before_value"`
	AfterValue         string   `json:"after_value"`
	Reason             string   `json:"reason"`
	ChangedByNIK       string   `json:"changed_by_nik"`
	ChangedByNama      string   `json:"changed_by_nama"`
	ChangedByRole      string   `json:"changed_by_role"`
	ChangedAt          string   `json:"changed_at"`
	ImpactedIndicators []string `json:"impacted_indicators"`
}

// ShiftReportRevisionEntry mencatat riwayat revisi laporan shift yang sudah terkirim (URS 8.1 Klausul 5).
type ShiftReportRevisionEntry struct {
	RevisionNo       int      `json:"revision_no"`
	OriginalReportID string   `json:"original_report_id"`
	Shift            string   `json:"shift"`
	Date             string   `json:"date"`
	RevisedByNIK     string   `json:"revised_by_nik"`
	RevisedByNama    string   `json:"revised_by_nama"`
	RevisedAt        string   `json:"revised_at"`
	RevisionReason   string   `json:"revision_reason"`
	ChangesSummary   string   `json:"changes_summary"`
	DeliveryHistory  []string `json:"delivery_history"`
}

// ValidateRecordCancellation memvalidasi kewenangan pembatalan (void) catatan operasional (URS 8.1 Klausul 1 & 6).
func ValidateRecordCancellation(actorRole, reason string) error {
	role := strings.ToUpper(strings.TrimSpace(actorRole))
	if role != "SUPERVISOR" && role != "ADMIN" {
		return fmt.Errorf("%w: hanya SUPERVISOR atau ADMIN yang dapat membatalkan catatan", ErrUnauthorizedModification)
	}
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("%w: pembatalan catatan operasional harus disertai alasan audit", ErrReasonRequired)
	}
	return nil
}

// ValidateDataCorrection memvalidasi kewenangan koreksi data pengukuran (URS 8.1 Klausul 1, 2, 3).
func ValidateDataCorrection(actorRole, reason, fieldName, beforeVal, afterVal string) error {
	role := strings.ToUpper(strings.TrimSpace(actorRole))
	if role != "SUPERVISOR" && role != "ADMIN" {
		return fmt.Errorf("%w: hanya SUPERVISOR atau ADMIN yang dapat melakukan koreksi data pengukuran", ErrUnauthorizedModification)
	}
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("%w: koreksi data pengukuran harus disertai alasan perubahan", ErrReasonRequired)
	}
	if strings.TrimSpace(fieldName) == "" {
		return errors.New("nama field yang dikoreksi tidak boleh kosong")
	}
	if strings.TrimSpace(beforeVal) == strings.TrimSpace(afterVal) {
		return errors.New("nilai sesudah koreksi tidak boleh sama persis dengan nilai sebelum koreksi")
	}
	return nil
}

// ValidateReportRevision memvalidasi kewenangan revisi laporan terkirim (URS 8.1 Klausul 5).
func ValidateReportRevision(actorRole, reason string) error {
	role := strings.ToUpper(strings.TrimSpace(actorRole))
	if role != "SUPERVISOR" && role != "ADMIN" {
		return fmt.Errorf("%w: revisi laporan shift hanya boleh dilakukan oleh SUPERVISOR atau ADMIN", ErrUnauthorizedModification)
	}
	if strings.TrimSpace(reason) == "" {
		return fmt.Errorf("%w: revisi laporan shift terkirim wajib mencantumkan alasan revisi", ErrReasonRequired)
	}
	return nil
}
