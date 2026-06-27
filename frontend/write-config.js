const fs = require('fs');
const path = require('path');

const api = process.env.API_BASE_URL || 'http://localhost:3000';
const content = `// Auto-generated at build time\nwindow.API_BASE_URL = '${api}';\n`;

fs.writeFileSync(path.join(__dirname, 'config.js'), content, 'utf8');
console.log('Wrote frontend/config.js ->', api);
