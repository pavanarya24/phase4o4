/**
 * Loads the compiled indicator asset for Node-side execution.
 * The asset is gzip+base64 so it is data, not editable script text.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ASSET = path.join(__dirname, '..', 'assets', 'p404.asset');

module.exports = function indicatorSource() {
  return zlib
    .gunzipSync(Buffer.from(fs.readFileSync(ASSET, 'utf-8'), 'base64'))
    .toString('utf-8');
};
