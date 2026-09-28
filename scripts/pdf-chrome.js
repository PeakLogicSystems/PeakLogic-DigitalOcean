'use strict';

const fs = require('fs');

/** Resolve Chrome/Edge for md-to-pdf (Puppeteer) on Windows and Linux. */
function findChromeExecutable() {
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    return process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  for (const exe of candidates) {
    if (fs.existsSync(exe)) return exe;
  }
  return null;
}

/** Launch options for md-to-pdf; prefers system Chrome/Edge when bundled Puppeteer Chrome is missing. */
function mdToPdfLaunchOptions(extra = {}) {
  const launchOptions = { args: ['--no-sandbox'], ...extra };
  const chromePath = findChromeExecutable();
  if (chromePath) launchOptions.executablePath = chromePath;
  return launchOptions;
}

module.exports = { findChromeExecutable, mdToPdfLaunchOptions };
