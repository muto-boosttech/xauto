import fs from "node:fs";
import Database from "better-sqlite3";
import { ANALYTICS_DB, DATA_DIR, POSTS_DB } from "./paths.js";

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function migratePosts(db) {
  const cols = db.prepare("PRAGMA table_info(posts)").all();
  const names = new Set(cols.map((c) => c.name));
  if (!names.has("batch_id")) db.exec("ALTER TABLE posts ADD COLUMN batch_id TEXT");
}

export function openPostsDb() {
  ensureDataDir();
  const db = new Database(POSTS_DB);
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      local_id INTEGER PRIMARY KEY AUTOINCREMENT,
      id TEXT UNIQUE,
      content TEXT NOT NULL,
      category TEXT,
      hook_type TEXT,
      char_count INTEGER,
      status TEXT NOT NULL DEFAULT 'draft',
      scheduled_at TEXT,
      posted_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status);
    CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
  `);
  migratePosts(db);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_posts_batch ON posts(batch_id);`);
  return db;
}

export function openAnalyticsDb() {
  ensureDataDir();
  const db = new Database(ANALYTICS_DB);
  db.exec(`
    CREATE TABLE IF NOT EXISTS analytics (
      row_id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      impressions INTEGER,
      likes INTEGER,
      retweets INTEGER,
      replies INTEGER,
      bookmarks INTEGER,
      profile_clicks INTEGER,
      engagement_total INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_analytics_post ON analytics(post_id);
    CREATE TABLE IF NOT EXISTS analytics_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id TEXT NOT NULL,
      run_at TEXT NOT NULL,
      done INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_aq_run ON analytics_queue(done, run_at);
  `);
  return db;
}
