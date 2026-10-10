import { toInstant } from '../schedule/time'

export interface LeadFormValues {
  firstName: string; lastName?: string; phone: string; email?: string; preferences?: string;
  isRider: boolean; isPayer: boolean; assignLesson?: boolean;
  lesson?: { startTime: string; durationMinutes: number; serviceId: string; trainerId: string; horseId: string; arenaId?: string }
}

export function leadConversionPayload(values: LeadFormValues) {
  const { assignLesson, lesson, ...client } = values
  if (assignLesson && !lesson) throw new Error('Заполните параметры занятия')
  return { ...client,
    lastName: values.lastName?.trim() || undefined, email: values.email?.trim() || undefined,
    preferences: values.preferences?.trim() || undefined,
    ...(assignLesson && lesson ? { lesson: { ...lesson, arenaId: lesson.arenaId || undefined, startTime: toInstant(lesson.startTime) } } : {}),
  }
}
