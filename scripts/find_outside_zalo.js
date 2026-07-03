import fs from 'fs';
import path from 'path';

const searchDirs = [
  "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin/extension-login-zalo",
  "f:/Nam_3/work-security-zone/mabu-inventory-management/extension-login-zalo"
];

for (const dir of searchDirs) {
  console.log("Searching in", dir);
  if (!fs.existsSync(dir)) {
    console.log("Directory does not exist:", dir);
    continue;
  }
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isFile() && file.endsWith('.js')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (content.toLowerCase().includes('progress') || content.toLowerCase().includes('already')) {
        const lines = content.split('\n');
        lines.forEach((line, idx) => {
          if (line.toLowerCase().includes('progress') || line.toLowerCase().includes('already')) {
            console.log(`${file}:${idx + 1}: ${line.trim()}`);
          }
        });
      }
    }
  }
}
