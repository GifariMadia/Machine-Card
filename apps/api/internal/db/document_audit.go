package db

import (
	"bytes"
	"encoding/json"
)

func auditDelta(before, after Document) map[string]any {
	var old, next []map[string]json.RawMessage
	if json.Unmarshal(before.Value, &old) != nil || json.Unmarshal(after.Value, &next) != nil {
		return map[string]any{"before": before, "after": after}
	}
	identity := func(row map[string]json.RawMessage) string {
		for _, key := range []string{"ticket", "id", "kode_mesin", "kodeMesin", "nik"} {
			if value := text(row, key); value != "" {
				return value
			}
		}
		raw, _ := json.Marshal(row)
		return string(raw)
	}
	previous := map[string]map[string]json.RawMessage{}
	for _, row := range old {
		previous[identity(row)] = row
	}
	changes := []map[string]any{}
	for _, row := range next {
		id := identity(row)
		oldRow := previous[id]
		a, _ := json.Marshal(oldRow)
		b, _ := json.Marshal(row)
		if !bytes.Equal(a, b) {
			changes = append(changes, map[string]any{"id": id, "before": oldRow, "after": row})
		}
		delete(previous, id)
	}
	for id, row := range previous {
		changes = append(changes, map[string]any{"id": id, "before": row, "after": nil})
	}
	return map[string]any{"before_version": before.Version, "after_version": after.Version, "records": changes}
}
