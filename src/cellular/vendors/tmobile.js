'use strict';

const { JasperControlCenterAdapter } = require('./jasperControlCenter');

const TMOBILE_DEFINITION = {
  id: 'tmobile',
  displayName: 'T-Mobile Control Center',
  docsUrl: 'https://developer.cisco.com/docs/control-center/',
  signupUrl: 'https://www.t-mobile.com/business/solutions/iot/connectivity-management',
  configSchema: [
    {
      key: 'baseUrl',
      label: 'API Base URL',
      required: true,
      placeholder: 'https://<your-portal>.jasper.com/rws/api/v1',
    },
    { key: 'username', label: 'API Username', required: true },
    { key: 'apiKey', label: 'API Key', required: true, secret: true },
    { key: 'accountId', label: 'Account ID', required: true },
  ],
  notes: 'T-Mobile Control Center (Cisco Jasper). Portal URL and API key from your T-Mobile for Business account representative or Control Center help.',
};

class TmobileAdapter extends JasperControlCenterAdapter {
  constructor(credentials = {}, options = {}) {
    super('tmobile', credentials, options);
  }
}

TmobileAdapter.vendorDefinition = TMOBILE_DEFINITION;

module.exports = { TmobileAdapter, TMOBILE_DEFINITION };
