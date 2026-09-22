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
				joined := strings.Join(formatted, "\n\n")
				areaFields = append(areaFields, DiscordField{
					Name:   ad.label,
					Value:  truncate(joined, 1020),
					Inline: false,
				})
			}
		}
	} else {
		ticketLines := "_Tidak ada pekerjaan breakdown / PM terbuka (Nihil)._"
		if len(tickets) > 0 {
			var formatted []string
			for idx, t := range tickets {
				formatted = append(formatted, formatSingleTicketLine(t, idx+1))
			}
			ticketLines = strings.Join(formatted, "\n\n")
		}
		areaFields = append(areaFields, DiscordField{
			Name:   "Daftar Aktivitas & Pekerjaan Maintenance :",
			Value:  truncate(ticketLines, 1020),
			Inline: false,
		})
	}

	teamMemberDisplay := "Tim Teknisi Shift"
	if len(data.TeamMembers) > 0 {
		teamMemberDisplay = strings.Join(data.TeamMembers, ", ")
	} else if len(data.AssignedTechnicians) > 0 {
		var parts []string
		for _, t := range data.AssignedTechnicians {
			if t.Name != "" {
				parts = append(parts, t.Name)
			} else if t.NIK != "" {
				parts = append(parts, t.NIK)
			}
		}
		if len(parts) > 0 {
			teamMemberDisplay = strings.Join(parts, ", ")
		}
	}

	headerTag := fmt.Sprintf("LAPORAN SHIFT %s — ENGINEERING MAINTENANCE", sched.Shift)
	if data.IsLateSubmission {
		headerTag = fmt.Sprintf("LAPORAN SHIFT %s SUSULAN (OVERTIME COMPLETED)", sched.Shift)
	} else if isPendingReport {
		headerTag = fmt.Sprintf("NOTIFIKASI LAPORAN SHIFT %s PENDING (BELUM LENGKAP)", sched.Shift)
	}

	nowISO := time.Now().UTC().Format(time.RFC3339)

	statusValue := "**LENGKAP & TERKIRIM OTOMATIS**"
	if isPendingReport {
		statusValue = "**PENDING** (Menunggu Kelengkapan)"
	} else if data.IsLateSubmission {
		actTime := data.ActualInputTime
		if actTime == "" {
			actTime = "Tercatat"
		}
		statusValue = fmt.Sprintf("**LENGKAP SUSULAN**\nInput: %s", actTime)
	}

	var fields []DiscordField
	fields = append(fields,
		DiscordField{
			Name:   "Supervisor Pemantau Shift (SPV Maintenance)",
			Value:  fmt.Sprintf("%s (%s)", data.SupervisorName, data.SupervisorNIK),
			Inline: true,
		},
		DiscordField{
			Name:   "Shift & Jam Operasional",
			Value:  fmt.Sprintf("%s (%s)\n**%s WIB**", sched.Label, dayCategory, sched.TimeRange),
			Inline: true,
		},
		DiscordField{
			Name:   "Status Laporan Shift",
			Value:  statusValue,
			Inline: true,
		},
	)
	fields = append(fields, areaFields...)

	fields = append(fields,
		DiscordField{
			Name:   "Ringkasan Laporan Teknisi & Operasional Mesin",
			Value:  fmt.Sprintf("%s\n• Mesin Tanpa Gangguan Dalam Penanganan: **%d** | Pekerjaan Open Lintas Shift: **%d**", finalSummary, data.ActiveMachinesCount, data.BreakdownCount),
			Inline: false,
		},
	)

	handoverOrMissingName := "Catatan Serah-Terima Shift (Handover)"
	handoverOrMissingValue := finalHandover
	if isPendingReport {
		handoverOrMissingName = "Kekurangan Catatan Wajib"
		var missingLines []string
		for _, m := range missingItems {
			missingLines = append(missingLines, "• "+m)
		}
		handoverOrMissingValue = strings.Join(missingLines, "\n")
	}

	fields = append(fields, DiscordField{
		Name:   handoverOrMissingName,
		Value:  handoverOrMissingValue,
		Inline: false,
	})

	return DiscordPayload{
		Username:  "B7 Machine Card Bot",
		AvatarURL: "https://raw.githubusercontent.com/lucide-icons/lucide/main/icons/factory.png",
		Embeds: []DiscordEmbed{
			{
				Title:       fmt.Sprintf("%s %s (%s)", statusEmoji, headerTag, sched.TimeRange),
				Description: fmt.Sprintf("**PT BINTANG TOEDJOE** · Engineering Maintenance Site %s\n**Tanggal :** %s · **Anggota Shift :** `%s`", data.Plant, data.Date, teamMemberDisplay),
				Color:       color,
				Fields:      fields,
				Footer: DiscordFooter{
					Text: fmt.Sprintf("PT Bintang Toedjoe • Engineering Pulogadung • Akhir Shift %s WIB • %s", sched.TriggerTime, nowISO),
				},
				Timestamp: nowISO,
			},
		},
	}
}

