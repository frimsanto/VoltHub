import { describe, it, expect } from 'vitest';
import { renderEvent, NOTIFICATION_TYPES } from './notification.events';

describe('notification events catalog', () => {
  it('defines a template for all seven trigger events', () => {
    expect(NOTIFICATION_TYPES).toEqual([
      'TASK_ASSIGNED',
      'REPORT_SUBMITTED',
      'REPORT_APPROVED',
      'REPORT_REJECTED',
      'REVISION_REQUESTED',
      'TICKET_CREATED',
      'TICKET_CLOSED',
    ]);
  });

  it('renders a title + body for every type', () => {
    for (const type of NOTIFICATION_TYPES) {
      const r = renderEvent(type, { ref: 'TKT-1', reason: 'kurang foto' });
      expect(r.title.length).toBeGreaterThan(0);
      expect(r.body.length).toBeGreaterThan(0);
    }
  });

  it('embeds the reason for reject / revision', () => {
    expect(renderEvent('REPORT_REJECTED', { reason: 'data tidak lengkap' }).body).toContain(
      'data tidak lengkap'
    );
    expect(renderEvent('REVISION_REQUESTED', { reason: 'foto buram' }).body).toContain(
      'foto buram'
    );
  });

  it('uses the ref label when provided', () => {
    expect(renderEvent('TASK_ASSIGNED', { ref: 'TKT-2026-ABC' }).body).toContain('TKT-2026-ABC');
  });
});
