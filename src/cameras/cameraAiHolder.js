'use strict';

let tagStore = null;

function setTagStore(store) {
  tagStore = store;
}

function getTagStore() {
  return tagStore;
}

module.exports = { setTagStore, getTagStore };
