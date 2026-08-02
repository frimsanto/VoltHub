// VoltHub — Tickets resource (API + hooks + validation).
//
// Backend (BE/src/modules/tickets): list/get (any auth), create (REPORT_WRITE
// roles — field officers may raise tickets), update/assign/close/delete
// (WRITE_ROLES). Ticket numbers are auto-generated server-side when omitted.
import { z } from "zod";
import { useQuery } from "@tanstack/react-query";
import { createResource } from "@/features/v2/createResource";
import { v2List } from "@/lib/api/v2";
import { TICKET_STATUSES, TICKET_PRIORITIES } from "@/lib/v2/enums";
import type { TicketStatus, TicketPriority } from "@/lib/v2/enums";
import type { LocationRef, UserRef } from "@/features/v2/inspections/resource";

export type { TicketStatus, TicketPriority } from "@/lib/v2/enums";

// ── Response shapes (not in the generated contract; mirror repository includes) ──
export interface Ticket {
  id: string;
  ticketNumber: string;
  locationId: string;
  category: string | null;
  priority: TicketPriority;
  status: TicketStatus;
  assignedTo: string | null;
  notes: string | null;
  openedAt: string | null;
  closedAt: string | null;
  createdAt?: string;
  updatedAt?: string;
  location?: LocationRef;
  assignee?: UserRef | null;
}

export interface TicketParams extends Record<string, unknown> {
  page?: number;
  limit?: number;
  search?: string;
  locationId?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedTo?: string;
}

export interface CreateTicket {
  locationId: string;
  category?: string | null;
  priority: TicketPriority;
  assignedTo?: string | null;
  notes?: string | null;
}

export interface UpdateTicket {
  category?: string | null;
  priority?: TicketPriority;
  status?: TicketStatus;
  assignedTo?: string | null;
  notes?: string | null;
}

export const tickets = createResource<Ticket, Ticket, CreateTicket, UpdateTicket, TicketParams>({
  key: "v2-tickets",
  path: "/tickets",
  labels: { entity: "Tiket" },
});

// ── Activity history (canonical audit trail, entityType=Ticket) ───────────────
// Audit logs are admin-only (BE/src/modules/audit-logs) — pass `enabled` from a
// capability check so field officers don't fire a 403.
export interface TicketAuditLog {
  id: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE";
  performedAt: string;
  performer?: UserRef | null;
}

export function useTicketActivity(ticketId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ["v2-tickets", "activity", ticketId],
    queryFn: () =>
      v2List<TicketAuditLog>("/audit-logs", {
        entityType: "Ticket",
        entityId: ticketId,
        limit: 50,
      }),
    enabled: !!ticketId && enabled,
  });
}

// ── Validation (create/edit form) ─────────────────────────────────────────────
export const ticketSchema = z.object({
  locationId: z.string().min(1, "Gardu wajib dipilih"),
  category: z.string().min(1, "Kategori wajib diisi").max(100),
  priority: z.enum(TICKET_PRIORITIES),
  status: z.enum(TICKET_STATUSES).optional(),
  assignedTo: z.string().nullish(),
  notes: z.string().min(1, "Deskripsi wajib diisi"),
});

export type TicketFormValues = z.infer<typeof ticketSchema>;

export const emptyTicket: TicketFormValues = {
  locationId: "",
  category: "",
  priority: "MEDIUM",
  assignedTo: null,
  notes: "",
};
