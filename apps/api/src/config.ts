import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadEnvFile } from "node:process";

export interface ApiConfig {
  port: number;
  corsOrigins: Set<string>;
  maxBatchSize: number;
}

let loadedEnvFile = false;

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  if (env === process.env) {
    loadNearestEnvFile();
  }

  return {
    port: readInt(env.PORT, 8787),
    corsOrigins: new Set(splitCsv(env.CORS_ORIGINS || "https://www.nowehoryzonty.pl")),
    maxBatchSize: readInt(env.MAX_BATCH_SIZE, 120)
  };
}

function loadNearestEnvFile(startDir = process.cwd()): void {
  if (loadedEnvFile) return;
  loadedEnvFile = true;

  const envPath = findUp(".env", startDir);
  if (envPath) loadEnvFile(envPath);
}

function findUp(fileName: string, startDir: string): string | null {
  let currentDir = startDir;

  while (true) {
    const candidate = join(currentDir, fileName);
    if (existsSync(candidate)) return candidate;

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
