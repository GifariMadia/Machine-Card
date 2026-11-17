package db

import (
	"encoding/json"
	"strings"
	"time"
)

func canonicalDocument(a Actor, key string, before, after json.RawMessage) json.RawMessage {
	now := time.Now().UTC()
	stamp := now.Format(time.RFC3339Nano)
	if strings.HasPrefix(key, "machine-card-shift-closing-") {
		var value map[string]any
		if json.Unmarshal(after, &value) == nil {
			value["closedAt"] = stamp
			value["closedBy"] = a.Name + " (" + a.NIK + ")"
			raw, _ := json.Marshal(value)
			return raw
		}
		return after
	}
	if key != "machine-card-open-work" {
		return after
	}
	var old, values []map[string]json.RawMessage
	_ = json.Unmarshal(before, &old)
	if json.Unmarshal(after, &values) != nil {
		return after
	}
	prior := map[string]map[string]json.RawMessage{}
	for _, item := range old {
		prior[text(item, "ticket")] = item
	}
	set := func(value map[string]json.RawMessage, key string, data any) {
		raw, _ := json.Marshal(data)
		value[key] = raw
	}
	for _, item := range values {
		p, exists := prior[text(item, "ticket")]
		status := text(item, "status")
		previous := text(p, "status")
		if !exists {
			if a.Role == "ADMIN" {
				set(item, "importedAt", stamp)
			} else {
				set(item, "createdAt", stamp)
				set(item, "reporter", a.NIK)
				set(item, "reporterName", a.Name)
				if start, err := recordTime(text(item, "waktuMulai")); err == nil {
					set(item, "waktuMulai", start.UTC().Format(time.RFC3339Nano))
				}
			}
		}
		if a.Role == "TEKNISI" && exists {
			if value, ok := p["waktuMulai"]; ok {
				item["waktuMulai"] = value
			}
			if value, ok := p["waktuMulaiTeknisi"]; ok {
				item["waktuMulaiTeknisi"] = value
			}
		}
		if status == previous {
			continue
		}
		switch status {
		case "IN_PROGRESS":
			if previous == "OPEN" {
				set(item, "waktuMulaiTeknisi", stamp)
			}
			if a.Role == "TEKNISI" {
				set(item, "technicianNik", a.NIK)
				set(item, "technicianName", a.Name)
			}
		case "SELESAI_PERBAIKAN":
			set(item, "waktuSelesai", stamp)
			start, err := time.Parse(time.RFC3339Nano, text(item, "waktuMulaiTeknisi"))
			if err == nil {
				var wait float64
				_ = json.Unmarshal(item["durasiTungguMenit"], &wait)
				if wait < 0 {
					wait = 0
				}
				minutes := now.Sub(start).Minutes() - wait
				if minutes < 0 {
					minutes = 0
				}
				set(item, "durasiPerbaikanMenit", minutes)
			}
		case "CLOSED":
			set(item, "closedAt", stamp)
			set(item, "penutupNik", a.NIK)
			set(item, "penutupName", a.Name)
		case "VOID":
			set(item, "voidAt", stamp)
			set(item, "voidBy", a.Name+" ("+a.NIK+")")
		}
	}
	raw, _ := json.Marshal(values)
	return raw
}
