import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '@prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';

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
      if (exception.code === 'P2002') {
        status = HttpStatus.CONFLICT;

        // FIX 2: Safely cast the unknown meta property to a string
        const target = exception.meta?.target as string;
        message = `A record with this ${target} already exists.`;
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = 'Database operation failed. Please check your input.';
      }
    }
    // 3. Log completely unhandled errors to your console
    else {
      console.error('CRITICAL UNHANDLED ERROR:', exception);
    }

    // 4. Return the standardized JSON response
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: message,
    });
  }
}
