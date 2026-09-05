const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'cli', 'src', 'module_bindings');

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(file);
    } else if (file.endsWith('.ts')) {
      fix(file);
    }
  }
}

function withJsExtension(specifier) {
  return /\.(js|ts|json)$/.test(specifier) ? specifier : specifier + '.js';
}

function fix(file) {
  let source = fs.readFileSync(file, 'utf8');
  source = source.replace(
    /(from\s+['"])(\.\.?\/[^'"]*?)(['"])/g,
    (_match, prefix, specifier, suffix) => prefix + withJsExtension(specifier) + suffix
  );
  source = source.replace(
    /(export\s+\*\s+from\s+['"])(\.\.?\/[^'"]*?)(['"])/g,
    (_match, prefix, specifier, suffix) => prefix + withJsExtension(specifier) + suffix
  );
  fs.writeFileSync(file, source);
}

walk(root);
