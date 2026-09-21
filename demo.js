#!/usr/bin/env node
/**
 * Seeds the demo data:  npm run demo
 */
const seedDemo = require('./db/demo-data');

if (require.main === module) {
  seedDemo();
}

module.exports = seedDemo;
