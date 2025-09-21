// puppeteer.config.cjs
const { join } = require('path');
module.exports = {
  cacheDirectory: '/opt/render/.cache/puppeteer', // または `/opt/render/project/.cache/puppeteer`
};