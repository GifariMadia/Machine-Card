package db

import (
	"bytes"
	"encoding/json"
	"machine-card/api/internal/domain"
	"strings"
	"time"
)

var documentRoles = map[string]string{
	"machine-card-open-work": "ADMIN OPERATOR TEKNISI SUPERVISOR",
	"machine-card-machines":  "ADMIN", "machine-card-managed-users": "ADMIN",
	"mc-master-parts": "ADMIN", "mc-pending-part-justifications": "ADMIN TEKNISI",
	"machine-card-parts": "ADMIN SUPERVISOR", "machine-card-operating-hours": "ADMIN SUPERVISOR",
	"machine-card-pm-schedules": "ADMIN SUPERVISOR TEKNISI",
	"machine-card-kpi-targets":  "ADMIN SUPERVISOR", "machine-card-kpi-target-history": "ADMIN SUPERVISOR",
	"machine-card-correction-logs": "ADMIN SUPERVISOR", "mc-system-audit-logs": "ADMIN SUPERVISOR",
	"machine-card-shift-revisions": "ADMIN SUPERVISOR", "machine-card-shift-members": "ADMIN SUPERVISOR",
	"machine-card-shift-overrides": "ADMIN SUPERVISOR TEKNISI", "machine-card-other-notes": "ADMIN TEKNISI",
	"machine-card-pbjt-notes": "ADMIN TEKNISI", "machine-card-pm-notes": "ADMIN TEKNISI",
	"machine-card-repair-notes":     "ADMIN TEKNISI",
	"machine-card-import-ledger":    "ADMIN",
	"machine-card-lifetime-rules":   "ADMIN",
	"machine-card-weekly-followups": "ADMIN SUPERVISOR",
}

