import type { ServiceDirection } from '@prisma/client';

export function resolveServiceDirection(service: {
  serviceDirection?: ServiceDirection | null; title?: string; name?: string; maxCapacity: number;
}): ServiceDirection {
  if (service.serviceDirection) return service.serviceDirection;
  const name = `${service.title ?? ''} ${service.name ?? ''}`;
  if (/иппо|фото|мероприят|экскурс|hippo|photo|event|excursion/i.test(name)) return 'allowSpecial';
  if (/прогул|выезд(?!к)|поход|walk|trail/i.test(name)) return 'allowWalk';
  if (/групп|смен|group/i.test(name) || service.maxCapacity > 1) return 'allowGroup';
  if (/индивиду|персонал|трениров|занят|урок|выездк|конкур|корд|individual|lesson|training/i.test(name)) return 'allowIndividual';
  return 'allowSpecial';
}
