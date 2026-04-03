import {
  Injectable,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { I18nService } from 'nestjs-i18n';
import { CreateBankAccountDto } from './dtos/create-bank-account.dto';
import { UpdateBankAccountDto } from './dtos/update-bank-account.dto';
import { BankAccount } from '@prisma/client';

@Injectable()
export class BankAccountsService {
  private readonly logger = new Logger(BankAccountsService.name);

  constructor(
    private prisma: PrismaService,
    private i18n: I18nService,
  ) {}

  async create(
    organizationId: string,
    createDto: CreateBankAccountDto,
  ): Promise<BankAccount> {
    try {
      if (createDto.is_default) {
        // If this one is default, unset default for others
        await this.prisma.bankAccount.updateMany({
          where: { organization_id: organizationId, is_default: true },
          data: { is_default: false },
        });
      }

      return await this.prisma.bankAccount.create({
        data: {
          ...createDto,
          organization_id: organizationId,
        },
      });
    } catch (error) {
      this.logger.error(`Error creating bank account: ${error}`);
      throw new InternalServerErrorException('Failed to create bank account');
    }
  }

  async findAll(organizationId: string): Promise<BankAccount[]> {
    try {
      return await this.prisma.bankAccount.findMany({
        where: { organization_id: organizationId },
        orderBy: { created_at: 'desc' },
      });
    } catch (error) {
      this.logger.error(`Error fetching bank accounts: ${error}`);
      throw new InternalServerErrorException('Failed to fetch bank accounts');
    }
  }

  async findOne(organizationId: string, id: string): Promise<BankAccount> {
    try {
      const account = await this.prisma.bankAccount.findFirst({
        where: { id, organization_id: organizationId },
      });

      if (!account) {
        throw new NotFoundException(`Bank account not found`);
      }

      return account;
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error fetching bank account: ${error}`);
      throw new InternalServerErrorException('Failed to fetch bank account');
    }
  }

  async update(
    organizationId: string,
    id: string,
    updateDto: UpdateBankAccountDto,
  ): Promise<BankAccount> {
    try {
      await this.findOne(organizationId, id); // verify exists

      if (updateDto.is_default) {
        // If setting to default, unset default for others
        await this.prisma.bankAccount.updateMany({
          where: {
            organization_id: organizationId,
            is_default: true,
            id: { not: id },
          },
          data: { is_default: false },
        });
      }

      return await this.prisma.bankAccount.update({
        where: { id },
        data: updateDto,
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error updating bank account: ${error}`);
      throw new InternalServerErrorException('Failed to update bank account');
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    try {
      await this.findOne(organizationId, id); // verify exists
      await this.prisma.bankAccount.delete({
        where: { id },
      });
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      this.logger.error(`Error deleting bank account: ${error}`);
      throw new InternalServerErrorException('Failed to delete bank account');
    }
  }
}
