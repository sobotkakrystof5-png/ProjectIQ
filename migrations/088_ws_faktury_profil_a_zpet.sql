-- RD10: profil dodavatele na uctu a bezpecne vraceni zaplaceni faktury.
ALTER TABLE ws.accounts
  ADD COLUMN IF NOT EXISTS invoice_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE ws.invoices
  ADD COLUMN IF NOT EXISTS payment_origin text
  CHECK (payment_origin IN ('created', 'adopted'));

CREATE OR REPLACE FUNCTION ws.money_pay(p_business uuid, p_invoice uuid, p_day date, p_method text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE a uuid:=ws.current_account(); i ws.invoices; t uuid; origin text;
BEGIN
 SELECT * INTO i FROM ws.invoices WHERE account_id=a AND business_id=p_business AND id=p_invoice FOR UPDATE;
 IF NOT FOUND OR i.status NOT IN ('issued','paid') THEN RAISE EXCEPTION 'money_not_found' USING ERRCODE='P0002'; END IF;
 SELECT id INTO t FROM ws.transactions WHERE account_id=a AND business_id=p_business AND invoice_id=i.id;
 IF i.paid_on IS NOT NULL THEN RETURN t; END IF;
 -- Zakazka mohla být zaplacená už před vystavením faktury. Převzít lze jen
 -- přesně stejnou částku a měnu; původ platby uložíme pro bezpečné Zpět.
 IF i.direction='issued' AND i.job_id IS NOT NULL THEN
   PERFORM 1 FROM ws.jobs WHERE account_id=a AND business_id=p_business AND id=i.job_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM ws.transactions WHERE account_id=a AND business_id=p_business AND job_id=i.job_id AND kind='income') THEN
     SELECT id INTO t FROM ws.transactions WHERE account_id=a AND business_id=p_business AND job_id=i.job_id
       AND kind='income' AND amount=i.amount AND currency=i.currency AND invoice_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
     IF t IS NULL THEN RAISE EXCEPTION 'money_payment_mismatch' USING ERRCODE='P0001'; END IF;
     UPDATE ws.transactions SET invoice_id=i.id WHERE account_id=a AND business_id=p_business AND id=t;
     origin:='adopted';
   END IF;
 END IF;
 IF t IS NULL AND i.amount>0 THEN
   INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,category,description,payment_method,invoice_id,customer_id,job_id)
   VALUES(a,p_business,CASE WHEN i.direction='issued' THEN 'income' ELSE 'expense' END,i.amount,i.currency,p_day,
     CASE WHEN i.direction='issued' THEN 'Faktury' ELSE 'Přijaté faktury' END,'Faktura '||i.number,p_method,i.id,i.customer_id,i.job_id) RETURNING id INTO t;
   origin:='created';
 ELSIF t IS NULL THEN
   -- Nulová faktura se může označit jako zaplacená, ale nevytváří příjem.
   origin:='created';
 END IF;
 UPDATE ws.invoices SET paid_on=COALESCE((SELECT occurred_on FROM ws.transactions WHERE account_id=a AND business_id=p_business AND id=t),p_day),
   status='paid',payment_origin=origin WHERE account_id=a AND business_id=p_business AND id=i.id;
 RETURN t;
END $$;

CREATE OR REPLACE FUNCTION ws.money_unpay(p_business uuid, p_invoice uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE a uuid:=ws.current_account(); i ws.invoices; t ws.transactions;
BEGIN
 SELECT * INTO i FROM ws.invoices WHERE account_id=a AND business_id=p_business AND id=p_invoice FOR UPDATE;
 IF NOT FOUND OR i.status<>'paid' OR i.payment_origin IS NULL
   OR i.updated_at < now() - interval '60 seconds'
 THEN RAISE EXCEPTION 'money_payment_undo_expired' USING ERRCODE='P0002'; END IF;
 SELECT * INTO t FROM ws.transactions WHERE account_id=a AND business_id=p_business AND invoice_id=i.id FOR UPDATE;
 IF NOT FOUND THEN
   IF i.payment_origin='created' AND i.amount=0 THEN
     UPDATE ws.invoices SET paid_on=NULL,status='issued',payment_origin=NULL
     WHERE account_id=a AND business_id=p_business AND id=i.id;
     RETURN;
   END IF;
   RAISE EXCEPTION 'money_payment_missing' USING ERRCODE='P0002';
 END IF;
 -- Převzatá platba patří zakázce. Platba vystavená z faktury se zachová,
 -- pokud ji mezitím navázal kalendář; jinak se při vrácení odstraní.
 IF i.payment_origin='adopted' OR t.appointment_id IS NOT NULL THEN
   UPDATE ws.transactions SET invoice_id=NULL WHERE account_id=a AND business_id=p_business AND id=t.id;
 ELSE
   DELETE FROM ws.transactions WHERE account_id=a AND business_id=p_business AND id=t.id;
 END IF;
 UPDATE ws.invoices SET paid_on=NULL,status='issued',payment_origin=NULL
 WHERE account_id=a AND business_id=p_business AND id=i.id;
END $$;

REVOKE ALL ON FUNCTION ws.money_pay(uuid,uuid,date,text), ws.money_unpay(uuid,uuid) FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ws_app') THEN
    GRANT EXECUTE ON FUNCTION ws.money_pay(uuid,uuid,date,text), ws.money_unpay(uuid,uuid) TO ws_app;
  END IF;
END
$$;