func validateDocument(a Actor, key string, before, after json.RawMessage) error {
	roles, ok := documentRoles[key]
	if strings.HasPrefix(key, "machine-card-shift-closing-") {
		roles = "ADMIN TEKNISI"
		ok = a.Role == "ADMIN" || key == "machine-card-shift-closing-"+a.NIK || strings.HasPrefix(key, "machine-card-shift-closing-"+a.NIK+"-")
	}
	for _, base := range []string{"machine-card-repair-notes-", "machine-card-pbjt-notes-", "machine-card-pm-notes-", "machine-card-other-notes-", "machine-card-shift-overrides-"} {
		if strings.HasPrefix(key, base) {
			roles = "ADMIN TEKNISI"
			ok = a.Role == "ADMIN" || strings.HasPrefix(key, base+a.NIK+"-")
		}
	}
	if !ok || !strings.Contains(" "+roles+" ", " "+a.Role+" ") {
		return ErrForbidden
	}
	for _, arrayKey := range []string{"machine-card-machines", "machine-card-managed-users", "mc-master-parts", "mc-pending-part-justifications", "machine-card-parts", "machine-card-operating-hours", "machine-card-pm-schedules", "machine-card-open-work", "machine-card-shift-revisions"} {
		if key == arrayKey && !strings.HasPrefix(strings.TrimSpace(string(after)), "[") {
			return ErrConflict
		}
	}
	if key == "machine-card-lifetime-rules" {
		var value struct {
			Warning float64 `json:"warningThreshold"`
			Limit   float64 `json:"replacementLimit"`
		}
		if json.Unmarshal(after, &value) != nil || value.Warning <= 0 || value.Limit <= value.Warning {
			return ErrConflict
		}
	}
	if strings.HasPrefix(key, "machine-card-shift-closing-") && a.Role == "TEKNISI" {
		var value struct {
			Date     string `json:"date"`
			Shift    string `json:"shift"`
			Complete bool   `json:"complete"`
		}
		if json.Unmarshal(after, &value) != nil || !value.Complete {
			return ErrConflict
		}
		_, err := time.Parse("2006-01-02", value.Date)
		loc, _ := time.LoadLocation("Asia/Jakarta")
		if err != nil || value.Date > time.Now().In(loc).Format("2006-01-02") {
			return ErrConflict
		}
		assigned := false
		for _, shift := range a.Shifts {
			if shift == value.Shift {
				assigned = true
			}
		}
		if !assigned {
			return ErrForbidden
		}
		shiftNum := strings.TrimPrefix(strings.TrimSpace(value.Shift), "Shift ")
		expectedDatedKey := "machine-card-shift-closing-" + a.NIK + "-" + value.Date + "-" + shiftNum
		if key != "machine-card-shift-closing-"+a.NIK && key != expectedDatedKey {
			return ErrConflict
		}
	}
	if key == "mc-pending-part-justifications" && a.Role == "TEKNISI" {
		var old, next []map[string]json.RawMessage
		if json.Unmarshal(before, &old) != nil || json.Unmarshal(after, &next) != nil {
			return ErrConflict
		}
		prior := map[string]map[string]json.RawMessage{}
		for _, item := range old {
			prior[text(item, "id")] = item
		}
		for _, item := range next {
			if p, exists := prior[text(item, "id")]; exists {
				a, _ := json.Marshal(p)
				b, _ := json.Marshal(item)
				if !bytes.Equal(a, b) {
					return ErrForbidden
				}
				delete(prior, text(item, "id"))
			} else if text(item, "status") != "PENDING" || text(item, "technicianNik") != a.NIK {
				return ErrForbidden
			}
		}
		if len(prior) > 0 {
			return ErrForbidden
		}
	}
	if key != "machine-card-open-work" && key != "machine-card-pm-schedules" {
		return nil
	}
	var old, next []map[string]json.RawMessage
	if json.Unmarshal(before, &old) != nil || json.Unmarshal(after, &next) != nil {
		return ErrConflict
	}
	idField := "id"
	if key == "machine-card-open-work" {
		idField = "ticket"
	}
	previous := map[string]map[string]json.RawMessage{}
	for _, v := range old {
		previous[text(v, idField)] = v
	}
	seen := map[string]bool{}
	for _, v := range next {
		id := text(v, idField)
		if id == "" || seen[id] {
			return ErrConflict
		}
		seen[id] = true
		p, exists := previous[id]
		newBytes, _ := json.Marshal(v)
		oldBytes, _ := json.Marshal(p)
		if exists && bytes.Equal(newBytes, oldBytes) {
			continue
		}
		if key == "machine-card-pm-schedules" {
			if err := validatePM(a, p, v, exists); err != nil {
				return err
			}
			continue
		}
		status := text(v, "status")
		prior := text(p, "status")
		if status != "OPEN" && status != "IN_PROGRESS" && status != "PENDING" && status != "MENUNGGU_PART" && status != "MENUNGGU_DUKUNGAN" && status != "SELESAI_PERBAIKAN" && status != "CLOSED" && status != "VOID" && status != "HANDOVER" {
			return ErrConflict
		}
		if !exists {
			if a.Role != "OPERATOR" && a.Role != "ADMIN" {
				return ErrForbidden
			}
			if a.Role != "ADMIN" && (status != "OPEN" || text(v, "reporter") != a.NIK) {
				return ErrForbidden
			}
			if a.Role != "ADMIN" && changedOutside(nil, v, []string{"ticket", "machine", "id_mesin", "section", "reporter", "reporterName", "shift", "keterangan", "kategori", "woType", "kodeProduk", "noBatch", "noWr", "waktuMulai", "tagType", "createdAt", "status"}) {
				return ErrForbidden
			}
			if strings.TrimSpace(text(v, "machine")) == "" || len(strings.TrimSpace(text(v, "keterangan"))) < 5 {
				return ErrConflict
			}
			continue
		}
		if prior == "VOID" && status != "VOID" {
			return ErrConflict
		}
		if prior == "CLOSED" && status != "CLOSED" && !(status == "VOID" && (a.Role == "SUPERVISOR" || a.Role == "ADMIN")) {
			return ErrConflict
		}
		switch a.Role {
		case "OPERATOR":
			if prior != "SELESAI_PERBAIKAN" || status != "CLOSED" || text(v, "penutupNik") != a.NIK {
				return ErrForbidden
			}
			if changedOutside(p, v, []string{"status", "waktuMesinBeroperasi", "penutupNik", "penutupName", "shiftPenutup", "catatanClosing", "durasiJam", "closedAt"}) {
				return ErrForbidden
			}
			resume, err := time.Parse(time.RFC3339, text(v, "waktuMesinBeroperasi"))
			if err != nil || resume.After(time.Now()) {
				return ErrConflict
			}
			end, err := time.Parse(time.RFC3339, text(p, "waktuSelesai"))
			if err == nil && resume.Before(end) {
				return ErrConflict
			}
		case "TEKNISI":
			if prior == "CLOSED" || status == "CLOSED" || status == "VOID" {
				return ErrForbidden
			}
			owner := text(p, "technicianNik")
			_, hasHandover := v["riwayatHandover"]
			isHandoverTakeover := prior == "HANDOVER" || (hasHandover && (status == "IN_PROGRESS" || status == "HANDOVER"))
			if owner != "" && owner != a.NIK && !isHandoverTakeover {
				return ErrConflict
			}
			if text(v, "technicianNik") != a.NIK {
				return ErrForbidden
			}
			if prior == "OPEN" && status != "IN_PROGRESS" {
				return ErrConflict
			}
			if prior != status && domain.ValidateTicketTransition(prior, status, "TEKNISI") != nil {
				return ErrConflict
			}
			if status == "SELESAI_PERBAIKAN" && strings.TrimSpace(text(v, "action")) == "" {
				return ErrConflict
			}
			if err := validateNonNegativeNumbers(v, "durasiTungguMenit", "durasiPerbaikanMenit", "waktuTungguPartMenit"); err != nil {
				return err
			}
			if changedOutside(p, v, []string{"status", "action", "technician", "technicianName", "technicianNik", "originalOpenedAt", "waktuMulai", "waktuMulaiTeknisi", "waktuSelesai", "durasiJam", "durasiTungguMenit", "durasiPerbaikanMenit", "waktuTungguPartMenit", "statusHistory", "partReplaced", "followup", "alasanPenundaan", "waktuMulaiTunggu", "kondisiTerakhir", "rencanaTindakLanjut", "riwayatHandover"}) {
				return ErrForbidden
			}
		case "SUPERVISOR":
			if err := validateNonNegativeNumbers(v, "durasiPerbaikanMenit", "waktuTungguPartMenit"); err != nil {
				return err
			}
			if status != prior && status != "VOID" {
				return ErrForbidden
			}
			if status == "VOID" && strings.TrimSpace(text(v, "voidReason")) == "" {
				return ErrConflict
			}
			controlledChanged := false
			for _, field := range []string{"durasiPerbaikanMenit", "waktuTungguPartMenit", "waktuMulai", "kategori"} {
				if !bytes.Equal(p[field], v[field]) {
					controlledChanged = true
					break
				}
			}
			if controlledChanged && strings.TrimSpace(text(v, "changeReason")) == "" {
				return ErrConflict
			}
			if changedOutside(p, v, []string{"status", "isVoid", "voidReason", "voidBy", "voidAt", "durasiPerbaikanMenit", "waktuTungguPartMenit", "waktuMulai", "kategori", "supervisorVerified", "supervisorNote", "verifiedAt", "changeReason"}) {
				return ErrForbidden
			}
		}
	}
	// Records are immutable history: cancellation changes status; never remove rows.
	for id := range previous {
		if !seen[id] {
			return ErrConflict
		}
	}
	return nil
}
func validateNonNegativeNumbers(v map[string]json.RawMessage, fields ...string) error {
	for _, field := range fields {
		if raw, exists := v[field]; exists && string(raw) != "null" {
			var value float64
			if json.Unmarshal(raw, &value) != nil || value < 0 {
				return ErrConflict
			}
		}
	}
	return nil
}

