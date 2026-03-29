import {
  Logger,
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  private extractPrismaTarget(target: unknown): string | undefined {
    if (Array.isArray(target)) {
      return target
        .filter((item): item is string => typeof item === 'string')
        .join(', ');
    }

    if (typeof target === 'string') {
      return target;
    }

    return undefined;
  }

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = this.i18n.t(
      'database.ERRORS.INTERNAL_SERVER_ERROR',
    );

    // 1. Handle standard NestJS HTTP Errors
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // FIX 1: Safe type checking without using "any"
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resObj = exceptionResponse as Record<string, unknown>;
        message = (resObj.message as string | string[]) || 'Error occurred';
      } else {
        message = exceptionResponse;
      }
    }
    // 2. Handle Prisma Database Errors
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const targetField = this.extractPrismaTarget(exception.meta?.target);

          message = targetField
            ? this.i18n.t('database.ERRORS.UNIQUE_CONSTRAINT_FAILED', {
                args: { field: targetField },
              })
            : this.i18n.t('database.ERRORS.UNIQUE_CONSTRAINT_FAILED', {
                args: { field: 'value' },
              });
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = this.i18n.t('database.ERRORS.RECORD_NOT_FOUND');
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = this.i18n.t('database.ERRORS.FOREIGN_KEY_FAILED');
          break;
        default:
          status = HttpStatus.INTERNAL_SERVER_ERROR;
          message = this.i18n.t('database.ERRORS.INTERNAL_SERVER_ERROR');

          this.logger.error(
            `Unhandled Prisma error code: ${exception.code}`,
            exception.message,
          );
          break;
      }
    }
    // 3. Log completely unhandled errors to your console
    else {
      this.logger.error('CRITICAL UNHANDLED ERROR', exception);
    }

    // 4. Return the standardized JSON response
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
    });
  }
}
