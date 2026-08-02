import { NotificationType } from '@prisma/client';

/**
 * Notification event catalog.
 *
 * Maps each of the seven canonical trigger events to a copy template and the
 * deep-link metadata. Keeping the templates here (one source of truth) means the
 * dispatcher helpers stay thin and the wording is consistent across in-app and
 * push channels. Copy is Indonesian to match the rest of the VoltHub UI.
 */

/** Context passed to a template to render the per-notification title/body. */
export interface EventContext {
  /** Human label for the entity (e.g. report number, ticket number). */
  ref?: string | null;
  /** Display name of the actor who triggered the event (optional). */
  actorName?: string | null;
  /** Free-text reason (rejection / revision). */
  reason?: string | null;
  /** Extra detail (e.g. ticket category / priority). */
  detail?: string | null;
  /** Type of the entity (e.g., 'WorkOrder', 'Ticket'). */
  entityType?: string | null;
}

export interface RenderedEvent {
  title: string;
  body: string;
}

type Template = (ctx: EventContext) => RenderedEvent;

const ref = (c: EventContext, fallback: string) => c.ref?.trim() || fallback;

export const EVENT_TEMPLATES: Record<NotificationType, Template> = {
  TASK_ASSIGNED: (c) => {
    if (c.entityType === 'WorkOrder' || c.ref?.startsWith('WO-')) {
      return {
        title: 'WO baru ditugaskan',
        body: `WO baru ditugaskan: ${ref(c, '')}`,
      };
    }
    return {
      title: 'Tugas baru ditugaskan',
      body: `Anda ditugaskan pada ${ref(c, 'sebuah tugas')}${
        c.detail ? ` (${c.detail})` : ''
      }.`,
    };
  },
  REPORT_SUBMITTED: (c) => {
    if (c.entityType === 'WorkOrder' || c.ref?.startsWith('WO-')) {
      return {
        title: 'WO menunggu approval',
        body: `WO menunggu approval: ${ref(c, '')}`,
      };
    }
    return {
      title: 'Laporan diajukan',
      body: `${ref(c, 'Sebuah laporan')} telah diajukan${
        c.actorName ? ` oleh ${c.actorName}` : ''
      } dan menunggu tinjauan.`,
    };
  },
  REPORT_APPROVED: (c) => {
    if (c.entityType === 'WorkOrder' || c.ref?.startsWith('WO-')) {
      return {
        title: 'Laporan WO disetujui',
        body: `Laporan WO disetujui: ${ref(c, '')}`,
      };
    }
    return {
      title: 'Laporan disetujui',
      body: `${ref(c, 'Laporan Anda')} telah disetujui.`,
    };
  },
  REPORT_REJECTED: (c) => {
    if (c.entityType === 'WorkOrder' || c.ref?.startsWith('WO-')) {
      return {
        title: 'WO ditolak — Tidak Sesuai',
        body: `WO ditolak — Tidak Sesuai: ${ref(c, '')}${c.reason ? `. Alasan: ${c.reason}` : ''}`,
      };
    }
    return {
      title: 'Laporan ditolak',
      body: `${ref(c, 'Laporan Anda')} ditolak${
        c.reason ? `: ${c.reason}` : '.'
      }`,
    };
  },
  REVISION_REQUESTED: (c) => ({
    title: 'Revisi diminta',
    body: `${ref(c, 'Laporan Anda')} memerlukan revisi${
      c.reason ? `: ${c.reason}` : '.'
    }`,
  }),
  TICKET_CREATED: (c) => ({
    title: 'Tiket baru dibuat',
    body: `Tiket ${ref(c, 'baru')} telah dibuat${
      c.detail ? ` (${c.detail})` : ''
    }.`,
  }),
  TICKET_CLOSED: (c) => ({
    title: 'Tiket ditutup',
    body: `Tiket ${ref(c, '')} telah ditutup.`.replace('Tiket  ', 'Tiket '),
  }),
};

/** Render an event's copy from its type + context. */
export const renderEvent = (type: NotificationType, ctx: EventContext): RenderedEvent =>
  EVENT_TEMPLATES[type](ctx);

/** All seven canonical event types, for validation/enumeration. */
export const NOTIFICATION_TYPES = Object.keys(EVENT_TEMPLATES) as NotificationType[];
