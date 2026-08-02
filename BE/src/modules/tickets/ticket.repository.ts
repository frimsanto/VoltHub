import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { viaLocationScopeWhere, locationScopeWhere, type TenantScope } from '../../utils/tenantScope';
import type { ListTicketQuery } from './ticket.validation';

export interface CreateTicketData {
  locationId: string;
  ticketNumber: string;
  category?: string | null;
  priority: Prisma.TicketCreateInput['priority'];
  status: Prisma.TicketCreateInput['status'];
  assignedTo?: string | null;
  notes?: string | null;
  openedAt?: Date | null;
}

export interface UpdateTicketData {
  category?: string | null;
  priority?: Prisma.TicketUpdateInput['priority'];
  status?: Prisma.TicketUpdateInput['status'];
  assignedTo?: string | null;
  notes?: string | null;
  closedAt?: Date | null;
}

/**
 * Ticket Repository — Prisma access for `tickets`. Reads exclude soft-deleted.
 */
export class TicketRepository {
  private notDeleted = { deletedAt: null } satisfies Prisma.TicketWhereInput;

  async findAll(query: ListTicketQuery, scope: TenantScope) {
    const { page, limit, search, status, priority, assignedTo } = query;
    const locationId = query.siteId ?? query.locationId;
    const skip = (page - 1) * limit;

    const where: Prisma.TicketWhereInput = {
      ...this.notDeleted,
      ...viaLocationScopeWhere(scope),
      ...(locationId ? { locationId } : {}),
      ...(status ? { status } : {}),
      ...(priority ? { priority } : {}),
      ...(assignedTo ? { assignedTo } : {}),
      ...(search
        ? { OR: [{ ticketNumber: { contains: search, mode: 'insensitive' as const } }, { category: { contains: search, mode: 'insensitive' as const } }] }
        : {}),
    };

    const [data, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          location: { select: { id: true, code: true, name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  findById(id: string, scope?: TenantScope) {
    return prisma.ticket.findFirst({
      where: { id, ...this.notDeleted, ...(scope ? viaLocationScopeWhere(scope) : {}) },
      include: {
        location: { select: { id: true, code: true, name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  }

  findByNumber(ticketNumber: string) {
    return prisma.ticket.findUnique({ where: { ticketNumber } });
  }

  create(data: CreateTicketData) {
    return prisma.ticket.create({
      data: {
        locationId: data.locationId,
        ticketNumber: data.ticketNumber,
        category: data.category ?? null,
        priority: data.priority,
        status: data.status,
        assignedTo: data.assignedTo ?? null,
        notes: data.notes ?? null,
        openedAt: data.openedAt ?? new Date(),
      },
    });
  }

  update(id: string, data: UpdateTicketData) {
    return prisma.ticket.update({
      where: { id },
      data: {
        ...(data.category !== undefined ? { category: data.category } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assignedTo !== undefined ? { assignedTo: data.assignedTo } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {}),
        ...(data.closedAt !== undefined ? { closedAt: data.closedAt } : {}),
      },
    });
  }

  softDelete(id: string) {
    return prisma.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  locationExists(locationId: string, scope?: TenantScope) {
    return prisma.location.findFirst({
      where: { id: locationId, deletedAt: null, ...(scope ? locationScopeWhere(scope) : {}) },
      select: { id: true },
    });
  }

  userExists(userId: string) {
    return prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  }
}

export const ticketRepository = new TicketRepository();
