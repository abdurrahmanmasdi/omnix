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

  private normalizeHttpExceptionMessage(
    exceptionResponse: unknown,
  ): string | string[] {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
      const resObj = exceptionResponse as Record<string, unknown>;

      if (
        typeof resObj.message === 'string' ||
        (Array.isArray(resObj.message) &&
          resObj.message.every((item) => typeof item === 'string'))
      ) {
        return resObj.message as unknown as string | string[];
      }

      if (typeof resObj.error === 'string') {
        return resObj.error;
      }
    }

    return 'Error occurred';
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
      message = this.normalizeHttpExceptionMessage(exception.getResponse());
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
      this.logger.error('CRITICAL UNHANDLED ERROR');
      this.logger.error(
        exception instanceof Error
          ? exception.stack
          : JSON.stringify(exception),
      );

      if (exception instanceof Error && exception.message.trim().length > 0) {
        message = exception.message;
      }
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
