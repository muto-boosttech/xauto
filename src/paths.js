import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const ROOT = path.resolve(__dirname, "..");
export const CONFIG_DIR = path.join(ROOT, "config");

const dataFromEnv = process.env.DATA_DIR?.trim();
export const DATA_DIR = dataFromEnv ? path.resolve(dataFromEnv) : path.join(ROOT, "data");

const reportsFromEnv = process.env.REPORTS_DIR?.trim();
export const REPORTS_DIR = reportsFromEnv
  ? path.resolve(reportsFromEnv)
  : dataFromEnv
    ? path.join(DATA_DIR, "reports")
    : path.join(ROOT, "reports");
export const POSTS_DB = path.join(DATA_DIR, "posts.db");
export const ANALYTICS_DB = path.join(DATA_DIR, "analytics.db");
