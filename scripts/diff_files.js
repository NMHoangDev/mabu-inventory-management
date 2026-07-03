import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const mabuPath = "f:/Nam_3/work-security-zone/mabu-inventory-management";
const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin";

const filesToDiff = [
  'linkedin_group_crawler/app/modules/all_platform/zalo/api/routes/accounts.py',
  'linkedin_group_crawler/app/modules/all_platform/zalo/api/routes/auth.py',
  'linkedin_group_crawler/app/modules/all_platform/zalo/services/zca_worker_pool.py',
  'linkedin_group_crawler/scripts/zca_api_server.js',
  'extension-login-zalo/background.js',
  'extension-login-zalo/page-bridge.js'
];

for (const file of filesToDiff) {
  console.log(`\n=============================================================`);
  console.log(`DIFF FOR FILE: ${file}`);
  console.log(`=============================================================`);
  const pathMabu = path.join(mabuPath, file).replace(/\//g, '\\');
  const pathSeeding = path.join(seedingPath, file).replace(/\//g, '\\');
  
  try {
    // Using fc command on windows or git diff
    const output = execSync(`git diff --no-index "${pathSeeding}" "${pathMabu}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    console.log(output);
  } catch (e) {
    if (e.stdout) {
      console.log(e.stdout);
    } else {
      console.log(`Error running diff: ${e.message}`);
    }
  }
}
