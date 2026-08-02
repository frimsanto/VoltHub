import { Response } from 'express';

export interface ApiResponse<T = unknown> {
  success: boolean;
  message: string;
  data?: T;
  error?: string | object;
  meta?: {
    page?: number;
    limit?: number;
    total?: number;
    totalPages?: number;
  };
}

export const successResponse = <T>(
  res: Response,
  data: T,
  message = 'Success',
  statusCode = 200,
  meta?: ApiResponse<T>['meta']
): void => {
  const response: ApiResponse<T> = {
    success: true,
    message,
    data,
  };

  if (meta) {
    response.meta = meta;
  }

  res.status(statusCode).json(response);
};

export const errorResponse = (
  res: Response,
  message = 'Error',
  statusCode = 400,
  error?: string | object
): void => {
  const response: ApiResponse = {
    success: false,
    message,
  };

  if (error) {
    response.error = error;
  }

  res.status(statusCode).json(response);
};

export const notFoundResponse = (res: Response, message = 'Resource not found'): void => {
  errorResponse(res, message, 404);
};

export const unauthorizedResponse = (res: Response, message = 'Unauthorized'): void => {
  errorResponse(res, message, 401);
};

export const forbiddenResponse = (res: Response, message = 'Forbidden - Insufficient permissions'): void => {
  errorResponse(res, message, 403);
};

export const validationErrorResponse = (res: Response, errors: object | string): void => {
  errorResponse(res, 'Validation failed', 422, errors);
};
