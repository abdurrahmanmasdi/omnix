import {
  ArgumentsHost,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { I18nService } from 'nestjs-i18n';
import { GlobalExceptionFilter } from './global-exception.filter';

describe('GlobalExceptionFilter', () => {
  type FilterResponsePayload = {
    statusCode: number;
    message: string | string[];
    path: string;
    timestamp: string;
  };

  const translateMock = jest.fn(
    (key: string, options?: { args?: { field?: string } }) => {
      if (key === 'database.ERRORS.UNIQUE_CONSTRAINT_FAILED') {
        const field = options?.args?.field ?? 'value';
        return `A record with this ${field} already exists.`;
      }

      if (key === 'database.ERRORS.INTERNAL_SERVER_ERROR') {
        return 'An internal server error occurred.';
      }

      if (key === 'database.ERRORS.RECORD_NOT_FOUND') {
        return 'Requested record was not found.';
      }

      if (key === 'database.ERRORS.FOREIGN_KEY_FAILED') {
        return 'Foreign key constraint failed.';
      }

      return key;
    },
  );

  const mockJson = jest.fn<void, [FilterResponsePayload]>();
  const mockStatus = jest.fn<{ json: typeof mockJson }, [number]>(() => ({
    json: mockJson,
  }));

  const mockResponse = {
    status: mockStatus,
  };

  const mockRequest = {
    url: '/organizations/org-1/leads',
  };

  const mockHost = {
    switchToHttp: () => ({
      getResponse: () => mockResponse,
      getRequest: () => mockRequest,
    }),
  } as unknown as ArgumentsHost;

  const mockI18nService = {
    t: translateMock,
  } as unknown as I18nService;

  let filter: GlobalExceptionFilter;

  beforeEach(() => {
    jest.clearAllMocks();
    filter = new GlobalExceptionFilter(mockI18nService);
  });

  const makePrismaKnownRequestError = (
    code: string,
    meta?: Record<string, unknown>,
  ): Prisma.PrismaClientKnownRequestError => {
    return Object.assign(
      Object.create(Prisma.PrismaClientKnownRequestError.prototype),
      {
        code,
        meta,
        message: `Prisma error ${code}`,
      },
    ) as Prisma.PrismaClientKnownRequestError;
  };

  it('maps Prisma P2002 to 409 Conflict with localized message and standard payload', () => {
    const prismaException = makePrismaKnownRequestError('P2002', {
      target: ['email'],
    });

    filter.catch(prismaException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);

    const firstJsonCall = mockJson.mock.calls[0];
    expect(firstJsonCall).toBeDefined();
    const payload = firstJsonCall?.[0];

    expect(payload).toBeDefined();

    expect(payload?.statusCode).toBe(HttpStatus.CONFLICT);
    expect(payload?.message).toBe('A record with this email already exists.');
    expect(payload?.path).toBe('/organizations/org-1/leads');
    expect(typeof payload?.timestamp).toBe('string');

    expect(translateMock).toHaveBeenCalledWith(
      'database.ERRORS.UNIQUE_CONSTRAINT_FAILED',
      {
        args: { field: 'email' },
      },
    );
  });

  it('maps Prisma P2025 to 404 Not Found with localized message', () => {
    const prismaException = makePrismaKnownRequestError('P2025');

    filter.catch(prismaException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);

    const payload = mockJson.mock.calls[0]?.[0];
    expect(payload?.statusCode).toBe(HttpStatus.NOT_FOUND);
    expect(payload?.message).toBe('Requested record was not found.');
    expect(payload?.path).toBe('/organizations/org-1/leads');
  });

  it('maps Prisma P2003 to 400 Bad Request with localized message', () => {
    const prismaException = makePrismaKnownRequestError('P2003');

    filter.catch(prismaException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    const payload = mockJson.mock.calls[0]?.[0];
    expect(payload?.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(payload?.message).toBe('Foreign key constraint failed.');
    expect(payload?.path).toBe('/organizations/org-1/leads');
  });

  it('maps unknown Prisma error codes to 500 and logs unhandled code', () => {
    const loggerErrorSpy = jest
      .spyOn(
        (
          filter as unknown as {
            logger: { error: (...args: unknown[]) => void };
          }
        ).logger,
        'error',
      )
      .mockImplementation(() => undefined);

    const prismaException = makePrismaKnownRequestError('P9999');

    filter.catch(prismaException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);

    const payload = mockJson.mock.calls[0]?.[0];
    expect(payload?.statusCode).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(payload?.message).toBe('An internal server error occurred.');
    expect(payload?.path).toBe('/organizations/org-1/leads');

    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Unhandled Prisma error code: P9999',
      'Prisma error P9999',
    );
  });

  it('passes through BadRequestException validation payload without mangling', () => {
    const validationException = new BadRequestException({
      statusCode: HttpStatus.BAD_REQUEST,
      message: ['email must be an email', 'password should not be empty'],
      error: 'Bad Request',
    });

    filter.catch(validationException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);

    const payload = mockJson.mock.calls[0]?.[0];
    expect(payload?.statusCode).toBe(HttpStatus.BAD_REQUEST);
    expect(payload?.message).toEqual([
      'email must be an email',
      'password should not be empty',
    ]);
    expect(payload?.path).toBe('/organizations/org-1/leads');
  });

  it('passes through HttpException string response cleanly', () => {
    const stringException = new HttpException(
      'raw-upstream-error',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );

    filter.catch(stringException, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);

    const payload = mockJson.mock.calls[0]?.[0];
    expect(payload?.statusCode).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect(payload?.message).toBe('raw-upstream-error');
    expect(payload?.path).toBe('/organizations/org-1/leads');
  });
});
