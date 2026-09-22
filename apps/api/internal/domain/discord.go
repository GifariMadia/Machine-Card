package domain

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

var ErrUnsafeWebhookURL = errors.New("URL webhook tidak diizinkan (proteksi SSRF: hanya domain resmi Discord HTTPS yang diizinkan)")

type DayCategory string

const (
	DayCategoryWeekday DayCategory = "WEEKDAY"
	DayCategoryWeekend DayCategory = "WEEKEND"
)

type ShiftReportStatus string

const (
	ShiftReportStatusComplete ShiftReportStatus = "COMPLETE"
	ShiftReportStatusPending  ShiftReportStatus = "PENDING"
)

type AssignedTechnicianStatus struct {
	NIK         string  `json:"nik"`
	Name        string  `json:"name"`
	HasReported bool    `json:"hasReported"`
	IsNihil     *bool   `json:"isNihil,omitempty"`
	CompletedAt *string `json:"completedAt,omitempty"`
}

type ShiftAreaCategory string

const (
	AreaRuangRepair ShiftAreaCategory = "RUANG_REPAIR"
	AreaCompounding ShiftAreaCategory = "COMPOUNDING"
	AreaFilling     ShiftAreaCategory = "FILLING"
	AreaPackaging   ShiftAreaCategory = "PACKAGING"
	AreaPBJT        ShiftAreaCategory = "PBJT"
	AreaPM          ShiftAreaCategory = "PM"
	AreaOther       ShiftAreaCategory = "OTHER"
)

type ShiftTicketItem struct {
	Ticket       string   `json:"ticket"`
	Machine      string   `json:"machine"`
	Issue        string   `json:"issue"`
	Status       string   `json:"status"` // 'OPEN' | 'PENDING' | 'MENUNGGU_KOMPONEN' | 'IN_PROGRESS' | 'CLOSED' | 'DONE'
	Area         string   `json:"area,omitempty"`
	WR           string   `json:"wr,omitempty"`
	TimeRange    string   `json:"timeRange,omitempty"`
	Actions      []string `json:"actions,omitempty"`
	Note         string   `json:"note,omitempty"`
	Progres      string   `json:"progres,omitempty"`
	Kendala      string   `json:"kendala,omitempty"`
	TindakLanjut string   `json:"tindakLanjut,omitempty"`
	Pelaksana    string   `json:"pelaksana,omitempty"`
}

type ShiftReportData struct {
	SupervisorName      string                     `json:"supervisorName"`
	SupervisorNIK       string                     `json:"supervisorNik"`
	Department          string                     `json:"department"`
	Plant               string                     `json:"plant"`
	Shift               string                     `json:"shift"`
	DayCategory         DayCategory                `json:"dayCategory,omitempty"`
	Date                string                     `json:"date"`
	TeamMembers         []string                   `json:"teamMembers,omitempty"`
	IsLateSubmission    bool                       `json:"isLateSubmission,omitempty"`
	ActualInputTime     string                     `json:"actualInputTime,omitempty"`
	Summary             string                     `json:"summary,omitempty"`
	HandoverNotes       string                     `json:"handoverNotes,omitempty"`
	ActiveMachinesCount int                        `json:"activeMachinesCount,omitempty"`
	BreakdownCount      int                        `json:"breakdownCount,omitempty"`
	OpenTickets         []ShiftTicketItem          `json:"openTickets,omitempty"`
	AssignedTechnicians []AssignedTechnicianStatus `json:"assignedTechnicians,omitempty"`
	WebhookURL          string                     `json:"webhookUrl,omitempty"`
}

type ShiftInfo struct {
	Shift       string      `json:"shift"`
	Label       string      `json:"label"`
	TimeRange   string      `json:"timeRange"`
	TriggerTime string      `json:"triggerTime"`
	DayCategory DayCategory `json:"dayCategory"`
}

type DiscordField struct {
	Name   string `json:"name"`
	Value  string `json:"value"`
	Inline bool   `json:"inline"`
}

