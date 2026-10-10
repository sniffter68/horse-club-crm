export const reminder24hKey = (bookingId: string, start: Date, peer: bigint) =>
  `reminder24h:${bookingId}:${start.toISOString()}:${peer}`;
