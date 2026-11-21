import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { currentCashBalance } from '../payments/finance.service';
import { cashboxBalances } from '../payments/cashbox-balances';

export interface CashboxSummaryDto {
  mainBalance: number;
  boardingBalance: number;
  mainOperationsCount: number;
  boardingOperationsCount: number;
  balanceCash: string;
  balanceCard: string;
  balanceTotal: string;
}

@Injectable()
export class CashboxService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(): Promise<CashboxSummaryDto> {
    return this.prisma.$transaction(async tx => {
      const asOf = new Date();
      const [balance, boxes] = await Promise.all([currentCashBalance(tx, asOf), cashboxBalances(tx, asOf)]);
      return { ...boxes, mainBalance: Number(boxes.mainBalance), boardingBalance: Number(boxes.boardingBalance),
        balanceCash: balance.balanceCash.toFixed(2), balanceCard: balance.balanceCard.toFixed(2), balanceTotal: balance.balanceTotal.toFixed(2) };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
