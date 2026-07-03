import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const mabuPath = "f:/Nam_3/work-security-zone/mabu-inventory-management";
const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin";

const file = 'linkedin_group_crawler/app/modules/all_platform/zalo/services/supabase_service.py';

console.log(`\n=============================================================`);
console.log(`DIFF FOR SUPABASE: ${file}`);
console.log(`=============================================================`);
const pathMabu = path.join(mabuPath, file).replace(/\//g, '\\');
const pathSeeding = path.join(seedingPath, file).replace(/\//g, '\\');

try {
  const output = execSync(`git diff --no-index "${pathSeeding}" "${pathMabu}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
  console.log(output.slice(0, 5000));
} catch (e) {
  if (e.stdout) {
    console.log(e.stdout.slice(0, 5000));
  } else {
    console.log(`Error running diff: ${e.message}`);
  }
}
