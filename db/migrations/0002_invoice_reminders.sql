CREATE TABLE IF NOT EXISTS invoice_reminder_actions (
  action_id uuid PRIMARY KEY,
  paypal_invoice_id text NOT NULL,
  delivery text NOT NULL CHECK (delivery IN ('paypal', 'email')),
  state text NOT NULL CHECK (state IN ('SENDING', 'SENT', 'FAILED')),
  subject text,
  message text,
  recipient_email text,
  provider_id text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_reminder_actions_invoice_id_idx
  ON invoice_reminder_actions (paypal_invoice_id);

CREATE INDEX IF NOT EXISTS invoice_reminder_actions_created_at_idx
  ON invoice_reminder_actions (created_at DESC);
