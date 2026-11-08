export type ReminderKind = '24h' | '2h';

export const reminderKey = (kind: ReminderKind, bookingId: string, start: Date, peer: bigint) =>
  `reminder${kind}:${bookingId}:${start.toISOString()}:${peer}`;

export const reminder24hKey = (bookingId: string, start: Date, peer: bigint) =>
  reminderKey('24h', bookingId, start, peer);

export const reminderKind = (key: string): ReminderKind | undefined =>
  key.startsWith('reminder24h:') ? '24h' : key.startsWith('reminder2h:') ? '2h' : undefined;
