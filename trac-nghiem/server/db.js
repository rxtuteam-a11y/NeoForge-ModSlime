'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new DatabaseSync(path.join(DATA_DIR, 'tracnghiem.db'));

db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, school TEXT DEFAULT '',
  pass TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS folders (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT DEFAULT '', created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS students (
  id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  name TEXT NOT NULL, code TEXT DEFAULT '', dob TEXT DEFAULT '', phone TEXT DEFAULT '', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT UNIQUE NOT NULL, title TEXT NOT NULL, subject TEXT DEFAULT '', grade TEXT DEFAULT '', description TEXT DEFAULT '',
  folder_id TEXT, questions TEXT NOT NULL, parts TEXT DEFAULT '[]', settings TEXT NOT NULL, class_ids TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS submissions (
  id TEXT PRIMARY KEY, exam_id TEXT NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
  token TEXT UNIQUE NOT NULL, student_name TEXT NOT NULL, student_class TEXT DEFAULT '', student_code TEXT DEFAULT '',
  student_id TEXT, identity_key TEXT NOT NULL, answers TEXT DEFAULT '{}', layout TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'doing', score REAL, max_score REAL, correct INTEGER, total INTEGER, details TEXT,
  manual TEXT DEFAULT '{}', comment TEXT DEFAULT '', tab_switches INTEGER DEFAULT 0, events TEXT DEFAULT '[]',
  started_at INTEGER NOT NULL, deadline INTEGER, submitted_at INTEGER, ip TEXT DEFAULT '', user_agent TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_sub_exam ON submissions(exam_id);
CREATE INDEX IF NOT EXISTS idx_exam_owner ON exams(owner_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
`);

function all(sql, ...p) { return db.prepare(sql).all(...p); }
function get(sql, ...p) { return db.prepare(sql).get(...p); }
function run(sql, ...p) { return db.prepare(sql).run(...p); }
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

module.exports = { db, all, get, run, tx, DATA_DIR };
