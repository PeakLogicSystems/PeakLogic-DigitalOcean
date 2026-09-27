'use strict';

const { JasperControlCenterAdapter } = require('./jasperControlCenter');

const ATT_DEFINITION = {
  id: 'att',
  displayName: 'AT&T Control Center',
  docsUrl: 'https://developer.cisco.com/docs/control-center/',
  signupUrl: 'https://www.business.att.com/products/control-center.html',
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
  notes: 'AT&T Control Center (Cisco Jasper). Base URL and API key from Control Center → APIs → REST APIs → Getting Started.',
};

class AttAdapter extends JasperControlCenterAdapter {
  constructor(credentials = {}, options = {}) {
    super('att', credentials, options);
  }
}

AttAdapter.vendorDefinition = ATT_DEFINITION;

module.exports = { AttAdapter, ATT_DEFINITION };
