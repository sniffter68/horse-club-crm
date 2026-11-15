import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CashboxSummaryDto {
  mainBalance: number;
  boardingBalance: number;
  mainOperationsCount: number;
  boardingOperationsCount: number;
}

@Injectable()
export class CashboxService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<CashboxSummaryDto> {
    const rows = await this.prisma.$queryRaw<Array<{ cashbox_type: string; current_balance_rub: string | number; operations_count: bigint | number }>>`
      SELECT cashbox_type, current_balance_rub, operations_count FROM public.v_cashbox_balances`;
    const main = rows.find(row => row.cashbox_type === 'MAIN');
    const boarding = rows.find(row => row.cashbox_type === 'BOARDING');
    return {
      mainBalance: Number(main?.current_balance_rub ?? 0),
      boardingBalance: Number(boarding?.current_balance_rub ?? 0),
      mainOperationsCount: Number(main?.operations_count ?? 0),
      boardingOperationsCount: Number(boarding?.operations_count ?? 0),
    };
  }
}
