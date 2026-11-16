import { BadRequestException } from '@nestjs/common';
export interface GridBlock { id?: string; buildingId?: string | null; row: number; col: number; rowSpan: number; colSpan: number }
export interface BuildingGrid { gridRows: number; gridCols: number; aisleCols: number[] }
export function validateBuildingGrid(grid: BuildingGrid) {
  if (![grid.gridRows, grid.gridCols].every(n => Number.isInteger(n) && n > 0 && n <= 100) ||
    new Set(grid.aisleCols).size !== grid.aisleCols.length || grid.aisleCols.some(n => !Number.isInteger(n) || n < 1 || n > grid.gridCols))
    throw new BadRequestException('Укажите сетку от 1 до 100 и уникальные колонки прохода внутри корпуса');
}
export function validateGridBlock(block: GridBlock, grid: BuildingGrid, others: GridBlock[]) {
  if (![block.row, block.col, block.rowSpan, block.colSpan].every(n => Number.isInteger(n) && n > 0) ||
    block.row + block.rowSpan - 1 > grid.gridRows || block.col + block.colSpan - 1 > grid.gridCols)
    throw new BadRequestException('Помещение выходит за границы корпуса');
  if (others.some(other => other.id !== block.id && other.buildingId === block.buildingId &&
    block.row < other.row + other.rowSpan && other.row < block.row + block.rowSpan &&
    block.col < other.col + other.colSpan && other.col < block.col + block.colSpan))
    throw new BadRequestException('Помещение пересекается с другим блоком корпуса');
}
