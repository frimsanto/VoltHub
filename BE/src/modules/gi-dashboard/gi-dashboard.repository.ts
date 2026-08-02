import prisma from '../../config/database';
import { LocationType } from '@prisma/client';

export class GiDashboardRepository {
  /** Fetch all active teams in the RTUPP scope or globally. */
  async getTeams(rtuppId: string | null) {
    return prisma.team.findMany({
      where: {
        isActive: true,
        ...(rtuppId ? { rtuppId } : {}),
      },
      select: {
        id: true,
        name: true,
      },
    });
  }

  /** Fetch all active petugas in the RTUPP scope or globally. */
  async getPetugasUsers(rtuppId: string | null) {
    return prisma.user.findMany({
      where: {
        isActive: true,
        role: 'PETUGAS',
        ...(rtuppId ? { rtuppId } : {}),
      },
      include: {
        rtupp: { select: { name: true } },
        team: { select: { name: true } },
      },
    });
  }

  /**
   * Fetch all non-deleted work orders under GI locations in the RTUPP scope or globally.
   * Includes location, team, and assignee relationships.
   */
  async getWorkOrders(rtuppId: string | null) {
    return prisma.workOrder.findMany({
      where: {
        deletedAt: null,
        location: {
          locationType: LocationType.GI,
          ...(rtuppId ? { rtuppId } : {}),
        },
      },
      include: {
        location: { select: { name: true, code: true } },
        team: { select: { name: true } },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /** Resolve the RTUPP an ADMIN belongs to. */
  async getUserRtuppId(userId: string): Promise<string | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { rtuppId: true },
    });
    return user?.rtuppId ?? null;
  }
}

export const giDashboardRepository = new GiDashboardRepository();
