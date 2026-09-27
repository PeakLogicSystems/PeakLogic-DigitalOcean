'use strict';

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongod;
let baseUrl;
let httpServer;

function request(method, path, { token, platformAdminKey, body, form, cookies, accept, forwardedProto } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (form) headers['Content-Type'] = 'application/x-www-form-urlencoded';
    if (token) headers.Authorization = `Bearer ${token}`;
    if (platformAdminKey) headers['X-Platform-Admin-Key'] = platformAdminKey;
    if (cookies) headers.Cookie = cookies;
    if (accept) headers.Accept = accept;
    if (forwardedProto) headers['X-Forwarded-Proto'] = forwardedProto;
    const payload = body ? JSON.stringify(body) : form ? new URLSearchParams(form).toString() : null;
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = text ? JSON.parse(text) : null; } catch { /* empty */ }
        resolve({
          status: res.statusCode,
          json,
          text,
          headers: res.headers,
        });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

describe('cloud API (MongoDB)', () => {
  before(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGODB_URI = mongod.getUri();
    process.env.MONGODB_DB = 'peaklogic_cloud_test';
    process.env.JWT_SECRET = 'test-jwt-secret-min-32-chars-long';
    process.env.PLATFORM_ADMIN_KEY = 'test-platform-admin-key';
    process.env.NODE_ENV = 'test';

    const { resetMongo, connectMongo } = require('../src/db/mongo');
    await resetMongo();
    await connectMongo();
    const { ensureIndexes } = require('../src/db/indexes');
    await ensureIndexes();

    const { createCloudApp } = require('../src/api/cloudApp');
    httpServer = createCloudApp().listen(0, '127.0.0.1', () => {
      const { port } = httpServer.address();
      baseUrl = `http://127.0.0.1:${port}`;
    });
    await new Promise((resolve) => httpServer.once('listening', resolve));
  });

  after(async () => {
    if (httpServer) {
      await new Promise((resolve) => httpServer.close(resolve));
    }
    const { closeMongo } = require('../src/db/mongo');
    await closeMongo();
    if (mongod) await mongod.stop();
  });

  it('health returns ok', async () => {
    const res = await request('GET', '/health');
    assert.equal(res.status, 200);
    assert.equal(res.json.ok, true);
    assert.equal(res.json.service, 'peaklogic-cloud');
  });

  it('serves HMI static assets without login', async () => {
    const sample = await request('GET', '/samples/assisted-living-ortho-3d.html');
    assert.equal(sample.status, 200);
    assert.match(sample.text, /Assisted Living Facility/i);

    const svg = await request('GET', '/hmi/svg/demos/assisted-living/floor_1_plan.svg');
    assert.equal(svg.status, 200);
    assert.match(svg.text, /<svg/i);
  });

  it('GET / returns service info as JSON', async () => {
    const res = await request('GET', '/?format=json');
    assert.equal(res.status, 200);
    assert.equal(res.json.service, 'peaklogic-cloud');
    assert.equal(res.json.version, '0.1.0');
    assert.ok(res.json.links.health);
    assert.ok(res.json.links.login);
  });

  it('GET /login returns login page', async () => {
    const res = await request('GET', '/login');
    assert.equal(res.status, 200);
    assert.match(res.text, /PeakLogic/i);
    assert.match(res.text, /Welcome Back/);
    assert.match(res.text, /tenantSlug/);
  });

  it('GET / redirects unauthenticated browser to login', async () => {
    const res = await request('GET', '/', { accept: 'text/html' });
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /\/login$/);
  });

  it('POST /login sets auth cookie and redirects home', async () => {
    await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Web Login Co',
        tenantSlug: 'weblogin',
        email: 'admin@weblogin.test',
        password: 'password123',
      },
    });
    const res = await request('POST', '/login', {
      form: {
        tenantSlug: 'weblogin',
        email: 'admin@weblogin.test',
        password: 'password123',
      },
    });
    assert.equal(res.status, 302);
    assert.match(res.headers.location, /\/studio$/);
    assert.ok(res.headers['set-cookie']?.some((c) => c.startsWith('mv_token=')));
    assert.ok(res.headers['set-cookie']?.every((c) => !/;\s*Secure/i.test(c)));
  });

  it('studio alarm users API reads and updates mongo tenant users', async () => {
    await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Studio Users Co',
        tenantSlug: 'studiousers',
        email: 'admin@studiousers.test',
        password: 'password123',
      },
    });
    const login = await request('POST', '/login', {
      form: {
        tenantSlug: 'studiousers',
        email: 'admin@studiousers.test',
        password: 'password123',
      },
    });
    const cookie = login.headers['set-cookie']?.find((c) => c.startsWith('mv_token='))?.split(';')[0];
    assert.ok(cookie);

    const list = await request('GET', '/api/studio/users', { cookies: cookie });
    assert.equal(list.status, 200);
    assert.equal(list.json.users.length, 1);
    const userId = list.json.users[0].id;

    const updated = await request('PUT', `/api/studio/users/${userId}`, {
      cookies: cookie,
      body: {
        profile: {
          mobile: '+15551234567',
          alarmNotifications: {
            enabled: true,
            sms: true,
            email: true,
            minLevel: 'inner',
            phone: '+15551234567',
          },
        },
      },
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.json.user.profile.alarmNotifications.sms, true);
    assert.equal(updated.json.user.profile.alarmNotifications.phone, '+15551234567');
  });

  it('POST /login over HTTPS sets Secure auth cookie', async () => {
    await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Https Login Co',
        tenantSlug: 'httpslogin',
        email: 'admin@httpslogin.test',
        password: 'password123',
      },
    });
    const res = await request('POST', '/login', {
      form: {
        tenantSlug: 'httpslogin',
        email: 'admin@httpslogin.test',
        password: 'password123',
      },
      forwardedProto: 'https',
    });
    assert.equal(res.status, 302);
    assert.ok(res.headers['set-cookie']?.some((c) => /;\s*Secure/i.test(c)));
  });

  it('signup → location → system → device', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Acme Water',
        tenantSlug: 'acme',
        email: 'admin@acme.test',
        password: 'password123',
      },
    });
    assert.equal(signup.status, 201);
    assert.ok(signup.json.token);
    const token = signup.json.token;

    const loc = await request('POST', '/api/locations', {
      token,
      body: { name: 'Plant A', slug: 'plant-a' },
    });
    assert.equal(loc.status, 201);
    const locationId = loc.json.location.id;

    const sys = await request('POST', `/api/locations/${locationId}/systems`, {
      token,
      body: { name: 'Line 1', slug: 'line-1' },
    });
    assert.equal(sys.status, 201);
    const systemId = sys.json.system.id;

    const dev = await request('POST', `/api/systems/${systemId}/devices`, {
      token,
      body: {
        name: 'Opta ST 01',
        slug: 'opta-st-01',
        driverType: 'mqtt_parc',
        driverConfig: { deviceId: 'opta_st_01' },
      },
    });
    assert.equal(dev.status, 201);
    assert.equal(dev.json.device.driverType, 'mqtt_parc');

    const bad = await request('POST', `/api/systems/${systemId}/devices`, {
      token,
      body: { name: 'DO Probe', slug: 'do-probe', driverType: 'modbus_rtu' },
    });
    assert.equal(bad.status, 400);
    assert.match(bad.json.error, /MQTT/i);

    const list = await request('GET', `/api/systems/${systemId}/devices`, { token });
    assert.equal(list.status, 200);
    assert.equal(list.json.devices.length, 1);
  });

  it('login requires tenant slug', async () => {
    const res = await request('POST', '/api/auth/login', {
      body: { tenantSlug: 'acme', email: 'admin@acme.test', password: 'password123' },
    });
    assert.equal(res.status, 200);
    assert.ok(res.json.token);
  });

  it('signup stores profile with alarm notification fields', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Notify Co',
        tenantSlug: 'notify',
        email: 'ops@notify.test',
        password: 'password123',
        profile: {
          displayName: 'Ops Lead',
          mobile: '+15550199',
          alarmNotifications: { sms: true, minLevel: 'outer', email: false },
        },
      },
    });
    assert.equal(signup.status, 201);
    const profile = signup.json.user.profile;
    assert.equal(profile.displayName, 'Ops Lead');
    assert.equal(profile.alarmNotifications.sms, true);
    assert.equal(profile.alarmNotifications.minLevel, 'outer');
    assert.equal(profile.alarmNotifications.email, false);
  });

  it('PATCH /api/auth/me updates profile alarm settings', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Patch Co',
        tenantSlug: 'patchco',
        email: 'user@patch.test',
        password: 'password123',
      },
    });
    const token = signup.json.token;

    const patch = await request('PATCH', '/api/auth/me', {
      token,
      body: {
        profile: {
          displayName: 'Patched User',
          alarmNotifications: {
            enabled: true,
            minLevel: 'alarm',
            quietHours: { enabled: true, start: '21:00', end: '06:00' },
          },
        },
      },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.user.profile.displayName, 'Patched User');
    assert.equal(patch.json.user.profile.alarmNotifications.minLevel, 'alarm');
    assert.equal(patch.json.user.profile.alarmNotifications.quietHours.enabled, true);
    assert.equal(patch.json.user.profile.alarmNotifications.quietHours.start, '21:00');
  });

  it('admin can list and create tenant users with profiles', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Team Co',
        tenantSlug: 'teamco',
        email: 'admin@team.test',
        password: 'password123',
      },
    });
    const token = signup.json.token;

    const created = await request('POST', '/api/users', {
      token,
      body: {
        email: 'viewer@team.test',
        password: 'password123',
        role: 'viewer',
        profile: { displayName: 'Viewer', alarmNotifications: { minLevel: 'none' } },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.user.profile.displayName, 'Viewer');
    assert.equal(created.json.user.profile.alarmNotifications.minLevel, 'none');

    const list = await request('GET', '/api/users', { token });
    assert.equal(list.status, 200);
    assert.equal(list.json.users.length, 2);
  });

  it('invite requires SMTP on server', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Invite Co',
        tenantSlug: 'inviteco',
        email: 'admin@invite.test',
        password: 'password123',
      },
    });
    const token = signup.json.token;
    const prev = process.env.SMTP_HOST;
    delete process.env.SMTP_HOST;

    const invite = await request('POST', '/api/users/invite', {
      token,
      body: { email: 'newuser@invite.test', role: 'operator' },
    });
    assert.equal(invite.status, 503);

    if (prev) process.env.SMTP_HOST = prev;
  });

  it('invited user can accept invite and sign in', async () => {
    const { hashPassword } = require('../src/auth/password');
    const authService = require('../src/services/authService');
    const { getDb } = require('../src/db/mongo');
    const { randomUUID, randomBytes } = require('crypto');

    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Accept Co',
        tenantSlug: 'acceptco',
        email: 'admin@accept.test',
        password: 'password123',
      },
    });
    const tenantId = signup.json.tenant.id;
    const userId = randomUUID();
    const email = 'invited@accept.test';
    const db = getDb();
    await db.collection('users').insertOne({
      _id: userId,
      tenantId,
      email,
      passwordHash: await hashPassword('placeholder-not-used'),
      role: 'viewer',
      invitePending: true,
      active: true,
      profile: { displayName: 'Invited', alarmNotifications: { enabled: true, email: true, minLevel: 'inner' } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const token = randomBytes(32).toString('hex');
    await db.collection('password_reset_tokens').insertOne({
      _id: token,
      tenantId,
      userId,
      email,
      purpose: 'invite',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    const accept = await authService.resetPasswordWithToken({
      token,
      password: 'newpassword123',
      purpose: 'invite',
    });
    assert.equal(accept.ok, true);

    const login = await authService.login({
      tenantSlug: 'acceptco',
      email,
      password: 'newpassword123',
    });
    assert.equal(login.ok, true);
    assert.equal(login.user.invitePending, false);
  });

  it('GET /accept-invite renders set-password page for valid token', async () => {
    const { hashPassword } = require('../src/auth/password');
    const { getDb } = require('../src/db/mongo');
    const { randomUUID, randomBytes } = require('crypto');

    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Invite Web Co',
        tenantSlug: 'inviteweb',
        email: 'admin@inviteweb.test',
        password: 'password123',
      },
    });
    const tenantId = signup.json.tenant.id;
    const userId = randomUUID();
    const email = 'webinvite@inviteweb.test';
    const token = randomBytes(32).toString('hex');
    const db = getDb();
    await db.collection('users').insertOne({
      _id: userId,
      tenantId,
      email,
      passwordHash: await hashPassword('placeholder-not-used'),
      role: 'viewer',
      invitePending: true,
      active: true,
      profile: { displayName: 'Web Invited', alarmNotifications: { enabled: true, email: true, minLevel: 'inner' } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.collection('password_reset_tokens').insertOne({
      _id: token,
      tenantId,
      userId,
      email,
      purpose: 'invite',
      expiresAt: new Date(Date.now() + 3600000),
      createdAt: new Date(),
    });

    const page = await request('GET', `/accept-invite?token=${token}`);
    assert.equal(page.status, 200);
    assert.match(page.text, /Accept invite/i);
    assert.match(page.text, /webinvite@inviteweb\.test/);
    assert.match(page.text, /Choose a password/i);
  });

  it('new tenants have CMMS disabled by default', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'No Cmms Co',
        tenantSlug: 'nocmms',
        email: 'admin@nocmms.test',
        password: 'password123',
      },
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.json.tenant.cmms.enabled, false);
    assert.equal(signup.json.tenant.cmmsEnabled, false);

    const tenant = await request('GET', '/api/tenant', { token: signup.json.token });
    assert.equal(tenant.status, 200);
    assert.equal(tenant.json.tenant.cmms.enabled, false);
    assert.equal(tenant.json.tenant.cmmsEnabled, false);

    const me = await request('GET', '/api/auth/me', { token: signup.json.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.tenant.cmmsEnabled, false);
  });

  it('platform admin enables CMMS for a tenant', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Cmms Co',
        tenantSlug: 'cmmsco',
        email: 'admin@cmms.test',
        password: 'password123',
      },
    });
    const tenantId = signup.json.tenant.id;
    const token = signup.json.token;

    const blocked = await request('GET', '/api/cmms/status', { token });
    assert.equal(blocked.status, 403);

    const patch = await request('PATCH', `/api/admin/tenants/${tenantId}/cmms`, {
      platformAdminKey: 'test-platform-admin-key',
      body: { cmms: { enabled: true, plan: 'enterprise' } },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.tenant.cmms.enabled, true);
    assert.equal(patch.json.tenant.cmms.plan, 'enterprise');
    assert.equal(patch.json.tenant.cmmsEnabled, true);
    assert.ok(patch.json.tenant.cmms.enabledAt);

    const status = await request('GET', '/api/cmms/status', { token });
    assert.equal(status.status, 200);
    assert.equal(status.json.cmms.enabled, true);

    const workOrders = await request('GET', '/api/cmms/work-orders', { token });
    assert.equal(workOrders.status, 200);
    assert.deepEqual(workOrders.json.workOrders, []);
  });

  it('signup with CMMS requires platform admin key', async () => {
    const denied = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Bad Cmms',
        tenantSlug: 'badcmms',
        email: 'admin@badcmms.test',
        password: 'password123',
        cmmsEnabled: true,
      },
    });
    assert.equal(denied.status, 403);

    const allowed = await request('POST', '/api/auth/signup', {
      platformAdminKey: 'test-platform-admin-key',
      body: {
        tenantName: 'Boot Cmms',
        tenantSlug: 'bootcmms',
        email: 'admin@bootcmms.test',
        password: 'password123',
        cmms: { enabled: true, plan: 'standard' },
      },
    });
    assert.equal(allowed.status, 201);
    assert.equal(allowed.json.tenant.cmms.enabled, true);
    assert.equal(allowed.json.tenant.cmms.plan, 'standard');
  });

  it('platform admin API lists and creates tenants', async () => {
    const listRes = await request('GET', '/api/admin/tenants', {
      platformAdminKey: 'test-platform-admin-key',
    });
    assert.equal(listRes.status, 200);
    assert.ok(Array.isArray(listRes.json.tenants));

    const created = await request('POST', '/api/admin/tenants', {
      platformAdminKey: 'test-platform-admin-key',
      body: {
        tenantName: 'Platform Co',
        tenantSlug: 'platformco',
        email: 'admin@platformco.test',
        password: 'password123',
        cmms: { enabled: true, plan: 'standard' },
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.json.tenant.slug, 'platformco');
    assert.equal(created.json.tenant.cmmsEnabled, true);

    const detail = await request('GET', `/api/admin/tenants/${created.json.tenant.id}`, {
      platformAdminKey: 'test-platform-admin-key',
    });
    assert.equal(detail.status, 200);
    assert.equal(detail.json.userCount, 1);
    assert.equal(detail.json.users.length, 1);
  });

  it('platform admin web login and tenants page', async () => {
    const loginPage = await request('GET', '/admin/login');
    assert.equal(loginPage.status, 200);
    assert.match(loginPage.text, /Platform admin/i);

    const badLogin = await request('POST', '/admin/login', {
      form: { platformAdminKey: 'wrong-key' },
    });
    assert.equal(badLogin.status, 200);
    assert.match(badLogin.text, /Invalid platform admin key/i);

    const goodLogin = await request('POST', '/admin/login', {
      form: { platformAdminKey: 'test-platform-admin-key' },
    });
    assert.equal(goodLogin.status, 302);
    assert.match(goodLogin.headers.location, /\/admin\/tenants$/);
    const adminCookie = goodLogin.headers['set-cookie']?.find((c) => c.startsWith('mv_platform_admin='));
    assert.ok(adminCookie);

    const tenantsPage = await request('GET', '/admin/tenants', {
      cookies: adminCookie.split(';')[0],
    });
    assert.equal(tenantsPage.status, 200);
    assert.match(tenantsPage.text, /Tenants/);
  });

  it('platform admin web saves CMMS and PeakLogic plan', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Plan Save Co',
        tenantSlug: 'plansave',
        email: 'admin@plansave.test',
        password: 'password123',
      },
    });
    const tenantId = signup.json.tenant.id;

    const goodLogin = await request('POST', '/admin/login', {
      form: { platformAdminKey: 'test-platform-admin-key' },
    });
    const adminCookie = goodLogin.headers['set-cookie']?.find((c) => c.startsWith('mv_platform_admin='));
    assert.ok(adminCookie);

    const save = await request('POST', `/admin/tenants/${tenantId}/cmms`, {
      cookies: adminCookie.split(';')[0],
      form: {
        peaklogicPlan: 'professional',
        enabled: 'true',
        cmmsPlan: 'enterprise',
      },
    });
    assert.equal(save.status, 302);
    assert.match(save.headers.location, new RegExp(`/admin/tenants/${tenantId}\\?settings=updated`));

    const detail = await request('GET', save.headers.location, {
      cookies: adminCookie.split(';')[0],
    });
    assert.equal(detail.status, 200);
    assert.match(detail.text, /professional/);
    assert.match(detail.text, /enterprise/);
    assert.match(detail.text, /Tenant settings saved/);

    const apiTenant = await request('GET', `/api/admin/tenants/${tenantId}`, {
      platformAdminKey: 'test-platform-admin-key',
    });
    assert.equal(apiTenant.json.tenant.plan, 'professional');
    assert.equal(apiTenant.json.tenant.cmms.plan, 'enterprise');
    assert.equal(apiTenant.json.tenant.cmmsEnabled, true);
  });

  it('platform admin API patches PeakLogic tier and CMMS plan', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Tier Co',
        tenantSlug: 'tierco',
        email: 'admin@tierco.test',
        password: 'password123',
      },
    });
    const tenantId = signup.json.tenant.id;

    const patch = await request('PATCH', `/api/admin/tenants/${tenantId}/cmms`, {
      platformAdminKey: 'test-platform-admin-key',
      body: {
        plan: 'professional',
        cmms: { enabled: true, plan: 'enterprise' },
      },
    });
    assert.equal(patch.status, 200);
    assert.equal(patch.json.tenant.plan, 'professional');
    assert.equal(patch.json.tenant.cmms.plan, 'enterprise');
    assert.equal(patch.json.tenant.cmmsEnabled, true);
  });

  it('CMMS web gated by tenant entitlement', async () => {
    const noCmms = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'No Cmms Web',
        tenantSlug: 'nocmmsweb',
        email: 'admin@nocmmsweb.test',
        password: 'password123',
      },
    });
    const loginNoCmms = await request('POST', '/login', {
      form: {
        tenantSlug: 'nocmmsweb',
        email: 'admin@nocmmsweb.test',
        password: 'password123',
      },
    });
    const cookieNoCmms = loginNoCmms.headers['set-cookie']?.find((c) => c.startsWith('mv_token='));
    const blocked = await request('GET', '/cmms/dashboard', {
      cookies: cookieNoCmms.split(';')[0],
    });
    assert.equal(blocked.status, 302);
    assert.match(blocked.headers.location, /cmms=disabled/);

    const home = await request('GET', '/?cmms=disabled', { cookies: cookieNoCmms.split(';')[0] });
    assert.equal(home.status, 200);
    assert.match(home.text, /CMMS is not enabled/);
    assert.doesNotMatch(home.text, /data-bs-toggle="dropdown">CMMS<\/a>/);

    const signup = await request('POST', '/api/auth/signup', {
      platformAdminKey: 'test-platform-admin-key',
      body: {
        tenantName: 'Cmms Web Co',
        tenantSlug: 'cmmsweb',
        email: 'admin@cmmsweb.test',
        password: 'password123',
        cmms: { enabled: true, plan: 'standard' },
      },
    });
    const loginCmms = await request('POST', '/login', {
      form: {
        tenantSlug: 'cmmsweb',
        email: 'admin@cmmsweb.test',
        password: 'password123',
      },
    });
    const cookieCmms = loginCmms.headers['set-cookie']?.find((c) => c.startsWith('mv_token='));
    const dash = await request('GET', '/cmms/dashboard', { cookies: cookieCmms.split(';')[0] });
    assert.equal(dash.status, 200);
    assert.match(dash.text, /CMMS Dashboard/);
    assert.match(dash.text, /Work Orders/);

    const homeEntitled = await request('GET', '/', { cookies: cookieCmms.split(';')[0] });
    assert.match(homeEntitled.text, /data-bs-toggle="dropdown">CMMS<\/a>/);
  });

  it('pairs appliance as remote gateway for tenant site', async () => {
    const signup = await request('POST', '/api/auth/signup', {
      body: {
        tenantName: 'Remote Edge Co',
        tenantSlug: 'remedge',
        email: 'admin@remedge.test',
        password: 'password123',
      },
    });
    const token = signup.json.token;

    const loc = await request('POST', '/api/locations', {
      token,
      body: { name: 'Plant B', slug: 'plant-b' },
    });
    const sys = await request('POST', `/api/locations/${loc.json.location.id}/systems`, {
      token,
      body: { name: 'Line 2', slug: 'line-2' },
    });

    const pair = await request('POST', '/api/appliance/pair', {
      body: {
        pairingKey: 'test-platform-admin-key',
        tenantSlug: 'remedge',
        locationSlug: 'plant-b',
        systemSlug: 'line-2',
        applianceName: 'Plant B Edge',
      },
    });
    assert.equal(pair.status, 201);
    assert.equal(pair.json.cloudRemote.enabled, true);
    assert.equal(pair.json.cloudRemote.tenantSlug, 'remedge');
    assert.equal(pair.json.gatewayDevice.driverType, 'mqtt_parc');
    assert.equal(pair.json.cloudRemote.relayParc, true);
  });
});
