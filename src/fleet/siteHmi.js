'use strict';

function siteSlugFromId(siteId) {
  return String(siteId || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function defaultCloudProject(site) {
  if (site?.cloudProject) return String(site.cloudProject).trim();
  return 'duplex-lift-station';
}

function defaultHmiScreen(site) {
  if (site?.hmiScreenId) return String(site.hmiScreenId).trim();
  if (site?.cloudProject && String(site.cloudProject).includes('circle-k')) {
    const slug = siteSlugFromId(site?.siteId);
    if (slug) return `screen_ck_${slug}`;
  }
  return 'screen_1';
}

function buildSiteHmiUrl(site) {
  const project = defaultCloudProject(site);
  const screen = defaultHmiScreen(site);
  const q = new URLSearchParams({ project, hmi: screen, open: '1' });
  return `/?${q.toString()}`;
}

module.exports = {
  siteSlugFromId,
  defaultCloudProject,
  defaultHmiScreen,
  buildSiteHmiUrl,
};
