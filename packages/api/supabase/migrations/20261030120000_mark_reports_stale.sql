-- Reports are generated on demand and cached until has_new_data is set, but
-- nothing set it when a statement added, removed or recategorised
-- transactions, so cached reports went stale. Mark the user's report and their
-- household's report for every month a transaction change touches.

CREATE OR REPLACE FUNCTION public.mark_report_months_stale(p_user_ids UUID[], p_dates DATE[])
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH changed AS (
    SELECT DISTINCT c.user_id, date_trunc('month', c.txn_date)::date AS report_month
    FROM unnest(p_user_ids, p_dates) AS c(user_id, txn_date)
  ),
  targets AS (
    SELECT 'user'::public.entity_type AS entity_type, changed.user_id AS entity_id, changed.report_month
    FROM changed
    UNION
    SELECT 'household'::public.entity_type, p.household_id, changed.report_month
    FROM changed
    JOIN public.profiles p ON p.id = changed.user_id
    WHERE p.household_id IS NOT NULL
  )
  UPDATE public.reports r
  SET has_new_data = true
  FROM targets t
  WHERE r.entity_type = t.entity_type
    AND r.entity_id = t.entity_id
    AND r.report_month = t.report_month
    AND r.has_new_data = false;
$$;

REVOKE ALL ON FUNCTION public.mark_report_months_stale(UUID[], DATE[]) FROM PUBLIC, anon, authenticated;

-- Statement-level for inserts and deletes: a statement upload inserts hundreds of rows at once.
CREATE OR REPLACE FUNCTION public.mark_reports_stale_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.mark_report_months_stale(array_agg(n.user_id), array_agg(n.date)) FROM new_rows n;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_reports_stale_on_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.mark_report_months_stale(array_agg(o.user_id), array_agg(o.date)) FROM old_rows o;
  RETURN NULL;
END;
$$;

-- Row-level for updates, limited to the columns reports read, so bookkeeping
-- updates (matching to expenses, debts) don't force a regeneration.
CREATE OR REPLACE FUNCTION public.mark_reports_stale_on_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM public.mark_report_months_stale(ARRAY[OLD.user_id, NEW.user_id], ARRAY[OLD.date, NEW.date]);
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_reports_stale_on_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_reports_stale_on_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_reports_stale_on_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS transactions_mark_reports_stale_insert ON public.transactions;
CREATE TRIGGER transactions_mark_reports_stale_insert
  AFTER INSERT ON public.transactions
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.mark_reports_stale_on_insert();

DROP TRIGGER IF EXISTS transactions_mark_reports_stale_delete ON public.transactions;
CREATE TRIGGER transactions_mark_reports_stale_delete
  AFTER DELETE ON public.transactions
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.mark_reports_stale_on_delete();

DROP TRIGGER IF EXISTS transactions_mark_reports_stale_update ON public.transactions;
CREATE TRIGGER transactions_mark_reports_stale_update
  AFTER UPDATE OF amount, type, ai_category, date, user_id ON public.transactions
  FOR EACH ROW
  WHEN (
    OLD.amount IS DISTINCT FROM NEW.amount
    OR OLD.type IS DISTINCT FROM NEW.type
    OR OLD.ai_category IS DISTINCT FROM NEW.ai_category
    OR OLD.date IS DISTINCT FROM NEW.date
    OR OLD.user_id IS DISTINCT FROM NEW.user_id
  )
  EXECUTE FUNCTION public.mark_reports_stale_on_update();
