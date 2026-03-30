import { MembershipStatus } from '@prisma/client';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { TenantInterceptor } from './tenant.interceptor';
import { PrismaService } from '../../prisma/prisma.service';
import { RequestContextService } from '../../request-context/request-context.service';

describe('TenantInterceptor', () => {
  let interceptor: TenantInterceptor;

  const mockPrismaService = {
    organizationMembership: {
      findFirst: jest.fn(),
    },
  };

  const mockI18nService = {
    t: jest.fn((key: string) => key),
  };

  const mockRequestContextService = {
    run: jest.fn((callback: () => unknown) => callback()),
    setTenantId: jest.fn(),
  };

  beforeEach(async () => {
    // Suppress Logger output during tests
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => {});
    jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantInterceptor,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: I18nService,
          useValue: mockI18nService,
        },
        {
          provide: RequestContextService,
          useValue: mockRequestContextService,
        },
        {
          provide: Logger,
          useValue: {
            error: jest.fn(),
            warn: jest.fn(),
            debug: jest.fn(),
            log: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<TenantInterceptor>(TenantInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  describe('Missing x-organization-id header', () => {
    it('should allow request to pass through when no organization header is provided', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {}, // No x-organization-id header
        user: { id: 'user-123' },
      };
      const mockNext = {
        handle: jest.fn().mockReturnValue('next-handler-result'),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // Act
      const result = await interceptor.intercept(
        mockExecutionContext,
        mockNext,
      );

      // Assert
      expect(result).toEqual('next-handler-result');
      expect(mockNext.handle).toHaveBeenCalled();
      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Missing user ID in request', () => {
    it('should throw UnauthorizedException when user ID is not found', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {
          'x-organization-id': 'org-123',
        },
        user: undefined, // Missing user
      };
      const mockNext = {
        handle: jest.fn(),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      // Act & Assert
      await expect(
        interceptor.intercept(mockExecutionContext, mockNext),
      ).rejects.toThrow(UnauthorizedException);
      expect(mockNext.handle).not.toHaveBeenCalled();
    });
  });

  describe('User membership with pending status', () => {
    it('should throw UnauthorizedException when membership status is pending_approval', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {
          'x-organization-id': 'org-123',
        },
        user: { id: 'user-123' },
      };
      const mockNext = {
        handle: jest.fn(),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPrismaService.organizationMembership.findFirst.mockResolvedValue(
        null, // No active membership found
      );

      // Act & Assert
      await expect(
        interceptor.intercept(mockExecutionContext, mockNext),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('User membership with invited status', () => {
    it('should throw UnauthorizedException when membership status is invited', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {
          'x-organization-id': 'org-123',
        },
        user: { id: 'user-123' },
      };
      const mockNext = {
        handle: jest.fn(),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPrismaService.organizationMembership.findFirst.mockResolvedValue(
        null, // Only active memberships are returned from the query
      );

      // Act & Assert
      await expect(
        interceptor.intercept(mockExecutionContext, mockNext),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('Valid user with active membership', () => {
    it('should inject tenantId and allow request to pass', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {
          'x-organization-id': 'org-123',
        },
        user: { id: 'user-123' },
      };
      const mockNext = {
        handle: jest.fn().mockReturnValue('next-result'),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPrismaService.organizationMembership.findFirst.mockResolvedValue({
        id: 'membership-123',
        user_id: 'user-123',
        organization_id: 'org-123',
        role_id: 'role-123',
        status: MembershipStatus.ACTIVE,
      });

      // Act
      const result = await interceptor.intercept(
        mockExecutionContext,
        mockNext,
      );

      // Assert
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(mockRequest.tenantId).toBe('org-123');
      expect(mockRequestContextService.run).toHaveBeenCalledTimes(1);
      expect(mockRequestContextService.setTenantId).toHaveBeenCalledWith(
        'org-123',
      );
      expect(mockNext.handle).toHaveBeenCalled();
      expect(result).toEqual('next-result');
      expect(
        mockPrismaService.organizationMembership.findFirst,
      ).toHaveBeenCalledWith({
        where: {
          user_id: 'user-123',
          organization_id: 'org-123',
          status: MembershipStatus.ACTIVE,
        },
      });
    });
  });

  describe('Database query fails', () => {
    it('should throw UnauthorizedException when database query fails', async () => {
      // Arrange
      const mockRequest: any = {
        headers: {
          'x-organization-id': 'org-123',
        },
        user: { id: 'user-123' },
      };
      const mockNext = {
        handle: jest.fn(),
      };
      const mockExecutionContext = {
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: jest.fn().mockReturnValue(mockRequest),
        }),
      } as unknown as ExecutionContext;

      mockPrismaService.organizationMembership.findFirst.mockRejectedValue(
        new Error('Database connection failed'),
      );

      // Act & Assert
      await expect(
        interceptor.intercept(mockExecutionContext, mockNext),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
