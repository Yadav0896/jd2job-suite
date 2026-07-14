const fs = require('fs');
const file = '/Users/raga_user/Downloads/kk_interview copilot/frontend/src/components/AudioControls.jsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/\\\{\\\s\*\(\\\?:"answer"\\\s\*:\\\s\*"\\)\\\?/, '\\{\\s*(?:"answer"\\s*:\\s*")?');
content = content.replace(/\\\{\\\s\*"bulletPoints"\\\s\*:\\\s\*\\\[/, '\\{\\s*"bulletPoints"\\s*:\\s*\\[');
content = content.replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '\\"');

fs.writeFileSync(file, content);
