import fs from 'fs';
import path from 'path';

const mabuPath = "f:/Nam_3/work-security-zone/mabu-inventory-management";
const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin";

function getFilesList(baseDir, relativeDir = '') {
  const fullPath = path.join(baseDir, relativeDir);
  if (!fs.existsSync(fullPath)) return [];
  const entries = fs.readdirSync(fullPath);
  let results = [];
  for (const entry of entries) {
    const rel = path.join(relativeDir, entry);
    const stat = fs.statSync(path.join(baseDir, rel));
    if (stat.isDirectory()) {
      results.push(...getFilesList(baseDir, rel));
    } else {
      results.push(rel);
    }
  }
  return results;
}

const paths = [
  'linkedin_group_crawler/app/modules/all_platform/zalo',
  'linkedin_group_crawler/scripts',
  'extension-login-zalo'
];

for (const p of paths) {
  console.log(`\n=== Comparing folder: ${p} ===`);
  const mabuFiles = getFilesList(mabuPath, p);
  const seedingFiles = getFilesList(seedingPath, p);
  
  const mabuSet = new Set(mabuFiles);
  const seedingSet = new Set(seedingFiles);
  
  console.log(`Files unique to seedingTeam:`);
  for (const f of seedingFiles) {
    if (!mabuSet.has(f)) {
      console.log(`  + ${f}`);
    }
  }
  
  console.log(`Files unique to Mabu:`);
  for (const f of mabuFiles) {
    if (!seedingSet.has(f)) {
      console.log(`  - ${f}`);
    }
  }
  
  console.log(`Files in both (comparing size & content):`);
  for (const f of mabuFiles) {
    if (seedingSet.has(f)) {
      const sizeMabu = fs.statSync(path.join(mabuPath, f)).size;
      const sizeSeeding = fs.statSync(path.join(seedingPath, f)).size;
      if (sizeMabu !== sizeSeeding) {
        console.log(`  * ${f}: Size diff (Mabu: ${sizeMabu} B, seeding: ${sizeSeeding} B)`);
      } else {
        const contentMabu = fs.readFileSync(path.join(mabuPath, f), 'utf8');
        const contentSeeding = fs.readFileSync(path.join(seedingPath, f), 'utf8');
        if (contentMabu !== contentSeeding) {
          console.log(`  * ${f}: Content diff (same size ${sizeMabu} B)`);
        }
      }
    }
  }
}
