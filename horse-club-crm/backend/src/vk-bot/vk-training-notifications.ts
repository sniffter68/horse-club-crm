import type { Prisma } from '@prisma/client';
import { queueVkNotification } from './vk-delivery.module';

interface VkPerson {
  vkUserId?: bigint | null;
  name?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
}

interface TrainingNotification {
  startTime: Date;
  endTime: Date;
  trainer?: VkPerson | null;
  trainingType: string;
  notes?: string | null;
  participants: { client?: VkPerson | null; horse?: { name: string } | null }[];
}

const personName = (person?: VkPerson | null) => person?.name?.trim() || person?.fullName?.trim()
  || [person?.firstName, person?.lastName].filter(Boolean).join(' ').trim() || 'не указан';
const horseName = (horse?: { name: string } | null) => horse?.name?.trim() || 'не назначена';

// Only persist here. The worker contacts VK after the business transaction commits.
export async function queueTrainingConfirmation(tx: Prisma.TransactionClient, key: string, training: TrainingNotification): Promise<void> {
  if (!training.trainer?.vkUserId && !training.participants.some(row => row.client?.vkUserId)) return;
  const zone = process.env.CLUB_TIME_ZONE || 'Europe/Moscow';
  const format = (date: Date) => new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'short', timeStyle: 'short', timeZone: zone,
  }).format(date);
  const when = `${format(training.startTime)} — ${format(training.endTime)} (${zone})`;
  if (training.trainer?.vkUserId) {
    const participants = training.participants.length ? training.participants.map(row =>
      `• Клиент: ${personName(row.client)} (${row.client?.phone?.trim() || 'телефон не указан'})\n• Лошадь: ${horseName(row.horse)}`
    ).join('\n') : '• Клиент: пока не записан\n• Лошадь: не назначена';
    await queueVkNotification(tx, `${key}:trainer:${training.trainer.vkUserId}`, training.trainer.vkUserId,
      `📅 Новое занятие в вашем расписании!\n• Дата и время: ${when}\n${participants}\n• Тип занятия: ${training.trainingType}\n• Примечание: ${training.notes?.trim() || 'не указано'}`);
  }
  const clients = new Map<bigint, string[]>();
  for (const row of training.participants) {
    if (!row.client?.vkUserId) continue;
    const horses = clients.get(row.client.vkUserId) || [];
    horses.push(horseName(row.horse));
    clients.set(row.client.vkUserId, horses);
  }
  for (const [peer, horses] of clients) {
    await queueVkNotification(tx, `${key}:client:${peer}`, peer,
      `✅ Ваша тренировка подтверждена!\n• Дата и время: ${when}\n• Тренер: ${personName(training.trainer)}\n• Лошадь: ${[...new Set(horses)].join(', ')}\n📍 Ждём вас в клубе за 15 минут до начала. Если ваши планы изменятся, пожалуйста, предупредите администратора!`);
  }
}
