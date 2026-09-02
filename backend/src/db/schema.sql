PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  password_hash  TEXT NOT NULL,
  phone          TEXT NOT NULL DEFAULT '',
  address        TEXT NOT NULL DEFAULT '',
  role           TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('admin', 'student', 'author')),
  email_verified INTEGER NOT NULL DEFAULT 0,
  bio            TEXT NOT NULL DEFAULT '',
  active         INTEGER NOT NULL DEFAULT 1,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS email_tokens (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose    TEXT NOT NULL DEFAULT 'verify',
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_log (
  id            TEXT PRIMARY KEY,
  at            TEXT NOT NULL DEFAULT (datetime('now')),
  actor_user_id TEXT,
  actor_ip      TEXT NOT NULL DEFAULT '',
  action        TEXT NOT NULL,
  target        TEXT NOT NULL DEFAULT '',
  detail        TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS courses (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('gravado', 'online')),
  description TEXT NOT NULL DEFAULT '',
  duration    TEXT NOT NULL DEFAULT '',
  price_cents INTEGER NOT NULL DEFAULT 0,
  author_id   TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS lessons (
  id            TEXT PRIMARY KEY,
  course_id     TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  resource_type TEXT NOT NULL DEFAULT 'link',
  resource      TEXT NOT NULL DEFAULT '',
  resource_name TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS enrollments (
  id                      TEXT PRIMARY KEY,
  user_id                 TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id               TEXT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  status                  TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa', 'inativa')),
  status_reason           TEXT NOT NULL DEFAULT '',
  installments_count      INTEGER NOT NULL DEFAULT 0,
  installment_value_cents INTEGER NOT NULL DEFAULT 0,
  first_due_date          TEXT,
  created_at              TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, course_id)
);

CREATE TABLE IF NOT EXISTS payments (
  id            TEXT PRIMARY KEY,
  enrollment_id TEXT NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
  number        INTEGER NOT NULL,
  due_date      TEXT NOT NULL,
  amount_cents  INTEGER NOT NULL DEFAULT 0,
  paid_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ebooks (
  id           TEXT PRIMARY KEY,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  pages        INTEGER,
  cover_path   TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL CHECK (mode IN ('venda_no_site', 'link_externo')),
  status       TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado')),
  price_cents  INTEGER NOT NULL DEFAULT 0,
  file_path    TEXT NOT NULL DEFAULT '',
  file_name    TEXT NOT NULL DEFAULT '',
  sample_path  TEXT NOT NULL DEFAULT '',
  sample_name  TEXT NOT NULL DEFAULT '',
  external_url TEXT NOT NULL DEFAULT '',
  store_name   TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ebook_orders (
  id               TEXT PRIMARY KEY,
  ebook_id         TEXT NOT NULL REFERENCES ebooks(id) ON DELETE RESTRICT,
  buyer_name       TEXT NOT NULL,
  buyer_email      TEXT NOT NULL,
  buyer_phone      TEXT NOT NULL DEFAULT '',
  buyer_cpf        TEXT NOT NULL,
  buyer_birthdate  TEXT NOT NULL,
  payment_method   TEXT NOT NULL CHECK (payment_method IN ('pix', 'credito', 'debito')),
  amount_cents     INTEGER NOT NULL DEFAULT 0,
  status           TEXT NOT NULL DEFAULT 'aguardando_link'
                   CHECK (status IN ('aguardando_link', 'aguardando_pagamento', 'pago', 'entregue', 'cancelado')),
  status_reason    TEXT NOT NULL DEFAULT '',
  payment_link_url TEXT NOT NULL DEFAULT '',
  asaas_charge_id  TEXT NOT NULL DEFAULT '',
  paid_at          TEXT,
  delivered_at     TEXT,
  cancelled_at     TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ebook_download_grants (
  token          TEXT PRIMARY KEY,
  order_id       TEXT NOT NULL REFERENCES ebook_orders(id) ON DELETE CASCADE,
  expires_at     TEXT NOT NULL,
  max_downloads  INTEGER NOT NULL DEFAULT 5,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_lessons_course ON lessons(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_course ON enrollments(course_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_enrollment ON payments(enrollment_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_email_tokens_user ON email_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
CREATE INDEX IF NOT EXISTS idx_ebooks_status ON ebooks(status);
CREATE INDEX IF NOT EXISTS idx_orders_status ON ebook_orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_email ON ebook_orders(buyer_email);
CREATE INDEX IF NOT EXISTS idx_grants_order ON ebook_download_grants(order_id);
