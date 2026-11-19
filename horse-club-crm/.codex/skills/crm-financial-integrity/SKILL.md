---
name: crm-financial-integrity
description: Trainer commissions, nominal service prices and financial integrity.
---
# Финансовые правила Horse Club CRM
- Выплата тренеру: индивидуальная ставка trainer.commissionPercent (по умолчанию 30%, диапазон 0–100%) от номинальной цены услуги Service.price, без учёта скидок клиента.
- Движения средств строго разделяются по кассам: основная касса клуба и касса постоя.
- Оплата абонемента фиксируется как поступление в кассу в день оплаты, а выручка признаётся в дату проведения занятия.
- Закрытые периоды/смены блокируются от заднего редактирования сумм без фиксации в аудит-логе.
- Форматирование чисел: деньги — руб., занятия/услуги — шт., уникальные позиции — поз., смешанные складские количества — ед..

- Persist the applied commission in payroll snapshots; preserve approved/paid statements and closed periods when the trainer rate changes.
