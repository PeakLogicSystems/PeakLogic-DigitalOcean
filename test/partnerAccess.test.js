'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { TenantStore } = require('../src/tenants/tenantStore');
const { canAccessTenant, isPartnerHomeSession } = require('../src/tenants/partnerAccess');

const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mv-partner-test-'));

describe('partner access v1', () => {
  let store;

  beforeEach(() => {
    process.env.PEAKLOGIC_DATA = DATA_DIR;
    store = new TenantStore();
    for (const f of fs.readdirSync(DATA_DIR)) {
      if (f.endsWith('.json')) fs.unlinkSync(path.join(DATA_DIR, f));
    }
    store._store = {
      tenants: {},
      users: {},
      sessions: {},
      mfaChallenges: {},
      assets: {},
      devices: {},
      seededAt: null,
    };
  });

  it('links customer tenants to partner and scopes access', () => {
    const ace = store.createTenant({ tenantSlug: 'ace', name: 'ACE', tenantType: 'partner' });
    const ck = store.createTenant({
      tenantSlug: 'circlek-001',
      name: 'Circle K 001',
      partnerId: ace.tenantId,
    });
    assert.equal(ck.partnerId, ace.tenantId);

    const { user: partnerAdmin } = store.createUser({
      email: 'admin@ace.com',
      password: 'password123',
      name: 'ACE Admin',
      role: 'partner_admin',
      tenantId: ace.tenantId,
      invite: false,
    });
    const { user: tech } = store.createUser({
      email: 'tech@ace.com',
      password: 'password123',
      name: 'ACE Tech',
      role: 'partner_technician',
      tenantId: ace.tenantId,
      invite: false,
    });

    const rawAdmin = store.getUser(partnerAdmin.userId);
    const rawTech = store.getUser(tech.userId);
    assert.equal(canAccessTenant(rawAdmin, ace.tenantId, (id) => store.getTenant(id)), true);
    assert.equal(canAccessTenant(rawAdmin, ck.tenantId, (id) => store.getTenant(id)), true);
    assert.equal(canAccessTenant(rawTech, ck.tenantId, (id) => store.getTenant(id)), true);

    const other = store.createTenant({ tenantSlug: 'other-co', name: 'Other Co' });
    assert.equal(canAccessTenant(rawAdmin, other.tenantId, (id) => store.getTenant(id)), false);

    const accessible = store.listAccessibleTenantsForUser(rawAdmin);
    assert.equal(accessible.length, 2);
    assert.ok(accessible.some((t) => t.tenantSlug === 'circlek-001'));
  });

  it('resolves partner login org and switches active tenant', () => {
    const ace = store.createTenant({ tenantSlug: 'ace', name: 'ACE', tenantType: 'partner' });
    const ck = store.createTenant({
      tenantSlug: 'circlek-001',
      name: 'Circle K 001',
      partnerId: ace.tenantId,
    });
    store.createUser({
      email: 'tech@ace.com',
      password: 'password123',
      role: 'partner_technician',
      tenantId: ace.tenantId,
      invite: false,
    });

    const loginHomeRaw = store.login({
      email: 'tech@ace.com',
      password: 'password123',
      tenantSlug: 'ace',
    });
    const loginHome = loginHomeRaw.mfaRequired
      ? store.verifyMfa({ mfaToken: loginHomeRaw.mfaToken, code: loginHomeRaw._mfaCode })
      : loginHomeRaw;
    assert.equal(loginHome.tenant.tenantSlug, 'ace');

    const loginCustomerRaw = store.login({
      email: 'tech@ace.com',
      password: 'password123',
      tenantSlug: 'circlek-001',
    });
    const loginCustomer = loginCustomerRaw.mfaRequired
      ? store.verifyMfa({ mfaToken: loginCustomerRaw.mfaToken, code: loginCustomerRaw._mfaCode })
      : loginCustomerRaw;
    assert.equal(loginCustomer.tenant.tenantSlug, 'circlek-001');

    const switched = store.switchActiveTenant(loginHome.token, ck.tenantId);
    assert.equal(switched.tenant.tenantSlug, 'circlek-001');
    assert.equal(isPartnerHomeSession(switched.user, ck.tenantId), false);
    assert.equal(isPartnerHomeSession(switched.user, ace.tenantId), true);
  });

  it('rejects tenant roles on partner org invites', () => {
    const ace = store.createTenant({ tenantSlug: 'vendor', name: 'Vendor', tenantType: 'partner' });
    assert.throws(
      () => store.createUser({
        email: 'ops@vendor.com',
        role: 'operator',
        tenantId: ace.tenantId,
        invite: true,
      }),
      /partner_admin or partner_technician/,
    );
    const created = store.createUser({
      email: 'admin@vendor.com',
      role: 'partner_admin',
      tenantId: ace.tenantId,
      invite: true,
    });
    assert.equal(created.user.role, 'partner_admin');
  });

  it('exposes assigned global site key on public tenant payloads', () => {
    const ace = store.createTenant({ tenantSlug: 'ace', name: 'ACE', tenantType: 'partner' });
    const ck = store.createTenant({
      tenantSlug: 'circlek-001',
      name: 'Circle K 001',
      partnerId: ace.tenantId,
    });
    store.setGlobalSiteKey(ck.tenantId, '0x0010');

    const listed = store.listTenants().find((t) => t.tenantId === ck.tenantId);
    assert.equal(listed.globalSiteKey, 0x0010);
    assert.equal(listed.globalSiteKeyHex, '0x0010');
    assert.equal(listed.globalSiteKeyDigits, '000016');

    const linked = store.listLinkedCustomers(ace.tenantId);
    assert.equal(linked.length, 1);
    assert.equal(linked[0].globalSiteKeyHex, '0x0010');
    assert.equal(linked[0].globalSiteKeyDigits, '000016');

    const raw = store.getTenant(ck.tenantId);
    delete raw.globalSiteKey;
    const unassigned = store.publicTenant(raw);
    assert.equal(unassigned.globalSiteKey, null);
    assert.equal(unassigned.globalSiteKeyHex, null);
    assert.equal(unassigned.globalSiteKeyDigits, null);
  });

  it('resolves legacy vendor slug alias to ace tenant', () => {
    store.createTenant({ tenantSlug: 'ace', name: 'ACE', tenantType: 'partner' });
    const viaAlias = store.getTenant('vendor');
    assert.ok(viaAlias);
    assert.equal(viaAlias.tenantSlug, 'ace');
  });
});
