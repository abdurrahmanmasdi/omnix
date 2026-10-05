import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { codedHttpResponse } from './http-error-code.filter';

describe('staff HTTP error codes', () => {
  it('keeps an existing domain code and message', () => {
    expect(
      codedHttpResponse(
        new ForbiddenException({ code: 'NO_PERMISSION', message: 'Denied' }),
      ),
    ).toEqual({ statusCode: 403, code: 'NO_PERMISSION', message: 'Denied' });
  });
  it('adds a stable code to validation errors without discarding details', () => {
    expect(
      codedHttpResponse(new BadRequestException(['locale must be valid'])),
    ).toMatchObject({ code: 'HTTP_400', message: ['locale must be valid'] });
  });
});
