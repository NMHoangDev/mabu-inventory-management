import fs from 'fs';
import path from 'path';

const searchDir = "f:/Nam_3/work-security-zone/seedingTeam/scraper-linkedin";

function search(dir) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch(e) {
    console.log("Could not read directory", dir, e.message);
    return;
  }
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (file === 'node_modules' || file === '.next' || file === '.git' || file === 'venv') continue;
    
    let stat;
    try { stat = fs.statSync(fullPath); } catch(e) { continue; }
    
    if (stat.isDirectory()) {
      search(fullPath);
    } else {
      if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx') || file.endsWith('.py') || file.endsWith('.json') || file.endsWith('.html')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.toLowerCase().includes('progress') || content.toLowerCase().includes('already')) {
          const lines = content.split('\n');
          lines.forEach((line, idx) => {
            if (line.toLowerCase().includes('progress') || line.toLowerCase().includes('already')) {
              console.log(`${fullPath}:${idx + 1}: ${line.trim()}`);
            }
          });
        }
      }
    }
  }
}

search(searchDir);
