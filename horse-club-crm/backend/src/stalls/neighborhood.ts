type NeighborStall = {
  id: string; number: string | null; name: string | null; zone: string; side: string; position: number | null;
  buildingId?: string | null; row?: number; col?: number; rowSpan?: number; colSpan?: number;
  horse: { sex: string | null; name: string } | null;
};
export function stallRowPosition(stall: NeighborStall, all: NeighborStall[]) {
  if (stall.position === null) return null;
  const building = all.filter(other => other.zone === stall.zone && other.position !== null);
  const numbered = building.some(other => other.side !== stall.side) &&
    building.every(other => other.position! % 2 === (other.side === 'LEFT' ? 1 : 0)) &&
    !building.some(left => building.some(right => left.side !== right.side && left.position === right.position));
  return numbered ? Math.ceil(stall.position / 2) : stall.position;
}
export interface StallRiskSettings { stallRiskAdjacent: boolean; stallRiskOpposite: boolean }
export const defaultStallRisk: StallRiskSettings = { stallRiskAdjacent: true, stallRiskOpposite: false };

export function neighborhoodWarnings(stall: NeighborStall, all: NeighborStall[], settings: StallRiskSettings = defaultStallRisk) {
  if (!stall.horse) return [];
  if (stall.buildingId && stall.row && stall.col) {
    const rowEnd = stall.row + (stall.rowSpan ?? 1);
    const colEnd = stall.col + (stall.colSpan ?? 1);
    return all.filter(other => {
      if (other.id === stall.id || other.buildingId !== stall.buildingId || !other.horse || !other.row || !other.col) return false;
      const otherRowEnd = other.row + (other.rowSpan ?? 1);
      const otherColEnd = other.col + (other.colSpan ?? 1);
      const sharedRows = stall.row! < otherRowEnd && other.row < rowEnd;
      const sharedCols = stall.col! < otherColEnd && other.col < colEnd;
      const adjacent = (sharedRows && (colEnd === other.col || otherColEnd === stall.col)) ||
        (sharedCols && (rowEnd === other.row || otherRowEnd === stall.row));
      // Horses facing one another across an empty aisle are also a risk.
      const facing = !adjacent && sharedRows && !all.some(block => block.id !== stall.id && block.id !== other.id && block.buildingId === stall.buildingId &&
        block.row! < Math.min(rowEnd, otherRowEnd) && block.row! + (block.rowSpan ?? 1) > Math.max(stall.row!, other.row!) &&
        block.col! < Math.max(stall.col!, other.col!) && block.col! + (block.colSpan ?? 1) > Math.min(colEnd, otherColEnd));
      return ((settings.stallRiskAdjacent && adjacent) || (settings.stallRiskOpposite && facing)) && ((stall.horse!.sex === 'STALLION' && ['MARE', 'STALLION'].includes(other.horse.sex ?? '')) ||
        (stall.horse!.sex === 'MARE' && other.horse.sex === 'STALLION'));
    }).map(other => ({ neighborId: other.id, neighborNumber: other.number || other.name || 'Без номера',
      message: `Нежелательное соседство: ${stall.horse!.name} и ${other.horse!.name}` }));
  }
  if (stall.position === null) return [];
  // Include empty stalls: a vacant stall still separates two horses physically.
  const building = [stall, ...all.filter(other => other.id !== stall.id)]
    .filter(other => other.zone === stall.zone && other.position !== null);
  const row = building.filter(other => other.side === stall.side).sort((a, b) => a.position! - b.position!);
  const index = row.findIndex(other => other.id === stall.id);
  const adjacentIds = [row[index - 1]?.id, row[index + 1]?.id];
  // Legacy coordinates use shared row positions; numbered coordinates use 1/3/5 and 2/4/6.
  return all.filter(other => other.id !== stall.id && other.zone === stall.zone && other.horse && other.position !== null &&
    (other.side === stall.side ? settings.stallRiskAdjacent && adjacentIds.includes(other.id) : settings.stallRiskOpposite && stallRowPosition(other, building) === stallRowPosition(stall, building)) &&
    ((stall.horse!.sex === 'STALLION' && ['MARE', 'STALLION'].includes(other.horse.sex ?? '')) ||
      (stall.horse!.sex === 'MARE' && other.horse.sex === 'STALLION')))
    .map(other => ({ neighborId: other.id, neighborNumber: other.number ?? other.name ?? 'Без номера',
      message: stall.horse!.sex === 'MARE' || other.horse!.sex === 'MARE'
        ? `Жеребец рядом с кобылой (${stall.horse!.name} и ${other.horse!.name})`
        : `Нежелательное соседство: жеребец ${other.side === stall.side ? 'рядом с жеребцом' : 'напротив жеребца'} (${stall.horse!.name} и ${other.horse!.name})` }));
}
