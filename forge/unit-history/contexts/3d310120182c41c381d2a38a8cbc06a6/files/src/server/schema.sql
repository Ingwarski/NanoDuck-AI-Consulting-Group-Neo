CREATE TABLE IF NOT EXISTS nanoduck_sessions (
  id VARCHAR(128) PRIMARY KEY,
  owner_subject VARCHAR(255) NOT NULL,
  csrf_token VARCHAR(128) NOT NULL,
  consented_at VARCHAR(40) NULL,
  issued_at VARCHAR(40) NOT NULL,
  expires_at VARCHAR(40) NOT NULL,
  revoked_at VARCHAR(40) NULL,
  INDEX nanoduck_sessions_expiry (expires_at)
);

CREATE TABLE IF NOT EXISTS nanoduck_settings (
  owner_id VARCHAR(32) PRIMARY KEY,
  settings_json JSON NOT NULL
);

CREATE TABLE IF NOT EXISTS nanoduck_runtime_instructions (
  owner_id VARCHAR(32) PRIMARY KEY,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  revision VARCHAR(128) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS nanoduck_runtime_instruction_history (
  id VARCHAR(128) PRIMARY KEY,
  owner_id VARCHAR(32) NOT NULL,
  action VARCHAR(32) NOT NULL,
  restored_from_id VARCHAR(128) NULL,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  content_hash CHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX nanoduck_runtime_instruction_history_owner (owner_id, created_at)
);

CREATE TABLE IF NOT EXISTS nanoduck_owner_locks (
  owner_id VARCHAR(32) PRIMARY KEY
);

INSERT IGNORE INTO nanoduck_owner_locks (owner_id) VALUES ('owner');

CREATE TABLE IF NOT EXISTS nanoduck_conversations (
  id VARCHAR(128) PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  deleted_at VARCHAR(40) NULL,
  INDEX nanoduck_conversations_updated (updated_at)
);

CREATE TABLE IF NOT EXISTS nanoduck_runs (
  id VARCHAR(128) PRIMARY KEY,
  conversation_id VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL,
  generation INT NOT NULL,
  snapshot_json JSON NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  updated_at VARCHAR(40) NOT NULL,
  INDEX nanoduck_runs_conversation (conversation_id, created_at)
);

CREATE TABLE IF NOT EXISTS nanoduck_messages (
  id VARCHAR(128) PRIMARY KEY,
  conversation_id VARCHAR(128) NOT NULL,
  role VARCHAR(64) NOT NULL,
  recipient VARCHAR(64) NULL,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  sequence INT NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  sources_json JSON NOT NULL,
  UNIQUE KEY nanoduck_messages_sequence (conversation_id, sequence)
);

CREATE TABLE IF NOT EXISTS nanoduck_usage (
  id VARCHAR(128) PRIMARY KEY,
  conversation_id VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  model VARCHAR(128) NOT NULL,
  status VARCHAR(20) NOT NULL,
  started_at VARCHAR(40) NOT NULL,
  finished_at VARCHAR(40) NULL,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  INDEX nanoduck_usage_conversation (conversation_id, started_at),
  CONSTRAINT nanoduck_usage_conversation_fk FOREIGN KEY (conversation_id) REFERENCES nanoduck_conversations (id)
);

CREATE TABLE IF NOT EXISTS nanoduck_attachments (
  id VARCHAR(128) PRIMARY KEY,
  conversation_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NULL,
  content_type VARCHAR(32) NOT NULL,
  byte_length INT UNSIGNED NOT NULL,
  ciphertext MEDIUMBLOB NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  created_at VARCHAR(40) NOT NULL,
  INDEX nanoduck_attachments_conversation (conversation_id, created_at),
  INDEX nanoduck_attachments_message (message_id),
  CONSTRAINT nanoduck_attachments_conversation_fk FOREIGN KEY (conversation_id) REFERENCES nanoduck_conversations (id),
  CONSTRAINT nanoduck_attachments_message_fk FOREIGN KEY (message_id) REFERENCES nanoduck_messages (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nanoduck_requests (
  conversation_id VARCHAR(128) NOT NULL,
  request_id VARCHAR(128) NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  run_id VARCHAR(128) NOT NULL,
  PRIMARY KEY (conversation_id, request_id)
);

CREATE TABLE IF NOT EXISTS nanoduck_instruction_documents (
  document_id VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  revision INT UNSIGNED NOT NULL,
  ciphertext MEDIUMTEXT NOT NULL,
  iv VARCHAR(64) NOT NULL,
  tag VARCHAR(64) NOT NULL,
  PRIMARY KEY (document_id, revision)
);
