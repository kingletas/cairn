/** Migrations, in order. A migration is never edited once released -- a new one is added. */

export interface Migration {
  id: number;
  name: string;
  up: string;
}

export const MIGRATIONS: readonly Migration[] = [
  {
    id: 1,
    name: 'initial',
    up: `
      CREATE TABLE profile (
        id            INTEGER PRIMARY KEY CHECK (id = 1),
        display_name  TEXT NOT NULL DEFAULT '',
        locations     TEXT NOT NULL DEFAULT '[]',
        remote_only   INTEGER NOT NULL DEFAULT 0,
        currency      TEXT NOT NULL DEFAULT 'USD',
        pay_floor     INTEGER,
        pay_target    INTEGER,
        skills        TEXT NOT NULL DEFAULT '[]',
        families      TEXT NOT NULL DEFAULT '[]',
        work_auth     TEXT,
        needs_sponsor INTEGER
      );

      CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE company (
        id      TEXT PRIMARY KEY,
        name    TEXT NOT NULL UNIQUE,
        website TEXT,
        notes   TEXT
      );

      CREATE TABLE opportunity (
        id               TEXT PRIMARY KEY,
        company          TEXT NOT NULL,
        role             TEXT NOT NULL,
        url              TEXT,
        location         TEXT,
        remote           TEXT NOT NULL DEFAULT 'unstated',
        pay              TEXT,
        stage            TEXT NOT NULL DEFAULT 'considering',
        fit              TEXT,
        family           TEXT,
        next_action      TEXT,
        next_action_due  TEXT,
        posted_at        TEXT,
        captured_at      TEXT NOT NULL,
        archived_at      TEXT,
        notes            TEXT,
        source_id        TEXT,
        screening        TEXT
      );
      CREATE INDEX opportunity_stage ON opportunity (stage) WHERE archived_at IS NULL;
      CREATE UNIQUE INDEX opportunity_url ON opportunity (url) WHERE url IS NOT NULL;

      -- A requisition is a lead that has not been judged. Keeping it separate from
      -- opportunity is what stops an unscreened row appearing in the pipeline.
      CREATE TABLE requisition (
        id          TEXT PRIMARY KEY,
        company     TEXT NOT NULL,
        role        TEXT NOT NULL,
        url         TEXT,
        raw         TEXT NOT NULL,
        source_id   TEXT NOT NULL,
        captured_at TEXT NOT NULL,
        screening   TEXT NOT NULL,
        state       TEXT NOT NULL DEFAULT 'waiting'
      );
      CREATE INDEX requisition_state ON requisition (state);

      -- Only the hash of a dropped link, never the link. Enough to stop the same
      -- posting coming back, and useless to anybody who reads it.
      CREATE TABLE dropped (
        url_hash   TEXT PRIMARY KEY,
        dropped_at TEXT NOT NULL
      );

      CREATE TABLE source (
        id       TEXT PRIMARY KEY,
        enabled  INTEGER NOT NULL DEFAULT 0,
        config   TEXT NOT NULL DEFAULT '{}',
        last_run TEXT,
        last_error TEXT
      );

      CREATE TABLE board (
        source_id TEXT NOT NULL,
        token     TEXT NOT NULL,
        company   TEXT NOT NULL,
        added_at  TEXT NOT NULL,
        PRIMARY KEY (source_id, token)
      );

      CREATE TABLE document (
        id            TEXT PRIMARY KEY,
        kind          TEXT NOT NULL,
        title         TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        used_count    INTEGER NOT NULL DEFAULT 0,
        updated_at    TEXT NOT NULL
      );

      CREATE TABLE answer (
        id         TEXT PRIMARY KEY,
        question   TEXT NOT NULL,
        answer     TEXT NOT NULL,
        used_count INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE outbound (
        id     TEXT PRIMARY KEY,
        at     TEXT NOT NULL,
        host   TEXT NOT NULL,
        reason TEXT NOT NULL,
        ok     INTEGER NOT NULL,
        bytes  INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX outbound_at ON outbound (at);

      CREATE TABLE event (
        id             TEXT PRIMARY KEY,
        opportunity_id TEXT,
        at             TEXT NOT NULL,
        kind           TEXT NOT NULL,
        detail         TEXT
      );
      CREATE INDEX event_at ON event (at);
    `,
  },
  {
    id: 2,
    name: 'requisition-pay',
    // The band is the most decisive fact about a posting, so it belongs on the row
    // rather than inside a verdict somebody has to expand a section to reach.
    up: 'ALTER TABLE requisition ADD COLUMN pay TEXT;',
  },
  {
    id: 3,
    name: 'answer-intent',
    // An answer says which recognised question it answers, so a form asking the same
    // thing in different words still finds it.
    up: `
      ALTER TABLE answer ADD COLUMN intent TEXT;
      ALTER TABLE answer ADD COLUMN kind TEXT NOT NULL DEFAULT 'short';
      CREATE UNIQUE INDEX answer_intent ON answer (intent) WHERE intent IS NOT NULL;
    `,
  },
  {
    id: 4,
    name: 'applications',
    // An application is an opportunity that has been sent, so the date lives on the
    // row rather than in a second table that can disagree with it.
    up: `
      ALTER TABLE opportunity ADD COLUMN applied_at TEXT;
      CREATE INDEX event_opportunity ON event (opportunity_id, at);
    `,
  },
  {
    id: 5,
    name: 'interviews',
    up: `
      CREATE TABLE interview (
        id             TEXT PRIMARY KEY,
        opportunity_id TEXT NOT NULL,
        at             TEXT NOT NULL,
        minutes        INTEGER NOT NULL DEFAULT 45,
        round          TEXT NOT NULL DEFAULT '',
        people         TEXT NOT NULL DEFAULT '',
        join_url       TEXT,
        notes          TEXT NOT NULL DEFAULT '',
        questions      TEXT NOT NULL DEFAULT '',
        prepared       TEXT NOT NULL DEFAULT '[]',
        outcome        TEXT NOT NULL DEFAULT 'scheduled'
      );
      CREATE INDEX interview_at ON interview (at);
    `,
  },
  {
    id: 6,
    name: 'documents-and-resumes',
    up: `
      ALTER TABLE document ADD COLUMN format TEXT NOT NULL DEFAULT 'other';
      ALTER TABLE document ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE document ADD COLUMN note TEXT NOT NULL DEFAULT '';
      ALTER TABLE opportunity ADD COLUMN resume_id TEXT;
    `,
  },
  {
    id: 7,
    name: 'drop-what-nothing-reads',
    // Empty schema nobody reads is not free: it tells the next person companies are
    // stored somewhere and that a source carries configuration, and both are false.
    up: `
      DROP TABLE IF EXISTS company;
      ALTER TABLE source DROP COLUMN config;
    `,
  },
  {
    id: 8,
    name: 'document-versions',
    // Replacing a resume used to leave the application that went with the old one
    // pointing at a file whose contents had changed underneath it -- and which one
    // they got is the first thing an interviewer asks about.
    up: `
      CREATE TABLE document_version (
        id            TEXT PRIMARY KEY,
        document_id   TEXT NOT NULL,
        relative_path TEXT NOT NULL,
        format        TEXT NOT NULL,
        bytes         INTEGER NOT NULL,
        replaced_at   TEXT NOT NULL
      );
      CREATE INDEX document_version_document ON document_version (document_id);
      ALTER TABLE opportunity ADD COLUMN resume_file TEXT;
    `,
  },
  {
    id: 9,
    name: 'documents-held',
    // A linked file is not in the vault: not encrypted, not in an export, and gone the
    // moment somebody moves it. Which one a document is has to be recorded rather than
    // guessed from its path.
    up: `
      ALTER TABLE document ADD COLUMN held TEXT NOT NULL DEFAULT 'copied';
    `,
  },
  {
    id: 10,
    name: 'assistant',
    // A provider and its runs are two record types, not settings: a key has to be
    // sealed rather than stored, and a run is a row per request rather than a value.
    up: `
      CREATE TABLE assistant_provider (
        id         TEXT PRIMARY KEY,
        kind       TEXT NOT NULL,
        base       TEXT NOT NULL,
        model      TEXT NOT NULL DEFAULT '',
        key_sealed TEXT NOT NULL DEFAULT '',
        effort     TEXT NOT NULL DEFAULT 'high',
        quiet      TEXT NOT NULL DEFAULT '[]',
        added_at   TEXT NOT NULL
      );
      CREATE TABLE assistant_run (
        id            TEXT PRIMARY KEY,
        at            TEXT NOT NULL,
        task          TEXT NOT NULL,
        provider_id   TEXT NOT NULL,
        model         TEXT NOT NULL,
        host          TEXT NOT NULL,
        bytes_out     INTEGER NOT NULL,
        bytes_in      INTEGER NOT NULL,
        tokens_in     INTEGER NOT NULL,
        tokens_out    INTEGER NOT NULL,
        cost_estimate REAL,
        outcome       TEXT NOT NULL,
        about         TEXT
      );
      CREATE INDEX assistant_run_at ON assistant_run (at);
    `,
  },
  {
    id: 11,
    name: 'the-gate',
    // What a person decided before applying, which had nowhere to live.
    // screening and source_id go with it: nothing has ever written or read either.
    up: `
      ALTER TABLE opportunity ADD COLUMN gate TEXT;
      ALTER TABLE opportunity ADD COLUMN blocker TEXT;
      ALTER TABLE opportunity ADD COLUMN concession TEXT;
      ALTER TABLE opportunity ADD COLUMN contact TEXT;
      ALTER TABLE opportunity ADD COLUMN followup_channel TEXT;
      ALTER TABLE opportunity DROP COLUMN screening;
      ALTER TABLE opportunity DROP COLUMN source_id;
    `,
  },
  {
    id: 12,
    name: 'the-posting',
    // What the role actually says. A row carrying a company, a title and a band tells
    // you nothing about the job.
    up: 'ALTER TABLE opportunity ADD COLUMN posting TEXT;',
  },
  {
    id: 13,
    name: 'the-reading',
    // What the screens read, kept with the role: the posting is the evidence and the
    // reading of it is the work, and taking a lead threw the second one away.
    up: `
      ALTER TABLE opportunity ADD COLUMN screening TEXT;
      ALTER TABLE requisition ADD COLUMN remote TEXT NOT NULL DEFAULT 'unstated';
    `,
  },
];
