import { randomUUID } from 'crypto';
import { ticketRepository, TicketRepository } from './ticket.repository';
import { ConflictError, NotFoundError } from '../../utils/appError';
import { recordAuditLog } from '../../utils/auditLog';
import { notificationDispatcher } from '../notifications/notification.dispatcher';
import type { TenantScope } from '../../utils/tenantScope';
import type {
  CreateTicketInput,
  UpdateTicketInput,
  AssignTicketInput,
  CloseTicketInput,
  ListTicketQuery,
} from './ticket.validation';

/**
 * Ticket Service — service & maintenance tickets attached to a Gardu (EPIC-5).
 * FK integrity (site + assignee), unique ticketNumber, and status transitions
 * are enforced here; every mutation is written to the canonical audit trail.
 */
export class TicketService {
  constructor(private readonly repo: TicketRepository = ticketRepository) {}

  async list(query: ListTicketQuery, scope: TenantScope) {
    const { data, total, page, limit } = await this.repo.findAll(query, scope);
    return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string, scope: TenantScope) {
    const ticket = await this.repo.findById(id, scope);
    if (!ticket) throw new NotFoundError('Ticket not found');
    return ticket;
  }

  private async assertLocationExists(locationId: string, scope: TenantScope) {
    const location = await this.repo.locationExists(locationId, scope);
    if (!location) throw new NotFoundError(`Gardu/Site "${locationId}" not found`);
  }

  private async assertUserExists(userId: string) {
    const user = await this.repo.userExists(userId);
    if (!user) throw new NotFoundError(`Assignee "${userId}" not found`);
  }

  private async generateTicketNumber(): Promise<string> {
    const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    for (let i = 0; i < 5; i += 1) {
      const candidate = `TKT-${ymd}-${randomUUID().slice(0, 6).toUpperCase()}`;
      if (!(await this.repo.findByNumber(candidate))) return candidate;
    }
    throw new ConflictError('Failed to generate a unique ticket number');
  }

  async create(input: CreateTicketInput, userId: string | undefined, scope: TenantScope) {
    const locationId = (input.siteId ?? input.locationId) as string;
    await this.assertLocationExists(locationId, scope);
    if (input.assignedTo) await this.assertUserExists(input.assignedTo);

    let ticketNumber = input.ticketNumber;
    if (ticketNumber) {
      if (await this.repo.findByNumber(ticketNumber)) {
        throw new ConflictError(`Ticket number "${ticketNumber}" already exists`);
      }
    } else {
      ticketNumber = await this.generateTicketNumber();
    }

    const status = input.assignedTo ? 'ASSIGNED' : 'OPEN';
    const created = await this.repo.create({
      locationId,
      ticketNumber,
      category: input.category ?? null,
      priority: input.priority,
      status,
      assignedTo: input.assignedTo ?? null,
      notes: input.notes ?? null,
    });
    await recordAuditLog({
      entityType: 'Ticket',
      entityId: created.id,
      action: 'CREATE',
      newValue: created,
      performedBy: userId,
    });
    // Notify assignee (or admin triage pool) about the new ticket.
    notificationDispatcher.ticketCreated({
      ticketId: created.id,
      ticketNumber: created.ticketNumber,
      assignedTo: created.assignedTo,
      actorId: userId,
      detail: [created.priority, created.category].filter(Boolean).join(' · ') || null,
    });
    return created;
  }

  async update(id: string, input: UpdateTicketInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    if (input.assignedTo) await this.assertUserExists(input.assignedTo);

    const updated = await this.repo.update(id, input);
    const action = input.status && input.status !== current.status ? 'STATUS_CHANGE' : 'UPDATE';
    await recordAuditLog({
      entityType: 'Ticket',
      entityId: id,
      action,
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    return updated;
  }

  async assign(id: string, input: AssignTicketInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    await this.assertUserExists(input.assignedTo);
    const updated = await this.repo.update(id, { assignedTo: input.assignedTo, status: 'ASSIGNED' });
    await recordAuditLog({
      entityType: 'Ticket',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    // New task assigned → notify the assignee.
    notificationDispatcher.taskAssigned({
      assigneeId: input.assignedTo,
      actorId: userId,
      entityType: 'Ticket',
      entityId: id,
      ref: updated.ticketNumber,
      detail: [updated.priority, updated.category].filter(Boolean).join(' · ') || null,
    });
    return updated;
  }

  async close(id: string, input: CloseTicketInput, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    const updated = await this.repo.update(id, {
      status: 'CLOSED',
      closedAt: new Date(),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    });
    await recordAuditLog({
      entityType: 'Ticket',
      entityId: id,
      action: 'STATUS_CHANGE',
      oldValue: current,
      newValue: updated,
      performedBy: userId,
    });
    // Notify the assignee (or admin pool) that the ticket was closed.
    notificationDispatcher.ticketClosed({
      ticketId: id,
      ticketNumber: updated.ticketNumber,
      assignedTo: updated.assignedTo,
      actorId: userId,
    });
    return updated;
  }

  async remove(id: string, userId: string | undefined, scope: TenantScope) {
    const current = await this.getById(id, scope);
    await this.repo.softDelete(id);
    await recordAuditLog({
      entityType: 'Ticket',
      entityId: id,
      action: 'DELETE',
      oldValue: current,
      performedBy: userId,
    });
  }
}

export const ticketService = new TicketService();