func text(v map[string]json.RawMessage, key string) string {
	var s string
	_ = json.Unmarshal(v[key], &s)
	return s
}
func changedOutside(a, b map[string]json.RawMessage, allowed []string) bool {
	permits := map[string]bool{}
	for _, k := range allowed {
		permits[k] = true
	}
	for k, v := range a {
		if !permits[k] && !bytes.Equal(v, b[k]) {
			return true
		}
	}
	for k, v := range b {
		if !permits[k] && !bytes.Equal(v, a[k]) {
			return true
		}
	}
	return false
}
func validatePM(a Actor, p, v map[string]json.RawMessage, exists bool) error {
	if a.Role == "TEKNISI" {
		if !exists {
			return ErrForbidden
		}
		prior := text(p, "status")
		status := text(v, "status")
		owner := text(p, "pelaksanaNik")
		if owner != "" && owner != a.NIK {
			return ErrConflict
		}
		if status != "DALAM_PENGERJAAN" && status != "SELESAI" {
			return ErrForbidden
		}
		if status == "SELESAI" && prior != "DALAM_PENGERJAAN" {
			return ErrConflict
		}
		if prior == "SELESAI" {
			return ErrConflict
		}
		loc, _ := time.LoadLocation("Asia/Jakarta")
		if text(v, "tanggalJatuhTempo") > time.Now().In(loc).Format("2006-01-02") {
			return ErrConflict
		}
		if text(v, "pelaksanaNik") != a.NIK {
			return ErrForbidden
		}
		if changedOutside(p, v, []string{"status", "tanggalSelesaiAktual", "pelaksanaNik", "pelaksanaNama", "hasilTemuan"}) {
			return ErrForbidden
		}
	} else if exists && text(p, "status") == "SELESAI" {
		return ErrConflict
	}
	if text(v, "machine") == "" || strings.TrimSpace(text(v, "kegiatan")) == "" {
		return ErrConflict
	}
	if _, err := time.Parse("2006-01-02", text(v, "tanggalJatuhTempo")); err != nil {
		return ErrConflict
	}
	return nil
}
