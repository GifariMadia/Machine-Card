package domain

import (
	"fmt"
	"math"
	"strconv"
)

type MachineStatus string

const (
	MachineStatusAktif    MachineStatus = "AKTIF"
	MachineStatusNonAktif MachineStatus = "NONAKTIF"
)

type Machine struct {
	IDMesin    int64         `json:"id_mesin"`
	KodeMesin  string        `json:"kode_mesin"`
	NamaMesin  string        `json:"nama_mesin"`
	Kategori   string        `json:"kategori"`
	Status     MachineStatus `json:"status"`
	JumlahPart int           `json:"jumlah_part"`
}

func NormalizeLimit(value any) int {
	if value == nil {
		return 50
	}

	var f float64
	switch v := value.(type) {
	case int:
		f = float64(v)
	case int32:
		f = float64(v)
	case int64:
		f = float64(v)
	case float64:
		f = v
	case float32:
		f = float64(v)
	case string:
		parsed, err := strconv.ParseFloat(v, 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return 50
		}
		f = parsed
	default:
		parsed, err := strconv.ParseFloat(fmt.Sprintf("%v", v), 64)
		if err != nil || math.IsNaN(parsed) || math.IsInf(parsed, 0) {
			return 50
		}
		f = parsed
	}

	if math.IsNaN(f) || math.IsInf(f, 0) {
		return 50
	}

	trunc := int(math.Trunc(f))
	if trunc > 100 {
		return 100
	}
	if trunc < 1 {
		return 1
	}
	return trunc
}
