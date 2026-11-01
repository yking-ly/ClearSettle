CREATE TABLE IF NOT EXISTS invoice_creation_requests (
  request_id uuid PRIMARY KEY,
  request_hash text NOT NULL,
  state text NOT NULL CHECK (state IN ('CREATING', 'COMPLETED', 'FAILED')),
  paypal_invoice_id text UNIQUE,
  paypal_status text,
  mode text CHECK (mode IN ('demo', 'paypal')),
  href text,
  draft jsonb NOT NULL,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS paypal_webhook_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  resource_type text,
  resource_id text,
  summary text,
  event_created_at timestamptz,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_resource_id_idx
  ON paypal_webhook_events (resource_id);

CREATE INDEX IF NOT EXISTS paypal_webhook_events_received_at_idx
  ON paypal_webhook_events (received_at DESC);
