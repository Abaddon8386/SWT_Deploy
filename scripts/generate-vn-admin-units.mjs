// scripts/generate-vn-admin-units.mjs — chạy: node scripts/generate-vn-admin-units.mjs
// Nguồn: provinces.open-api.vn API v2 (cấu trúc 2 cấp sau 01/07/2025).
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const outPath = 'apps/api/src/main/resources/geo/vn-admin-units.json';
const res = await fetch('https://provinces.open-api.vn/api/v2/?depth=2');
if (!res.ok) throw new Error(`HTTP ${res.status}`);
const raw = await res.json();
const provinces = raw.map(p => ({
  code: String(p.code),
  name: p.name,
  wards: (p.wards ?? []).map(w => ({ code: String(w.code), name: w.name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'vi')),
})).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
if (provinces.length !== 34) throw new Error(`Expected 34 provinces, got ${provinces.length}`);
if (provinces.some(p => p.wards.length === 0)) throw new Error('A province has no wards');
await mkdir(dirname(outPath), { recursive: true });
await writeFile(outPath, JSON.stringify({ effectiveFrom: '2025-07-01', source: 'provinces.open-api.vn/api/v2', provinces }));
console.log('provinces', provinces.length, 'wards', provinces.reduce((n, p) => n + p.wards.length, 0));
