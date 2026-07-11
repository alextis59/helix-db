#!/usr/bin/env node

import { validateCargoAuditReport } from './cargo-audit-contract.mjs';

const clean = {
  database: {
    'advisory-count': 1159,
    'last-commit': 'e20296422feea6aab5cd36bf993c68d22e4aa24f',
    'last-updated': '2026-07-11T08:12:16+02:00',
  },
  lockfile: { 'dependency-count': 21 },
  settings: {
    target_arch: [],
    target_os: [],
    severity: null,
    ignore: [],
    informational_warnings: ['unmaintained', 'unsound', 'notice'],
  },
  vulnerabilities: { found: false, count: 0, list: [] },
  warnings: {},
};

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const clone = (value) => structuredClone(value);
const cases = [
  ['dependency count', (value) => (value.lockfile['dependency-count'] = 20), 'audited dependency'],
  [
    'vulnerability',
    (value) => {
      value.vulnerabilities = { found: true, count: 1, list: [{ advisory: { id: 'TEST' } }] };
    },
    'Rust vulnerabilities',
  ],
  [
    'unmaintained warning',
    (value) => (value.warnings.unmaintained = [{ advisory: { id: 'TEST' } }]),
    'Rust advisory warnings',
  ],
  [
    'ignored advisory',
    (value) => value.settings.ignore.push('RUSTSEC-TEST'),
    'cargo-audit settings',
  ],
  ['database revision', (value) => (value.database['last-commit'] = 'mutable'), 'revision'],
  ['database time', (value) => (value.database['last-updated'] = 'invalid'), 'update time'],
  ['advisory count', (value) => (value.database['advisory-count'] = 0), 'advisory count'],
];

validateCargoAuditReport(clean, 21);
const selfAudit = clone(clean);
selfAudit.database['last-commit'] = null;
selfAudit.database['last-updated'] = null;
selfAudit.lockfile['dependency-count'] = 374;
validateCargoAuditReport(selfAudit, 374, { requireDatabaseMetadata: false });
for (const [label, mutate, marker] of cases) {
  const candidate = clone(clean);
  mutate(candidate);
  let failure = '';
  try {
    validateCargoAuditReport(candidate, 21);
  } catch (error) {
    failure = String(error);
  }
  assert(failure.includes(marker), `${label}: expected rejection marker absent`);
}

process.stdout.write(
  `PASS cargo-audit fail-closed contract: clean report accepted and ${cases.length} advisory/database mutations rejected\n`,
);
