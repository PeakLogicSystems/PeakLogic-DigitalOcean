'use strict';

/** Opta /setup device mode vs PC Remote ST execution alignment. */
function optaModeLinkStatus(opts = {}) {
  const deviceMode = opts.deviceMode === 'remote_io' ? 'remote_io' : 'standalone';
  const remoteOn = opts.remoteExecution === true;
  const modeLabel = deviceMode === 'remote_io' ? 'Remote I/O' : 'Standalone (ST)';
  const pcExpects = remoteOn ? 'Standalone (ST on Opta)' : 'Remote I/O (PC runs ST)';
  let aligned = true;
  let hint = '';
  if (remoteOn && deviceMode === 'remote_io') {
    aligned = false;
    hint = 'PC Remote ST is ON but Opta is Remote I/O — set Standalone on Opta /setup, or turn Remote ST OFF.';
  } else if (!remoteOn && deviceMode === 'standalone') {
    aligned = false;
    hint = 'PC Remote ST is OFF but Opta is Standalone — set Remote I/O on Opta /setup for PC logic, or turn Remote ST ON.';
  }
  return {
    deviceMode,
    modeLabel,
    pcExpects,
    aligned,
    hint,
  };
}

module.exports = { optaModeLinkStatus };
