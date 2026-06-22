-- Migration: School timetable (scraped from LernSax / Beste Schule)
-- Unikátní slot per user × weekday × lesson_num × source — upsertovatelné

CREATE TABLE IF NOT EXISTS school_timetable (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      uuid NULL,
  day_of_week  integer NOT NULL CHECK (day_of_week BETWEEN 1 AND 5), -- 1=Po, 5=Pá
  lesson_num   integer NOT NULL CHECK (lesson_num >= 1),
  subject      text NOT NULL,
  teacher      text,
  room         text,
  time_start   time,
  time_end     time,
  source       text NOT NULL CHECK (source IN ('lernsax', 'besteschule')),
  updated_at   timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS school_timetable_user_slot_idx
  ON school_timetable (user_id, day_of_week, lesson_num, source);

CREATE INDEX IF NOT EXISTS school_timetable_user_day_idx
  ON school_timetable (user_id, day_of_week);
