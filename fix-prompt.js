const fs = require('fs');
const file = '/Users/raga_user/Downloads/kk_interview copilot/frontend/src/services/platformPromptBuilder.js';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\\`\\`\\`/g, '\\`\\`\\`');
fs.writeFileSync(file, content);
