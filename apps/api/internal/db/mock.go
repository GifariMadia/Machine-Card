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
		if status != "" && item.StatusLifetime != status {
			continue
		}
		results = append(results, item)
		if len(results) >= limit {
			break
		}
	}
	return results, nil
}

func (m *MockRepo) CreateOpenWork(ctx context.Context, req domain.OpenWorkRequest) (*domain.OpenWorkResult, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}
	if m.OpenWorkFunc != nil {
		return m.OpenWorkFunc(ctx, req)
	}

	// Any valid operator format OPRxxxx is accepted
	if !strings.HasPrefix(strings.ToUpper(req.NIKPelapor), "OPR") {
		return nil, ErrForbidden
	}

	return &domain.OpenWorkResult{
		IDWork:      1001,
		NomorWork:   "OW-20261016-123456",
		Status:      "OPEN",
		WaktuDibuka: time.Now(),
	}, nil
}

func (m *MockRepo) CloseOpenWorkByOperator(ctx context.Context, req domain.OpenWorkCloseRequest) (*domain.DetailedTicketItem, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}

	if !strings.HasPrefix(strings.ToUpper(req.NIKOperator), "OPR") {
		return nil, ErrForbidden
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if m.ClosedKeys == nil {
		m.ClosedKeys = make(map[string]int)
	}

	ticketKey := strings.TrimSpace(req.NomorWork)
	if ticketKey == "" {
		ticketKey = fmt.Sprintf("ID-%d", req.IDWork)
	}

	currentVer := 1
	if existingVer, alreadyClosed := m.ClosedKeys[ticketKey]; alreadyClosed {
		_ = existingVer
		return nil, ErrConflict
	}

	if req.ExpectedVersion != nil && *req.ExpectedVersion != currentVer {
		return nil, ErrConflict
	}

	newVersion := currentVer + 1
	m.ClosedKeys[ticketKey] = newVersion

	closingNotes := req.CatatanClosing
	resumeTime := req.WaktuMesinBeroperasi
	if resumeTime == "" {
		resumeTime = time.Now().Format(time.RFC3339)
	}
	penutupNIK := req.NIKOperator
	penutupNama := "Operator Lapangan"
	shiftPenutup := req.Shift
	downtimeMin := 90.0

	return &domain.DetailedTicketItem{
		IDWork:               req.IDWork,
		NomorWork:            req.NomorWork,
		Status:               "CLOSED",
		Version:              newVersion,
		PenutupNIK:           &penutupNIK,
		PenutupNama:          &penutupNama,
		ShiftPenutup:         &shiftPenutup,
		WaktuMesinBeroperasi: &resumeTime,
		CatatanClosing:       &closingNotes,
		DurasiDowntimeMenit:  &downtimeMin,
		IsShiftHandover:      req.Shift != 1,
	}, nil
}

func (m *MockRepo) ListOpenWorks(ctx context.Context, status, machine, section string, limit int) ([]domain.DetailedTicketItem, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}

	var results []domain.DetailedTicketItem
	for _, t := range m.OpenWorks {
		if status != "" && status != "ALL" && t.Status != status {
			continue
		}
		if machine != "" {
			s := strings.ToLower(machine)
			if !strings.Contains(strings.ToLower(t.NamaMesin), s) && !strings.Contains(strings.ToLower(t.KodeMesin), s) {
				continue
			}
		}
		if section != "" && section != "Semua kategori" && t.Section != section {
			continue
		}
		results = append(results, t)
		if len(results) >= limit {
			break
		}
	}
	return results, nil
}

func (m *MockRepo) GetBreakdownAnalytics(ctx context.Context) (*domain.BreakdownAnalytics, error) {
	if m.Degraded {
		return nil, ErrDegraded
	}

	return &domain.BreakdownAnalytics{
		TotalIncidents:       15,
		OpenIncidents:        2,
		ClosedIncidents:      13,
		TotalDowntimeHours:   24.5,
		TotalRepairHours:     14.2,
		MTTROperationalHours: 1.63,
		MTTRTechnicalHours:   1.09,
		MTBFHours:            48.2,
		AvailabilityPercent:  96.8,
		AreaStats: []domain.AreaStatItem{
			{Section: "Filling", Count: 8, TotalDowntimeHours: 14.0, MTTRHours: 1.75},
			{Section: "Packaging", Count: 5, TotalDowntimeHours: 7.5, MTTRHours: 1.50},
			{Section: "Compounding", Count: 2, TotalDowntimeHours: 3.0, MTTRHours: 1.50},
		},
		TopMachines: []domain.MachineStatItem{
			{IDMesin: 1, NamaMesin: "Ilapak 1", KodeMesin: "ILA-01", Section: "Filling", IncidentCount: 4, TotalDowntimeHours: 7.2, MTTRHours: 1.8, MTBFHours: 42.0},
			{IDMesin: 2, NamaMesin: "Chimei 10A/Jinsung 3", KodeMesin: "CHI-01", Section: "Packaging", IncidentCount: 3, TotalDowntimeHours: 4.5, MTTRHours: 1.5, MTBFHours: 58.0},
		},
		CategoryStats: []domain.CategoryStatItem{
			{Category: "Pneumatik & Mekanik", Count: 6, TotalDowntimeHours: 10.5},
			{Category: "Sensor & Elektrik", Count: 5, TotalDowntimeHours: 8.0},
			{Category: "Cutting / Sealing", Count: 4, TotalDowntimeHours: 6.0},
		},
		ShiftHandoverStats: struct {
			TotalHandovers  int     `json:"total_handovers"`
			HandoverPercent float64 `json:"handover_percent"`
		}{
			TotalHandovers:  4,
			HandoverPercent: 26.6,
		},
	}, nil
}