type DiscordFooter struct {
	Text string `json:"text"`
}

type DiscordEmbed struct {
	Title       string         `json:"title"`
	Description string         `json:"description"`
	Color       int            `json:"color"`
	Fields      []DiscordField `json:"fields"`
	Footer      DiscordFooter  `json:"footer"`
	Timestamp   string         `json:"timestamp"`
}

type DiscordPayload struct {
	Username  string         `json:"username"`
	AvatarURL string         `json:"avatar_url"`
	Embeds    []DiscordEmbed `json:"embeds"`
}

type DiscordReportResult struct {
	Success      bool              `json:"success"`
	Simulated    bool              `json:"simulated"`
	ReportStatus ShiftReportStatus `json:"reportStatus"`
	MissingItems []string          `json:"missingItems"`
	Message      string            `json:"message"`
	Payload      DiscordPayload    `json:"payload"`
}

func GetDayCategory(date time.Time) DayCategory {
	loc := time.FixedZone("Asia/Jakarta", 7*3600)
	jak := date.In(loc)
	w := jak.Weekday()
	if w == time.Sunday || w == time.Saturday {
		return DayCategoryWeekend
	}
	return DayCategoryWeekday
}

func GetShiftSchedule(shiftNumber string, dayCategory DayCategory) ShiftInfo {
	isWeekend := dayCategory == DayCategoryWeekend
	switch shiftNumber {
	case "1":
		timeRange := "06:45 - 15:15"
		triggerTime := "15:15"
		if isWeekend {
			timeRange = "06:45 - 14:15"
			triggerTime = "14:15"
		}
		return ShiftInfo{
			Shift:       "1",
			Label:       "Shift 1 (Pagi)",
			TimeRange:   timeRange,
			TriggerTime: triggerTime,
			DayCategory: dayCategory,
		}
	case "2":
		timeRange := "15:00 - 22:30"
		triggerTime := "22:30"
		if isWeekend {
			timeRange = "14:15 - 21:45"
			triggerTime = "21:45"
		}
		return ShiftInfo{
			Shift:       "2",
			Label:       "Shift 2 (Sore)",
			TimeRange:   timeRange,
			TriggerTime: triggerTime,
			DayCategory: dayCategory,
		}
	case "3":
		timeRange := "22:15 - 06:45"
		triggerTime := "06:45"
		if isWeekend {
			timeRange = "21:45 - 05:30"
			triggerTime = "05:30"
		}
		return ShiftInfo{
			Shift:       "3",
			Label:       "Shift 3 (Malam)",
			TimeRange:   timeRange,
			TriggerTime: triggerTime,
			DayCategory: dayCategory,
		}
	default:
		timeRange := "06:45 - 15:15"
		triggerTime := "15:15"
		if isWeekend {
			timeRange = "06:45 - 14:15"
			triggerTime = "14:15"
		}
		return ShiftInfo{
			Shift:       "1",
			Label:       "Shift 1 (Pagi)",
			TimeRange:   timeRange,
			TriggerTime: triggerTime,
			DayCategory: dayCategory,
		}
	}
}

func GetCurrentShift(date time.Time) ShiftInfo {
	loc := time.FixedZone("Asia/Jakarta", 7*3600)
	jak := date.In(loc)
	totalMinutes := jak.Hour()*60 + jak.Minute()
	dayCategory := GetDayCategory(date)

	if dayCategory == DayCategoryWeekend {
		if totalMinutes >= 405 && totalMinutes < 855 {
			return GetShiftSchedule("1", DayCategoryWeekend)
		} else if totalMinutes >= 855 && totalMinutes < 1305 {
			return GetShiftSchedule("2", DayCategoryWeekend)
		}
		return GetShiftSchedule("3", DayCategoryWeekend)
	}

	if totalMinutes >= 405 && totalMinutes < 900 {
		return GetShiftSchedule("1", DayCategoryWeekday)
	} else if totalMinutes >= 900 && totalMinutes < 1335 {
		return GetShiftSchedule("2", DayCategoryWeekday)
	}
	return GetShiftSchedule("3", DayCategoryWeekday)
}

