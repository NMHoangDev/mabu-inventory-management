import fs from 'fs';
import path from 'path';

const mabuPath = "f:/Nam_3/work-security-zone/mabu-inventory-management/zca-js/zca-js";
const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin/zca-js/zca-js";

if (!fs.existsSync(seedingPath)) {
  console.log("seedingTeam zca-js/zca-js folder does not exist at:", seedingPath);
} else {
  console.log("seedingTeam zca-js/zca-js folder exists!");
  try {
    const pkgMabu = JSON.parse(fs.readFileSync(path.join(mabuPath, 'package.json'), 'utf8'));
    const pkgSeeding = JSON.parse(fs.readFileSync(path.join(seedingPath, 'package.json'), 'utf8'));
    console.log("Mabu zca-js package version:", pkgMabu.version);
    console.log("Seeding zca-js package version:", pkgSeeding.version);
  } catch(e) {
    console.log("Failed to compare package.json:", e.message);
  }
}
