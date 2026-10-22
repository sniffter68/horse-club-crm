type NeighborStall = {
  id: string; number: string | null; name: string; zone: string; side: string; position: number | null;
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
export function neighborhoodWarnings(stall: NeighborStall, all: NeighborStall[]) {
  if (!stall.horse || stall.position === null) return [];
  // Include empty stalls: a vacant stall still separates two horses physically.
  const building = [stall, ...all.filter(other => other.id !== stall.id)]
    .filter(other => other.zone === stall.zone && other.position !== null);
  const row = building.filter(other => other.side === stall.side).sort((a, b) => a.position! - b.position!);
  const index = row.findIndex(other => other.id === stall.id);
  const adjacentIds = [row[index - 1]?.id, row[index + 1]?.id];
  // Legacy coordinates use shared row positions; numbered coordinates use 1/3/5 and 2/4/6.
  return all.filter(other => other.id !== stall.id && other.zone === stall.zone && other.horse && other.position !== null &&
    (other.side === stall.side ? adjacentIds.includes(other.id) : stallRowPosition(other, building) === stallRowPosition(stall, building)) &&
    ((stall.horse!.sex === 'STALLION' && ['MARE', 'STALLION'].includes(other.horse.sex ?? '')) ||
      (stall.horse!.sex === 'MARE' && other.horse.sex === 'STALLION')))
    .map(other => ({ neighborId: other.id, neighborNumber: other.number ?? other.name,
      message: stall.horse!.sex === 'MARE' || other.horse!.sex === 'MARE'
        ? `Жеребец рядом с кобылой (${stall.horse!.name} и ${other.horse!.name})`
        : `Нежелательное соседство: жеребец ${other.side === stall.side ? 'рядом с жеребцом' : 'напротив жеребца'} (${stall.horse!.name} и ${other.horse!.name})` }));
}
