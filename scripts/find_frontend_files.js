import fs from 'fs';
import path from 'path';

const seedingPath = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin/linkedin-crawler-ui";

function search(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.relative(seedingPath, fullPath);
    if (file === 'node_modules' || file === '.next' || file === '.git') continue;
    
    let stat;
    try { stat = fs.statSync(fullPath); } catch(e) { continue; }
    
    if (stat.isDirectory()) {
      search(fullPath);
    } else {
      if (file.toLowerCase().includes('zalo') || file.toLowerCase().includes('inbox') || file.toLowerCase().includes('broadcast')) {
        console.log(`Found: ${relPath} (Size: ${stat.size} B)`);
      }
    }
  }
}

search(seedingPath);
