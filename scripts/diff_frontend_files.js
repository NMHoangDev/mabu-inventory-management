import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const mabuPath = "f:/Nam_3/work-security-zone/mabu-inventory-management";
const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin/linkedin-crawler-ui";

const filesToDiff = [
  { mabu: 'hooks/useZaloAdminInbox.ts', seeding: 'hooks/useZaloAdminInbox.ts' },
  { mabu: 'services/zaloCrawlerService.ts', seeding: 'services/zaloCrawlerService.ts' },
  { mabu: 'services/zaloExtension.ts', seeding: 'services/zaloExtension.ts' }
];

let diffOutput = "";

for (const pair of filesToDiff) {
  diffOutput += `\n=============================================================\n`;
  diffOutput += `DIFF FOR: ${pair.mabu}\n`;
  diffOutput += `=============================================================\n`;
  const pathMabu = path.join(mabuPath, pair.mabu).replace(/\//g, '\\');
  const pathSeeding = path.join(seedingPath, pair.seeding).replace(/\//g, '\\');
  
  try {
    const output = execSync(`git diff --no-index "${pathSeeding}" "${pathMabu}"`, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    diffOutput += output;
  } catch (e) {
    if (e.stdout) {
      diffOutput += e.stdout;
    } else {
      diffOutput += `Error: ${e.message}\n`;
    }
  }
}

const scratchPath = "C:/Users/OS/.gemini/antigravity-ide/scratch/diffs.txt";
fs.mkdirSync(path.dirname(scratchPath), { recursive: true });
fs.writeFileSync(scratchPath, diffOutput, 'utf8');
console.log("Written diffs to:", scratchPath);
