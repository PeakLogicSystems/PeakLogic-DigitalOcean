#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { unpackArchive } = require('../src/project/projectArchive');
const u = unpackArchive(fs.readFileSync('/home/peaklogic/data/workspace.est.zip'));
console.log('activeProgram', u.project.activeProgram, u.programsManifest?.active);
console.log('programs', Object.keys(u.programs || {}));
