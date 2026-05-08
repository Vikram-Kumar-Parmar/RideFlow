#!/usr/bin/env node
/**
 * Runs the SQL files in schema/ in order against the configured DB.
 *
 * Uses the `mysql` CLI (vs the mysql2 driver) so DELIMITER directives in
 * stored procedures/triggers/events work natively. The CLI has to be
 * installed (the README says so).
 *
 *  --seed-only    → just runs 99_seed.sql.
 *  When DB_TARGET=tidb, scripts 04..07 are skipped with a warning.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const target = (process.env.DB_TARGET || 'mysql').toLowerCase();

const SKIP_ON_TIDB = new Set([
  '04_d3_procedures.sql',
  '05_d3_triggers.sql',
  '06_d3_events.sql',
  '07_d3_dcl.sql',
]);

function args() {
  if (target === 'tidb') {
    const a = [
      `-h${process.env.TIDB_HOST}`,
      `-P${process.env.TIDB_PORT || 4000}`,
      `-u${process.env.TIDB_USER}`,
      `-p${process.env.TIDB_PASSWORD}`,
      '--ssl-mode=VERIFY_IDENTITY',
    ];
    if (process.env.TIDB_SSL_CA && fs.existsSync(process.env.TIDB_SSL_CA)) {
      a.push(`--ssl-ca=${process.env.TIDB_SSL_CA}`);
    }
    return a;
  }
  return [
    `-h${process.env.MYSQL_HOST || '127.0.0.1'}`,
    `-P${process.env.MYSQL_PORT || 3306}`,
    `-u${process.env.MYSQL_USER || 'root'}`,
    `-p${process.env.MYSQL_PASSWORD || ''}`,
  ];
}

function runFile(file) {
  const full = path.join(__dirname, '..', '..', 'schema', file);
  console.log(`> ${file}`);
  const sql = fs.readFileSync(full, 'utf8');
  const r = spawnSync('mysql', args(), {
    input: sql,
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (r.status !== 0) {
    throw new Error(`${file} failed (exit ${r.status})`);
  }
}

function main() {
  const seedOnly = process.argv.includes('--seed-only');
  const all = fs
    .readdirSync(path.join(__dirname, '..', '..', 'schema'))
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const files = seedOnly ? all.filter((f) => f === '99_seed.sql') : all;

  for (const f of files) {
    if (target === 'tidb' && SKIP_ON_TIDB.has(f)) {
      console.log(`# skipping ${f} on TiDB (unsupported feature).`);
      continue;
    }
    runFile(f);
  }
  console.log(`Done. (db_target=${target})`);
}

try {
  main();
} catch (e) {
  console.error('Setup failed:', e.message);
  process.exit(1);
}
