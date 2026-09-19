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