// ValidateDiscordWebhookURL memvalidasi URL agar bebas dari celah SSRF (Bab 27):
// Hanya mengizinkan HTTPS ke host resmi Discord dan path /api/webhooks/.
func ValidateDiscordWebhookURL(rawURL string) error {
	clean := strings.TrimSpace(rawURL)
	if clean == "" || strings.Contains(clean, "simulate") || strings.Contains(clean, "example.com") {
		return nil
	}

	parsed, err := url.Parse(clean)
	if err != nil {
		return fmt.Errorf("%w: format URL tidak valid", ErrUnsafeWebhookURL)
	}

	if strings.ToLower(parsed.Scheme) != "https" {
		return fmt.Errorf("%w: wajib menggunakan protokol HTTPS", ErrUnsafeWebhookURL)
	}

	host := strings.ToLower(parsed.Hostname())
	allowedHosts := map[string]bool{
		"discord.com":        true,
		"discordapp.com":     true,
		"ptb.discord.com":    true,
		"canary.discord.com": true,
	}
	if !allowedHosts[host] {
		return fmt.Errorf("%w: host '%s' ditolak", ErrUnsafeWebhookURL, host)
	}

	if !strings.HasPrefix(parsed.Path, "/api/webhooks/") {
		return fmt.Errorf("%w: path harus diawali /api/webhooks/", ErrUnsafeWebhookURL)
	}

	return nil
}

func SendDiscordShiftReport(ctx context.Context, webhookURL string, data ShiftReportData) (*DiscordReportResult, error) {
	payload := FormatDiscordShiftReport(data)
	reportStatus, missingItems := EvaluateShiftCompleteness(data)

	// Simulation mode
	cleanURL := strings.TrimSpace(webhookURL)
	if cleanURL == "" || strings.Contains(cleanURL, "simulate") || strings.Contains(cleanURL, "example.com") {
		msg := "Laporan Shift Otomatis & Summary Status Maintenance berhasil dikirim pada jadwal akhir shift (Mock Mode)!"
		if reportStatus == ShiftReportStatusPending {
			msg = "Laporan Shift berstatus PENDING: Notifikasi pengingat dikirim ke teknisi & SPV tanpa menghambat shift berikutnya."
		} else if data.IsLateSubmission {
			msg = "Laporan Shift Susulan (Overtime) berhasil diverifikasi ulang dan dikirim otomatis ke Discord (Mock Mode)!"
		}

		return &DiscordReportResult{
			Success:      true,
			Simulated:    true,
			ReportStatus: reportStatus,
			MissingItems: missingItems,
			Message:      msg,
			Payload:      payload,
		}, nil
	}

	if err := ValidateDiscordWebhookURL(cleanURL); err != nil {
		return nil, err
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("gagal serialize discord payload: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, cleanURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, fmt.Errorf("gagal membuat request discord: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("koneksi discord webhook error: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		respBytes, _ := io.ReadAll(io.LimitReader(resp.Body, 4096))
		return nil, fmt.Errorf("Discord Webhook gagal (%d): %s", resp.StatusCode, string(respBytes))
	}

	return &DiscordReportResult{
		Success:      true,
		Simulated:    false,
		ReportStatus: reportStatus,
		MissingItems: missingItems,
		Message:      "Laporan shift otomatis berhasil dikirimkan ke channel Discord!",
		Payload:      payload,
	}, nil
}
