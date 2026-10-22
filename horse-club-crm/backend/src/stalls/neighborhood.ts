type NeighborStall = {
  id: string; number: string | null; name: string; zone: string; side: string; position: number | null;
  horse: { sex: string | null; name: string } | null;
};
export function neighborhoodWarnings(stall: NeighborStall, all: NeighborStall[]) {
  if (!stall.horse || stall.position === null) return [];
  return all.filter(other => other.id !== stall.id && other.zone === stall.zone && other.horse && other.position !== null &&
    (other.side === stall.side ? Math.abs(other.position - stall.position!) === 1 : other.position === stall.position) &&
    ((stall.horse!.sex === 'STALLION' && ['MARE', 'STALLION'].includes(other.horse.sex ?? '')) ||
      (stall.horse!.sex === 'MARE' && other.horse.sex === 'STALLION')))
    .map(other => ({ neighborId: other.id, neighborNumber: other.number ?? other.name,
      message: stall.horse!.sex === 'MARE' || other.horse!.sex === 'MARE'
        ? `Жеребец рядом с кобылой (${stall.horse!.name} и ${other.horse!.name})`
        : `Нежелательное соседство: жеребец ${other.side === stall.side ? 'рядом с жеребцом' : 'напротив жеребца'} (${stall.horse!.name} и ${other.horse!.name})` }));
}
