-- Manuální záznamy pro školní modul (Klasse 9, Sächsisches Gymnasium)
-- Nahrazuje Puppeteer scraping — data se zadávají ručně přes UI

CREATE TABLE IF NOT EXISTS school_deadlines_manual (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    uuid NULL,
  title      text NOT NULL,
  subject    text,
  due_date   date NOT NULL,
  type       text NOT NULL CHECK (type IN ('klassenarbeit', 'homework', 'presentation', 'other')),
  done       boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_deadlines_manual_due_idx
  ON school_deadlines_manual (user_id, due_date);

CREATE TABLE IF NOT EXISTS school_grades_manual (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        uuid NULL,
  subject        text NOT NULL,
  grade_type     text NOT NULL CHECK (grade_type IN ('klassenarbeit', 'sonstige')),
  grade          integer NOT NULL CHECK (grade >= 1 AND grade <= 6),
  note           text,
  sport_category text,
  graded_at      date NOT NULL DEFAULT CURRENT_DATE,
  created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS school_grades_manual_subject_idx
  ON school_grades_manual (user_id, subject, graded_at DESC);
