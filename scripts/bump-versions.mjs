#!/usr/bin/env node

import { readFileSync, writeFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Usage: node scripts/bump-versions.mjs <version>');
  console.error('Example: node scripts/bump-versions.mjs 1.0.2');
  process.exit(1);
}

const packagesDir = join(rootDir, 'packages');
const packages = readdirSync(packagesDir, { withFileTypes: true })
  .filter(d => d.isDirectory() && existsSync(join(packagesDir, d.name, 'package.json')))
  .map(d => d.name);

for (const pkg of packages) {
  const pkgPath = join(packagesDir, pkg, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkgJson.version = newVersion;
  
  // Also update peer dependencies to match
  if (pkgJson.peerDependencies) {
    for (const [dep, range] of Object.entries(pkgJson.peerDependencies)) {
      if (dep.startsWith('@xlabs-xyz/')) {
        pkgJson.peerDependencies[dep] = `^${newVersion}`;
      }
    }
  }
  
  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');
  console.log(`✓ ${pkgJson.name} → ${newVersion}`);
}

console.log(`\nAll packages bumped to ${newVersion}`);

