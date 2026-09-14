INSERT INTO "Payment" (
  "id",
  "clientId",
  "boardingContractId",
  "amount",
  "method",
  "status",
  "description",
  "createdAt",
  "updatedAt"
)
SELECT
  (md5('boarding-charge:' || contract."id"::text))::uuid,
  contract."clientId",
  contract."id",
  contract."monthlyRate",
  'UNSPECIFIED'::"PaymentMethod",
  'PENDING'::"PaymentStatus",
  'Начисление за первый месяц постоя',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "BoardingContract" AS contract
WHERE contract."monthlyRate" > 0
  AND NOT EXISTS (
    SELECT 1
    FROM "Payment" AS payment
    WHERE payment."boardingContractId" = contract."id"
  );
