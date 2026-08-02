import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export const requestLogger = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl;
    const status = res.statusCode;
    const user = req.user?.email || 'anonymous';
    
    console.log(`[${timestamp}] ${method} ${url} ${status} - ${duration}ms - ${user}`);
  });
  
  next();
};
