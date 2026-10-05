import type { ErrorRequestHandler } from 'express';
import { safeRequestUrl } from './requestLogging';

export const httpErrorHandler: ErrorRequestHandler = (error, req, res, next) => {
    if (res.headersSent || res.destroyed) return next(error);
    const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599
        ? error.status : 500;
    if (status >= 500)
        console.error('HTTP request failed:', req.method, safeRequestUrl(req.originalUrl),
            error instanceof Error ? error.name : 'Unknown error');
    const messages: Record<number, string> = {
        400: 'Invalid request',
        404: 'Not found',
        413: 'Request body is too large',
        415: 'Unsupported request body encoding',
    };
    res.status(status).send({ error: messages[status] ?? 'Internal server error' });
};
