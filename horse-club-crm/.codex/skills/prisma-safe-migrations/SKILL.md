---
name: prisma-safe-migrations
description: Безопасное проектирование схемы PostgreSQL, написание миграций Prisma и работа с SQL View в Horse Club CRM.
---
# Правила работы с Prisma и PostgreSQL
- Никогда не генерируй деструктивные DROP COLUMN / DROP TABLE без миграции существующих данных.
- При добавлении значений в PostgreSQL enum используй безопасный ALTER TYPE ... ADD VALUE IF NOT EXISTS.
- При изменении таблиц кассы или платежей проверяй сохранность SQL-представления _cashbox_balances.
- Все многошаговые изменения (списание абонемента + начисление 30% тренеру, смена пола при кастрации, раскладка сетки конюшни) оборачивай в prisma..
- После правки schema.prisma обязательно выполняй 
px prisma validate и 
px prisma generate.
