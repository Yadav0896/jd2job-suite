const fs = require('fs');
const path = require('path');
const os = require('os');

const chromeDir = path.join(os.homedir(), 'Library/Application Support/Google/Chrome');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    let stat;
    try {
      stat = fs.statSync(filePath);
    } catch (e) {
      return;
    }
    if (stat && stat.isDirectory()) {
      if (file !== 'Cache' && file !== 'Code Cache' && file !== 'GPUCache') {
        results = results.concat(walk(filePath));
      }
    } else {
      if (file === 'Preferences' || file === 'Preferences.bad' || file.includes('Local State')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

const files = walk(chromeDir);
console.log(`Found ${files.length} candidate files to check.`);

files.forEach(f => {
  try {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('jsbnihmjbekhammcegjcbfbkccoomb')) {
      console.log(`Match found in: ${f}`);
      // Let's parse and find the path
      try {
        const json = JSON.parse(content);
        const settings = json.extensions?.settings || {};
        const ext = settings['jsbnihmjbekhammcegjcbfbkccoomb'];
        if (ext) {
          console.log(`Path: ${ext.path}`);
        }
      } catch (e) {
        // console.log('JSON parse failed for ' + f);
      }
    }
  } catch (e) {
    // ignore
  }
});
