package db

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"machine-card/api/internal/domain"
)

type MockRepo struct {
	mu           sync.Mutex
	Degraded     bool
	Machines     []domain.Machine
	Monitoring   []domain.MonitoringItem
	OpenWorks    []domain.DetailedTicketItem
	ClosedKeys   map[string]int
	OpenWorkFunc func(ctx context.Context, req domain.OpenWorkRequest) (*domain.OpenWorkResult, error)
}

func NewMockRepo() *MockRepo {
	now := time.Now()
	startTime := now.Add(-3 * time.Hour).Format(time.RFC3339)
	techStart := now.Add(-2 * time.Hour).Format(time.RFC3339)
	techEnd := now.Add(-1 * time.Hour).Format(time.RFC3339)
	resumeTime := now.Add(-45 * time.Minute).Format(time.RFC3339)

	techNIK := "TKN0001"
	techNama := "Budi Santoso"
	action := "Penggantian silinder pneumatik dan pelumasan bearing"
	penutupNIK := "OPR0002"
	penutupNama := "A. Fakih"
	penutupShift := 2
	catatanClosing := "Running test 15 menit dengan batch HM001 lancar, speed 75 rpm normal"
	downtimeMin := 135.0
	repairMin := 60.0
	respMin := 60.0

	return &MockRepo{
		Machines: []domain.Machine{
			{
				IDMesin:    1,
				KodeMesin:  "ILA-01",
				NamaMesin:  "Ilapak 1",
				Kategori:   "Filling",
				Status:     domain.MachineStatusAktif,
				JumlahPart: 5,
			},
			{
				IDMesin:    2,
				KodeMesin:  "CHI-01",
				NamaMesin:  "Chimei 10A/Jinsung 3",
				Kategori:   "Packaging",
				Status:     domain.MachineStatusAktif,
				JumlahPart: 3,
			},
			{
				IDMesin:    3,
				KodeMesin:  "ST-03",
				NamaMesin:  "ST 3 RCL 3",
				Kategori:   "Compounding / Filling",
				Status:     domain.MachineStatusAktif,
				JumlahPart: 4,
			},
		},
		Monitoring: []domain.MonitoringItem{
			{
				IDPartMesin:    101,
				IDMesin:        1,
				NamaMesin:      "Ilapak 1",
				NamaPart:       "Pisau Potong",
				StatusLifetime: "NORMAL",
			},
		},
		OpenWorks: []domain.DetailedTicketItem{
			{
				IDWork:               1001,
				NomorWork:            "OW-20261016-123456",
				IDMesin:              1,
				KodeMesin:            "ILA-01",
				NamaMesin:            "Ilapak 1",
				Section:              "Filling",
				PelaporNIK:           "OPR0001",
				PelaporNama:          "A. Dahlan",
				ShiftLapor:           1,
				WaktuMulaiBreakdown:  startTime,
				Keterangan:           "Sachet macet pada corong pengisian",
				KategoriBreakdown:    "Pneumatik & Mekanik",
				TipeWO:               "Batch",
				KodeProduk:           "PRD-01",
				NoBatch:              "HM001",
				Status:               "CLOSED",
				WaktuMulaiTeknisi:    &techStart,
				WaktuSelesaiTeknisi:  &techEnd,
				TeknisiNIK:           &techNIK,
				TeknisiNama:          &techNama,
				TindakanTeknisi:      &action,
				PenutupNIK:           &penutupNIK,
				PenutupNama:          &penutupNama,
				ShiftPenutup:         &penutupShift,
				WaktuMesinBeroperasi: &resumeTime,
				CatatanClosing:       &catatanClosing,
				DurasiDowntimeMenit:  &downtimeMin,
				DurasiPerbaikanMenit: &repairMin,
				DurasiResponMenit:    &respMin,
				IsShiftHandover:      true, // Shift 1 to Shift 2
			},
		},
	}
}

func (m *MockRepo) Close() {}

func (m *MockRepo) Health(ctx context.Context) (time.Time, error) {
	if m.Degraded {
		return time.Time{}, ErrDegraded
	}
	return time.Now(), nil
}

// ListMachines: Return all machines in mock regardless of operator username
func (m *MockRepo) ListMachines(ctx context.Context, _ string, search, category string, limit int) ([]domain.Machine, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}

	var results []domain.Machine
	for _, mach := range m.Machines {
		if search != "" {
			s := strings.ToLower(search)
			if !strings.Contains(strings.ToLower(mach.NamaMesin), s) && !strings.Contains(strings.ToLower(mach.KodeMesin), s) {
				continue
			}
		}
		if category != "" && category != "Semua kategori" && mach.Kategori != category {
			continue
		}
		results = append(results, mach)
		if len(results) >= limit {
			break
		}
	}

	return results, nil
}

func (m *MockRepo) ListMonitoring(ctx context.Context, status string, limit int) ([]domain.MonitoringItem, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}

	var results []domain.MonitoringItem
	for _, item := range m.Monitoring {
