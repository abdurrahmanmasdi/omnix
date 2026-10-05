import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Existing domain codes win. Uncoded HTTP errors receive a stable status code;
// the message stays available to old clients and for unknown-code fallback.
export function codedHttpResponse(exception: HttpException) {
  const response = exception.getResponse();
  const body = typeof response === 'string' ? { message: response } : response;
  return {
    statusCode: exception.getStatus(),
    ...body,
    code: 'code' in body ? body.code : `HTTP_${exception.getStatus()}`,
  };
}

@Catch(HttpException)
export class HttpErrorCodeFilter extends BaseExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    super.catch(
      new HttpException(codedHttpResponse(exception), exception.getStatus()),
      host,
    );
  }
}
