import { Router } from 'express';
import { authenticate } from '../../middlewares/auth';
import { authorize } from '../../middlewares/rbac';
import { validate } from '../../middlewares/validate';
import { WRITE_ROLES, REPORT_WRITE_ROLES } from '../../auth/roles';
import { ticketController } from './ticket.controller';
import {
  createTicketSchema,
  updateTicketSchema,
  assignTicketSchema,
  closeTicketSchema,
  listTicketQuerySchema,
  idParamSchema,
} from './ticket.validation';

/**
 * Ticket routes (EPIC-5 Story 16).
 * RBAC (Permission Matrix — Ticket create/assign/close):
 *   read   = all authenticated
 *   create = SUPER_ADMIN, ADMIN, PETUGAS (field officers may raise tickets)
 *   manage (update/assign/close/delete) = SUPER_ADMIN, ADMIN
 */
const router = Router();
router.use(authenticate);

router.get('/', validate(listTicketQuerySchema, 'query'), ticketController.list);
router.get('/:id', validate(idParamSchema, 'params'), ticketController.getById);

router.post('/', authorize(...REPORT_WRITE_ROLES), validate(createTicketSchema), ticketController.create);

router.put(
  '/:id',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(updateTicketSchema),
  ticketController.update
);
router.post(
  '/:id/assign',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(assignTicketSchema),
  ticketController.assign
);
router.post(
  '/:id/close',
  authorize(...WRITE_ROLES),
  validate(idParamSchema, 'params'),
  validate(closeTicketSchema),
  ticketController.close
);
router.delete('/:id', authorize(...WRITE_ROLES), validate(idParamSchema, 'params'), ticketController.remove);

export default router;
