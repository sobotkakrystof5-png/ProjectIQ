-- S14: vystavení a zaplacení atomicky, číselná řada za účet.
-- Funkce jsou SECURITY INVOKER: stejná RLS i aplikační filtr jako zbytek ws.
ALTER TABLE ws.accounts ADD COLUMN IF NOT EXISTS invoice_sequences jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ws.invoices ADD COLUMN IF NOT EXISTS issuer jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE ws.invoices ADD COLUMN IF NOT EXISTS supplied_on date;
ALTER TABLE ws.invoices ADD COLUMN IF NOT EXISTS pdf_data bytea;
ALTER TABLE ws.invoices ADD COLUMN IF NOT EXISTS pdf_filename text;
ALTER TABLE ws.tax_settings ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS transactions_invoice_uq ON ws.transactions(account_id, invoice_id) WHERE invoice_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS outbound_invoice_pending_uq
 ON ws.outbound_messages(account_id,business_id,(payload->>'invoiceId'))
 WHERE type='invoice' AND payload->>'invoiceId' IS NOT NULL AND status IN ('draft','queued','sending');

CREATE OR REPLACE FUNCTION ws.money_issue(p_business uuid, p_data jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE
 a uuid := ws.current_account(); y text := left(p_data->>'issuedOn', 4);
 n integer; seq jsonb; result uuid; j uuid := NULLIF(p_data->>'jobId','')::uuid;
 c uuid := NULLIF(p_data->>'customerId','')::uuid;
BEGIN
 IF a IS NULL OR NOT EXISTS (SELECT 1 FROM ws.businesses WHERE account_id=a AND id=p_business AND archived_at IS NULL)
 THEN RAISE EXCEPTION 'money_not_found' USING ERRCODE='P0002'; END IF;
 -- Zámek účtu drží řadu i souběžné vystavení ze zakázky až do COMMITu.
 SELECT invoice_sequences INTO seq FROM ws.accounts WHERE id=a FOR UPDATE;
 IF c IS NOT NULL AND NOT EXISTS(SELECT 1 FROM ws.customers WHERE account_id=a AND id=c)
 THEN RAISE EXCEPTION 'money_not_found' USING ERRCODE='P0002'; END IF;
 IF j IS NOT NULL THEN
   SELECT customer_id INTO c FROM ws.jobs WHERE account_id=a AND business_id=p_business AND id=j
     AND stage_id IN (SELECT id FROM ws.stages WHERE account_id=a AND business_id=p_business AND type IN ('done','paid'));
   IF NOT FOUND THEN RAISE EXCEPTION 'money_job_not_done' USING ERRCODE='P0002'; END IF;
   IF EXISTS(SELECT 1 FROM ws.invoices WHERE account_id=a AND business_id=p_business AND job_id=j AND direction='issued' AND status<>'cancelled')
   THEN RAISE EXCEPTION 'money_job_invoiced' USING ERRCODE='23505'; END IF;
 END IF;
 SELECT GREATEST(COALESCE((seq->>y)::integer,0), COALESCE(MAX(right(number,6)::integer),0))+1 INTO n
 FROM ws.invoices WHERE account_id=a AND direction='issued' AND number ~ ('^'||y||'-[0-9]{6}$');
 IF n > 999999 THEN RAISE EXCEPTION 'money_sequence_full'; END IF;
 UPDATE ws.accounts SET invoice_sequences=jsonb_set(seq,ARRAY[y],to_jsonb(n)) WHERE id=a;
 INSERT INTO ws.invoices(account_id,business_id,direction,customer_id,job_id,number,counterparty,issuer,issued_on,supplied_on,due_on,amount,currency,items,status,note)
 VALUES(a,p_business,'issued',c,j,y||'-'||lpad(n::text,6,'0'),p_data->'counterparty',p_data->'issuer',
   (p_data->>'issuedOn')::date,(p_data->>'suppliedOn')::date,(p_data->>'dueOn')::date,(p_data->>'amount')::numeric,
   p_data->>'currency',p_data->'items','issued',p_data->>'note') RETURNING id INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION ws.money_pay(p_business uuid, p_invoice uuid, p_day date, p_method text)
RETURNS uuid LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog, pg_temp AS $$
DECLARE a uuid:=ws.current_account(); i ws.invoices; t uuid;
BEGIN
 SELECT * INTO i FROM ws.invoices WHERE account_id=a AND business_id=p_business AND id=p_invoice FOR UPDATE;
 IF NOT FOUND OR i.status NOT IN ('issued','paid') THEN RAISE EXCEPTION 'money_not_found' USING ERRCODE='P0002'; END IF;
 SELECT id INTO t FROM ws.transactions WHERE account_id=a AND business_id=p_business AND invoice_id=i.id;
 IF i.paid_on IS NOT NULL THEN RETURN t; END IF;
 -- Návštěva/zakázka mohla být zaplacená už před vystavením faktury.
 -- Převzít lze jen přesně stejnou platbu; nehádat, že částky jsou totéž.
 IF i.direction='issued' AND i.job_id IS NOT NULL THEN
   PERFORM 1 FROM ws.jobs WHERE account_id=a AND business_id=p_business AND id=i.job_id FOR UPDATE;
   IF EXISTS(SELECT 1 FROM ws.transactions WHERE account_id=a AND business_id=p_business AND job_id=i.job_id AND kind='income') THEN
     SELECT id INTO t FROM ws.transactions WHERE account_id=a AND business_id=p_business AND job_id=i.job_id
       AND kind='income' AND amount=i.amount AND currency=i.currency AND invoice_id IS NULL ORDER BY created_at LIMIT 1 FOR UPDATE;
     IF t IS NULL THEN RAISE EXCEPTION 'money_payment_mismatch' USING ERRCODE='P0001'; END IF;
     UPDATE ws.transactions SET invoice_id=i.id WHERE account_id=a AND business_id=p_business AND id=t;
   END IF;
 END IF;
 IF t IS NULL AND i.amount>0 THEN
   INSERT INTO ws.transactions(account_id,business_id,kind,amount,currency,occurred_on,category,description,payment_method,invoice_id,customer_id,job_id)
   VALUES(a,p_business,CASE WHEN i.direction='issued' THEN 'income' ELSE 'expense' END,i.amount,i.currency,p_day,
     CASE WHEN i.direction='issued' THEN 'Faktury' ELSE 'Přijaté faktury' END,'Faktura '||i.number,p_method,i.id,i.customer_id,i.job_id) RETURNING id INTO t;
 END IF;
 UPDATE ws.invoices SET paid_on=COALESCE((SELECT occurred_on FROM ws.transactions WHERE account_id=a AND business_id=p_business AND id=t),p_day),status='paid' WHERE account_id=a AND business_id=p_business AND id=i.id;
 RETURN t;
END $$;
REVOKE ALL ON FUNCTION ws.money_issue(uuid,jsonb), ws.money_pay(uuid,uuid,date,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws.money_issue(uuid,jsonb), ws.money_pay(uuid,uuid,date,text) TO ws_app;

-- Zaplacená faktura a následné „Zaplatit návštěvu“ nesmí vytvořit druhý příjem.
CREATE OR REPLACE FUNCTION ws.money_adopt_visit()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog,pg_temp AS $$
DECLARE i ws.invoices; t uuid; a uuid:=ws.current_account();
BEGIN
 IF NEW.kind<>'income' OR NEW.appointment_id IS NULL OR NEW.job_id IS NULL THEN RETURN NEW; END IF;
 IF a IS NULL OR NEW.account_id<>a THEN RAISE EXCEPTION 'money_not_found' USING ERRCODE='P0002'; END IF;
 PERFORM 1 FROM ws.jobs WHERE account_id=a AND business_id=NEW.business_id AND id=NEW.job_id FOR UPDATE;
 SELECT * INTO i FROM ws.invoices WHERE account_id=a AND business_id=NEW.business_id AND job_id=NEW.job_id AND direction='issued' AND status='paid' LIMIT 1;
 IF NOT FOUND THEN RETURN NEW; END IF;
 SELECT id INTO t FROM ws.transactions WHERE account_id=a AND business_id=NEW.business_id AND invoice_id=i.id AND amount=NEW.amount AND currency=NEW.currency AND appointment_id IS NULL FOR UPDATE;
 IF t IS NULL THEN RAISE EXCEPTION 'money_payment_mismatch' USING ERRCODE='P0001'; END IF;
 UPDATE ws.transactions SET appointment_id=NEW.appointment_id WHERE account_id=a AND business_id=NEW.business_id AND id=t;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS money_adopt_visit ON ws.transactions;
CREATE TRIGGER money_adopt_visit BEFORE INSERT ON ws.transactions FOR EACH ROW EXECUTE FUNCTION ws.money_adopt_visit();
REVOKE ALL ON FUNCTION ws.money_adopt_visit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ws.money_adopt_visit() TO ws_app;
