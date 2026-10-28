-- Keep ordinary updates/deletes forbidden. The reset must first insert its audit
-- in this very transaction; a session setting or historical audit alone cannot
-- authorize deletion. No triggers or FK constraints are disabled.
CREATE OR REPLACE FUNCTION immutable_financial_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' AND TG_TABLE_NAME IN ('MonthlyFinancialClosing', 'RevenueRecognition')
    AND EXISTS (
      SELECT 1 FROM "CashAuditLog" a JOIN "User" u ON u.id = a."actorId"
      WHERE a."requestId"::text = current_setting('horsecrm.operational_reset_id', true)
        AND a.action = 'RESET_ALL_OPERATIONAL_DATA' AND u.role = 'ADMIN'
        AND a.xmin::text = pg_current_xact_id()::text
        AND a.details ? 'snapshot'
    ) THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Финансовые проводки и закрытия неизменяемы' USING ERRCODE = '23514';
END $$;
