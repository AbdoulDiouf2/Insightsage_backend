import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);
  private readonly isProd = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let error: string;

    if (exception instanceof ThrottlerException) {
      status = HttpStatus.TOO_MANY_REQUESTS;
      message = 'Trop de tentatives. Veuillez patienter avant de réessayer.';
      error = 'Too Many Requests';
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();

      if (typeof res === 'string') {
        message = res;
        error = exception.message;
      } else if (typeof res === 'object' && res !== null) {
        const resObj = res as Record<string, any>;
        const raw = resObj.message ?? exception.message;
        message = Array.isArray(raw) ? raw[0] : raw;
        error = resObj.error ?? HttpStatus[status] ?? 'Error';
      } else {
        message = exception.message;
        error = HttpStatus[status] ?? 'Error';
      }
    } else {
      // Erreur inattendue (non-HTTP) : 500 sans exposer les détails en prod
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = this.isProd
        ? 'Une erreur interne est survenue. Veuillez réessayer.'
        : exception instanceof Error
          ? exception.message
          : 'Internal server error';
      error = 'Internal Server Error';

      // Log complet uniquement côté serveur
      this.logger.error(
        `Unhandled exception on ${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    response.status(status).json({
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
