export interface StableBuilding {
  id: string; name: string; order: number; gridRows: number; gridCols: number; aisleCols: number[]
  total: number; occupied: number; available: number; roomCount: number
}
export interface Placement { id: string; buildingId: string; row: number; col: number; rowSpan: number; colSpan: number }
export function fits(block: Placement, building: StableBuilding, others: Placement[]) {
  return [block.row, block.col, block.rowSpan, block.colSpan].every(n => Number.isInteger(n) && n > 0) &&
    block.row + block.rowSpan - 1 <= building.gridRows && block.col + block.colSpan - 1 <= building.gridCols &&
    !others.some(other => other.id !== block.id && other.buildingId === block.buildingId &&
      block.row < other.row + other.rowSpan && other.row < block.row + block.rowSpan &&
      block.col < other.col + other.colSpan && other.col < block.col + block.colSpan)
}


export interface RoomDraft extends Placement { name?: string | null; number?: string | null; type?: 'STALL' | 'PONY_PEN' | 'SERVICE' }
