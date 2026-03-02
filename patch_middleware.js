const fs = require('fs');

let content = fs.readFileSync('web/middleware.ts', 'utf8');

const targetStr = `const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) => pathname.startsWith(route));`;
const replacementStr = `const isPublicApiRoute = PUBLIC_API_ROUTES.some((route) =>
    pathname === route || pathname.startsWith(route + "/") || pathname.startsWith(route + "?")
  );`;

content = content.replace(targetStr, replacementStr);
fs.writeFileSync('web/middleware.ts', content);
