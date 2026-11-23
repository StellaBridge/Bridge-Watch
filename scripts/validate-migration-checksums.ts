#!/usr/bin/env node

import { createHash } from "crypto";
import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, join } from "path";
import { readdirSync } from "fs";

const MIGRATIONS_DIR = resolve(__dirname, "../backend/src/database/migrations");
const CHECKSUM_MANIFEST = resolve(__dirname, "migration-checksums.json");

interface ChecksumManifest {
  checksums: Record<string, string>;
  lastUpdated: string;
}

function calculateChecksum(filePath: string): string {
  const content = readFileSync(filePath, "utf-8");
  return createHash("sha256").update(content).digest("hex");
}

function getMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
    .sort();
}

function extractSequenceNumber(filename: string): number {
  const match = filename.match(/^(\d+)_/);
  if (match) {
    return parseInt(match[1], 10);
  }
  const dateMatch = filename.match(/^(\d{8})/);
  if (dateMatch) {
    return parseInt(dateMatch[1], 10);
  }
  return 0;
}

function loadManifest(): ChecksumManifest {
  if (!existsSync(CHECKSUM_MANIFEST)) {
    return { checksums: {}, lastUpdated: new Date().toISOString() };
  }
  return JSON.parse(readFileSync(CHECKSUM_MANIFEST, "utf-8"));
}

function saveManifest(manifest: ChecksumManifest): void {
  manifest.lastUpdated = new Date().toISOString();
  writeFileSync(CHECKSUM_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
}

function validateMigrations(): void {
  const manifest = loadManifest();
  const migrationFiles = getMigrationFiles();
  const errors: string[] = [];
  const newMigrations: string[] = [];

  let highestExistingSequence = 0;
  for (const filename of Object.keys(manifest.checksums)) {
    const seq = extractSequenceNumber(filename);
    if (seq > highestExistingSequence) {
      highestExistingSequence = seq;
    }
  }

  for (const filename of migrationFiles) {
    const filePath = join(MIGRATIONS_DIR, filename);
    const currentChecksum = calculateChecksum(filePath);
    const sequence = extractSequenceNumber(filename);

    if (manifest.checksums[filename]) {
      if (manifest.checksums[filename] !== currentChecksum) {
        errors.push(
          `Migration file modified: ${filename}\n` +
          `  Expected: ${manifest.checksums[filename]}\n` +
          `  Got:      ${currentChecksum}\n` +
          `  Historical migrations must remain immutable after being applied to production.`
        );
      }
    } else {
      if (sequence > 0 && sequence <= highestExistingSequence) {
        errors.push(
          `New migration ${filename} has sequence ${sequence} but inserts before existing migration ${highestExistingSequence}.\n` +
          `  New migrations must have higher sequence numbers than all existing migrations.`
        );
      } else {
        newMigrations.push(filename);
        manifest.checksums[filename] = currentChecksum;
      }
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ Migration checksum validation FAILED:\n");
    errors.forEach((error) => console.error(error + "\n"));
    process.exit(1);
  }

  if (newMigrations.length > 0) {
    console.log("\n✅ New migrations detected and checksums recorded:");
    newMigrations.forEach((filename) => console.log(`  - ${filename}`));
    saveManifest(manifest);
    console.log(`\nChecksum manifest updated: ${CHECKSUM_MANIFEST}`);
  } else {
    console.log("\n✅ All migration checksums validated successfully.");
  }
}

try {
  validateMigrations();
} catch (error) {
  console.error("\n❌ Migration validation error:", error);
  process.exit(1);
}