func EvaluateShiftCompleteness(data ShiftReportData) (ShiftReportStatus, []string) {
	var missingItems []string

	if len(data.AssignedTechnicians) > 0 {
		for _, tech := range data.AssignedTechnicians {
			isNihil := tech.IsNihil != nil && *tech.IsNihil
			if !tech.HasReported && !isNihil {
				missingItems = append(missingItems, fmt.Sprintf("Petugas %s (%s) belum mencatat realisasi atau pernyataan Nihil", tech.Name, tech.NIK))
			}
		}
	}

	if len(data.OpenTickets) > 0 {
		for _, t := range data.OpenTickets {
			normalizedStatus := strings.ToUpper(t.Status)
			if normalizedStatus != "CLOSED" && normalizedStatus != "DONE" {
				hasFollowUp := t.Progres != "" || t.TindakLanjut != "" || len(t.Actions) > 0
				if !hasFollowUp && t.Progres == "" {
					missingItems = append(missingItems, fmt.Sprintf("Tiket %s (%s) berstatus %s namun belum dilengkapi catatan progres & tindak lanjut", t.Ticket, t.Machine, t.Status))
				}
			}
		}
	}

	if len(missingItems) == 0 {
		return ShiftReportStatusComplete, []string{}
	}
	return ShiftReportStatusPending, missingItems
}

func GenerateAutoShiftSummary(shift, timeRange string, dayCategory DayCategory, activeMachinesCount, breakdownCount int, openTickets []ShiftTicketItem) (string, string) {
	isNormal := breakdownCount == 0
	dayLabel := "Weekdays"
	if dayCategory == DayCategoryWeekend {
		dayLabel = "Weekend"
	}

	var summary string
	if isNormal {
		summary = fmt.Sprintf("[AUTO-GENERATED SISTEM] Jadwal %s Shift %s (%s): Seluruh catatan teknisi lengkap. Sebanyak %d mesin tanpa tiket gangguan dalam penanganan. Kondisi operasi aktual memerlukan konfirmasi.", dayLabel, shift, timeRange, activeMachinesCount)
	} else {
		summary = fmt.Sprintf("[AUTO-GENERATED SISTEM] Jadwal %s Shift %s (%s): Sebanyak %d mesin tanpa gangguan dalam penanganan dan terdapat %d pekerjaan maintenance berstatus OPEN lintas shift.", dayLabel, shift, timeRange, activeMachinesCount, breakdownCount)
	}

	var handoverNotes string
	if isNormal {
		handoverNotes = "Tidak ada pekerjaan tertunda (OPEN/PENDING). Seluruh pekerjaan shift ini berstatus DONE."
	} else {
		var activeUnits []string
		for _, t := range openTickets {
			if t.Status == "OPEN" || t.Status == "IN_PROGRESS" {
				activeUnits = append(activeUnits, t.Machine)
			}
		}
		handoverNotes = fmt.Sprintf("Pekerjaan lanjutan antar-shift pada unit: %s. Tanggung jawab laporan shift asal telah tuntas; tindak lanjut fisik diteruskan ke shift berikutnya.", strings.Join(activeUnits, ", "))
	}

	return summary, handoverNotes
}

