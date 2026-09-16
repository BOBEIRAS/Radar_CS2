const fs = require('fs');
const path = require('path');

const batPath = path.join(__dirname, '..', 'StartRadar.bat');
if (fs.existsSync(batPath)) {
  const content = fs.readFileSync(batPath, 'utf8');
  const normalized = content.replace(/\r?\n/g, '\r\n');
  fs.writeFileSync(batPath, normalized, 'utf8');
  console.log('StartRadar.bat converted to CRLF successfully.');
}
