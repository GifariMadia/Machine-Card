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