func formatSingleTicketLine(t ShiftTicketItem, index int) string {
	statusUpper := strings.ToUpper(t.Status)
	if statusUpper == "CLOSED" {
		statusUpper = "DONE"
	}
	statusBadge := fmt.Sprintf("Status : *%s*", statusUpper)

	timeInfo := ""
	if t.TimeRange != "" {
		timeInfo = fmt.Sprintf(" (%s)", t.TimeRange)
	}

	wrInfo := "\nWR : ~"
	if t.WR != "" && t.WR != "~" {
		wrInfo = fmt.Sprintf("\nWR : %s", t.WR)
	} else if t.Ticket != "" && !strings.HasPrefix(t.Ticket, "WS-") && !strings.HasPrefix(t.Ticket, "CMP-") && !strings.HasPrefix(t.Ticket, "FIL-") {
		wrInfo = fmt.Sprintf("\nWR : %s", t.Ticket)
	}

	actionsList := ""
	if len(t.Actions) > 0 {
		var lines []string
		for _, act := range t.Actions {
			lines = append(lines, fmt.Sprintf("• %s", act))
		}
		actionsList = "\n" + strings.Join(lines, "\n")
	} else if t.Progres != "" {
		actionsList = fmt.Sprintf("\n• %s", t.Progres)
	}

	noteLine := ""
	if t.Note != "" {
		noteLine = fmt.Sprintf("\nNOTE : %s", t.Note)
	}

	followUpLine := ""
	if t.TindakLanjut != "" && len(t.Actions) == 0 {
		followUpLine = fmt.Sprintf("\n↳ Tindak Lanjut : %s", t.TindakLanjut)
	}

	return fmt.Sprintf("**%d. %s : %s**%s%s%s\n%s%s%s",
		index, t.Machine, t.Issue, timeInfo, wrInfo, actionsList, statusBadge, noteLine, followUpLine)
}

func truncate(s string, limit int) string {
	if len(s) > limit {
		return s[:limit]
	}
	return s
}

func FormatDiscordShiftReport(data ShiftReportData) DiscordPayload {
	dayCategory := data.DayCategory
	if dayCategory == "" {
		dayCategory = GetDayCategory(time.Now())
	}
	sched := GetShiftSchedule(data.Shift, dayCategory)
	reportStatus, missingItems := EvaluateShiftCompleteness(data)
	isPendingReport := reportStatus == ShiftReportStatusPending
	isAllNormal := data.BreakdownCount == 0 && !isPendingReport

	statusEmoji := "🔴"
	if isPendingReport {
		statusEmoji = "🟡"
	} else if isAllNormal {
		statusEmoji = "🟢"
	}

	color := 0xe11d48
	if isPendingReport {
		color = 0xd97706
	} else if isAllNormal {
		color = 0x059669
	}

	autoSummary, autoHandover := GenerateAutoShiftSummary(
		data.Shift,
		sched.TimeRange,
		dayCategory,
		data.ActiveMachinesCount,
		data.BreakdownCount,
		data.OpenTickets,
	)

	finalSummary := data.Summary
	if finalSummary == "" {
		finalSummary = autoSummary
	}

	finalHandover := data.HandoverNotes
	if finalHandover == "" {
		finalHandover = autoHandover
	}

	tickets := data.OpenTickets
	hasAreaGrouping := false
	for _, t := range tickets {
		if t.Area != "" {
			hasAreaGrouping = true
			break
		}
	}

	type areaDef struct {
		key   ShiftAreaCategory
		label string
	}
	areaDefs := []areaDef{
		{key: AreaRuangRepair, label: "Ruang Repair / Workshop :"},
		{key: AreaCompounding, label: "AREA COMPOUNDING :"},
		{key: AreaFilling, label: "AREA FILLING :"},
		{key: AreaPackaging, label: "AREA PACKAGING :"},
		{key: AreaPBJT, label: "PBJT :"},
		{key: AreaPM, label: "PM :"},
		{key: AreaOther, label: "OTHER :"},
	}

	var areaFields []DiscordField
	if hasAreaGrouping {
		for _, ad := range areaDefs {
			var items []ShiftTicketItem
			for _, t := range tickets {
				areaUpper := strings.ToUpper(strings.TrimSpace(t.Area))
				if ad.key == AreaPBJT && areaUpper == "PBJT" {
					items = append(items, t)
				} else if ad.key == AreaPM && areaUpper == "PM" {
					items = append(items, t)
				} else if areaUpper == string(ad.key) {
					items = append(items, t)
				}
			}
			if len(items) > 0 {
				var formatted []string
				for idx, item := range items {
					formatted = append(formatted, formatSingleTicketLine(item, idx+1))
				}
