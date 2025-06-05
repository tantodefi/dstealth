#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('🔧 Fixing Farcaster Frame SDK import issues...');

const fixes = [
  {
    file: 'node_modules/@farcaster/frame-sdk/dist/index.js',
    search: "from './sdk'",
    replace: "from './sdk.js'"
  },
  {
    file: 'node_modules/@farcaster/frame-sdk/dist/sdk.js',
    search: "from './evmProvider'",
    replace: "from './evmProvider.js'"
  },
  {
    file: 'node_modules/@coinbase/onchainkit/node_modules/@farcaster/frame-wagmi-connector/dist/index.js',
    search: "from './connector'",
    replace: "from './connector.js'"
  }
];

let fixedCount = 0;

fixes.forEach(({ file, search, replace }) => {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.includes(search)) {
        const newContent = content.replace(new RegExp(search, 'g'), replace);
        fs.writeFileSync(file, newContent, 'utf8');
        console.log(`✅ Fixed: ${file}`);
        fixedCount++;
      } else {
        console.log(`⏭️  Already fixed: ${file}`);
      }
    } else {
      console.log(`⚠️  File not found: ${file}`);
    }
  } catch (error) {
    console.error(`❌ Error fixing ${file}:`, error.message);
  }
});

console.log(`🎉 Fixed ${fixedCount} files`); 