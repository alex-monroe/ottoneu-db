const fs = require('fs');

let content = fs.readFileSync('web/middleware.ts', 'utf8');

const targetStr = `const PUBLIC_API_ROUTES = [`;
const replacementStr = `export const PUBLIC_API_ROUTES = [`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('web/middleware.ts', content);
