import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { validationErrorResponse } from '../utils/response';

type RequestPart = 'body' | 'query' | 'params';

/**
 * Zod validation middleware for the V2 modular domain.
 *
 * Validates a request part against a schema, writes the parsed (and defaulted)
 * value back so controllers consume clean data, and short-circuits with a 422
 * ApiResponse on failure.
 */
export const validate =
  (schema: ZodSchema, part: RequestPart = 'body') =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[part]);

    if (!result.success) {
      validationErrorResponse(res, result.error.format());
      return;
    }

    // Reassign parsed value (applies defaults/coercion). For `query`/`params`,
    // mutate in place since those properties are read-only getters in Express 5.
    if (part === 'body') {
      req.body = result.data;
    } else {
      Object.assign(req[part] as object, result.data);
    }

    next();
  };
