interface ClientLessonWindow {
  status: string; startTime: Date;
  lesson?: { status: string; deletedAt: Date | null; startTime: Date;
    service?: { cancellationWindowHours: number } | null; _count?: { bookings: number } } | null;
}

export const clientChangeWindowHours = (row: ClientLessonWindow): number => row.lesson?.service?.cancellationWindowHours ?? 24;

export function clientCanReschedule(row: ClientLessonWindow, now = Date.now()): boolean {
  return row.status === 'scheduled' && (!row.lesson || row.lesson.status === 'SCHEDULED' && !row.lesson.deletedAt)
    && (row.lesson?._count?.bookings ?? 1) === 1
    && +(row.lesson?.startTime ?? row.startTime) - now > clientChangeWindowHours(row) * 3600000;
}
