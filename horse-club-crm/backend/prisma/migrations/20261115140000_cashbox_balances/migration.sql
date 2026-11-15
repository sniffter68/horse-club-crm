-- Preserve the production hot-patched view. Bootstrap a fresh installation only.
DO $$ BEGIN
  IF to_regclass('public.v_cashbox_balances') IS NULL THEN
    EXECUTE $view$
      CREATE VIEW public.v_cashbox_balances AS
      WITH operations AS (
        SELECT CASE WHEN "boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END AS cashbox_type,
          amount FROM "Payment" WHERE status = 'PAID' AND "archivedAt" IS NULL
        UNION ALL
        SELECT CASE WHEN p."boardingContractId" IS NULL THEN 'MAIN' ELSE 'BOARDING' END,
          -e.amount FROM "Expense" e LEFT JOIN "Payment" p ON p.id = e."refundPaymentId"
          WHERE e."archivedAt" IS NULL AND e."cancelledAt" IS NULL
      )
      SELECT boxes.cashbox_type, boxes.cashbox_name,
        COALESCE(SUM(o.amount), 0)::numeric AS current_balance_rub,
        COUNT(o.amount)::bigint AS operations_count
      FROM (VALUES ('MAIN', 'Основная касса'), ('BOARDING', 'Касса постоя')) boxes(cashbox_type, cashbox_name)
      LEFT JOIN operations o ON o.cashbox_type = boxes.cashbox_type
      GROUP BY boxes.cashbox_type, boxes.cashbox_name
    $view$;
  END IF;
END $$;
