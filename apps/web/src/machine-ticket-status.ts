type Ticket = { status: string; isVoid?: boolean };

// Ticket records describe workflow, not a live equipment signal or a safety release.
export function machineTicketStatus<T extends Ticket>(tickets: T[]) {
  const valid = tickets.filter((ticket) => !ticket.isVoid && ticket.status !== 'VOID');
  const outstanding = valid.find((ticket) => !['CLOSED', 'SELESAI_PERBAIKAN'].includes(ticket.status));
  const waiting = valid.find((ticket) => ticket.status === 'SELESAI_PERBAIKAN');
  if (outstanding) return { label: 'Gangguan masih ditangani', tone: 'breakdown', ticket: outstanding };
  if (waiting) return { label: 'Menunggu konfirmasi Operator', tone: 'pending', ticket: waiting };
  return { label: 'Tidak ada tiket gangguan aktif', tone: 'neutral', ticket: undefined };
}
