import { Response, NextFunction } from 'express';
import { AuthRequest } from '../../middlewares/auth';
import { successResponse } from '../../utils/response';
import { resolveRequestScope } from '../../utils/tenantScope';
import { ticketService } from './ticket.service';
import type {
  CreateTicketInput,
  UpdateTicketInput,
  AssignTicketInput,
  CloseTicketInput,
  ListTicketQuery,
} from './ticket.validation';

export class TicketController {
  list = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const { data, meta } = await ticketService.list(req.query as unknown as ListTicketQuery, scope);
      successResponse(res, data, 'Tickets retrieved successfully', 200, meta);
    } catch (err) {
      next(err);
    }
  };

  getById = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const ticket = await ticketService.getById(req.params.id, scope);
      successResponse(res, ticket, 'Ticket retrieved successfully');
    } catch (err) {
      next(err);
    }
  };

  create = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const ticket = await ticketService.create(req.body as CreateTicketInput, req.user?.userId, scope);
      successResponse(res, ticket, 'Ticket created successfully', 201);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const ticket = await ticketService.update(
        req.params.id,
        req.body as UpdateTicketInput,
        req.user?.userId,
        scope
      );
      successResponse(res, ticket, 'Ticket updated successfully');
    } catch (err) {
      next(err);
    }
  };

  assign = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const ticket = await ticketService.assign(
        req.params.id,
        req.body as AssignTicketInput,
        req.user?.userId,
        scope
      );
      successResponse(res, ticket, 'Ticket assigned successfully');
    } catch (err) {
      next(err);
    }
  };

  close = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      const ticket = await ticketService.close(
        req.params.id,
        req.body as CloseTicketInput,
        req.user?.userId,
        scope
      );
      successResponse(res, ticket, 'Ticket closed successfully');
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
      const scope = await resolveRequestScope(req.user);
      await ticketService.remove(req.params.id, req.user?.userId, scope);
      successResponse(res, null, 'Ticket deleted successfully');
    } catch (err) {
      next(err);
    }
  };
}

export const ticketController = new TicketController();
