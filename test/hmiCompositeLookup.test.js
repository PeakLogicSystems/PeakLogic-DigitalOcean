'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const hmiSetupUiJs = fs.readFileSync(path.join(root, 'public/js/hmiSetupUi.js'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} missing`);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error(`Could not extract ${name}`);
}

describe('hmi composite path lookup', () => {
  it('does not recurse between compositeManifestFromAsset and hmiAssetForRecentPath', () => {
    const manifestFn = extractFunction(hmiSetupUiJs, 'compositeManifestFromAsset');
    const recentFn = extractFunction(hmiSetupUiJs, 'hmiAssetForRecentPath');
    assert.doesNotMatch(manifestFn, /hmiAssetForRecentPath/);
    assert.match(manifestFn, /hmiAssetByPath\(path\)/);
    assert.match(recentFn, /compositeManifestFromAsset\(p\)/);
  });
});
