'use strict';

/**
 * Idempotent dev/demo seed for peaklogic-cloud.
 * Ensures dev .env defaults, then seeds demo tenants and hierarchy.
 * Safe to re-run — skips existing records by slug.
 */

const { loadEnv, ensureDevEnvDefaults, ENV_PATH, PROJECT_ROOT } = require('../src/loadEnv');

loadEnv();
const envPatch = ensureDevEnvDefaults();
if (envPatch.written.length) {
  loadEnv({ override: true });
  console.log(`[seed] Wrote dev defaults to ${ENV_PATH}:`);
  for (const line of envPatch.written) console.log(`  ${line}`);
}

const envMeta = { envExists: require('fs').existsSync(ENV_PATH) };

const { connectMongo, closeMongo, getDb } = require('../src/db/mongo');
const { ensureIndexes } = require('../src/db/indexes');
const {
  MONGODB_URI,
  MONGODB_DB,
  JWT_SECRET,
  PLATFORM_ADMIN_KEY,
  PORT,
} = require('../src/config');
const authService = require('../src/services/authService');
const tenantService = require('../src/services/tenantService');
const locationService = require('../src/services/locationService');
const systemService = require('../src/services/systemService');
const deviceService = require('../src/services/deviceService');
const { isCmmsEnabled } = require('../src/tenants/cmmsEntitlement');

const SEED_DEMO = {
  tenantSlug: 'demo',
  tenantName: 'Demo Organization',
  adminEmail: 'admin@demo.test',
  adminPassword: 'admin123',
  cmms: { enabled: true, plan: 'standard' },
  location: { slug: 'plant-a', name: 'Plant A', description: 'Demo plant location' },
  system: { slug: 'line-1', name: 'Line 1', scanMs: 100 },
  device: {
    slug: 'opta-st-01',
    name: 'Opta ST 01',
    driverType: 'mqtt_parc',
    driverConfig: { deviceId: 'opta_st_01' },
    templateId: 'arduino_opta_parc',
  },
};

/** Second tenant — CMMS off so platform superuser can demo enable flow. */
const SEED_ACME = {
  tenantSlug: 'acme',
  tenantName: 'Acme Corp',
  adminEmail: 'admin@acme.test',
  adminPassword: 'admin123',
  cmms: { enabled: false, plan: 'none' },
};

function validateEnv() {
  const mongoFromShell = process.env.MONGODB_URI || process.env.MONGO_URL;
  if (!MONGODB_URI && !mongoFromShell) {
    const lines = [
      'MONGODB_URI (or MONGO_URL) is not set.',
      `  Project root: ${PROJECT_ROOT}`,
      `  .env path:    ${ENV_PATH}`,
      envMeta.envExists
        ? '  .env exists but MONGODB_URI / MONGO_URL is empty — add one of those variables.'
        : '  .env not found — copy the template:  cp .env.example .env',
      '  Or export MONGODB_URI in your shell before npm run seed.',
    ];
    throw new Error(lines.join('\n'));
  }
  if (!envMeta.envExists && mongoFromShell) {
    console.warn(`[seed] Using MONGODB_URI/MONGO_URL from shell (no .env at ${ENV_PATH}).`);
  } else if (envMeta.envExists) {
    console.log(`[seed] Loaded env from ${ENV_PATH}`);
  }
  if (!JWT_SECRET || JWT_SECRET.includes('dev-local-only')) {
    console.warn('[seed] Using dev JWT_SECRET — OK for local seed only.');
  }
}

async function ensureTenant(seed, { platformAdmin = false } = {}) {
  const db = getDb();
  const existing = await db.collection('tenants').findOne({ slug: seed.tenantSlug });
  if (existing) {
    let tenant = authService.publicTenant(existing);
    const wantCmms = isCmmsEnabled(seed.cmms);
    const hasCmms = isCmmsEnabled(existing.cmms);
    if (wantCmms && !hasCmms) {
      const patch = await tenantService.updateTenantCmms(tenant.id, seed.cmms, { enabledBy: 'seed' });
      if (!patch.ok) throw new Error(`cmms: ${patch.error}`);
      tenant = patch.tenant;
    }
    return { tenant, created: false };
  }

  const signupOpts = platformAdmin
    ? { platformAdmin: true, enabledBy: 'seed' }
    : {};
  const signup = await authService.signup(
    {
      tenantName: seed.tenantName,
      tenantSlug: seed.tenantSlug,
      email: seed.adminEmail,
      password: seed.adminPassword,
      ...(isCmmsEnabled(seed.cmms) ? { cmms: seed.cmms } : {}),
    },
    signupOpts,
  );
  if (!signup.ok) throw new Error(signup.error || 'signup failed');
  return { tenant: signup.tenant, created: true };
}

async function ensureLocation(tenantId, seed) {
  const db = getDb();
  const existing = await db.collection('locations').findOne({ tenantId, slug: seed.location.slug });
  if (existing) {
    return { location: locationService.publicLocation(existing), created: false };
  }
  const result = await locationService.createLocation(tenantId, seed.location);
  if (!result.ok) throw new Error(`location: ${result.error}`);
  return { location: result.location, created: true };
}

async function ensureSystem(tenantId, locationId, seed) {
  const db = getDb();
  const existing = await db.collection('systems').findOne({
    tenantId,
    locationId,
    slug: seed.system.slug,
  });
  if (existing) {
    return { system: systemService.publicSystem(existing), created: false };
  }
  const result = await systemService.createSystem(tenantId, locationId, seed.system);
  if (!result.ok) throw new Error(`system: ${result.error}`);
  return { system: result.system, created: true };
}

async function ensureDevice(tenantId, systemId, seed) {
  const db = getDb();
  const existing = await db.collection('devices').findOne({
    tenantId,
    systemId,
    slug: seed.device.slug,
  });
  if (existing) {
    return { device: deviceService.publicDevice(existing), created: false };
  }
  const result = await deviceService.createDevice(tenantId, systemId, seed.device);
  if (!result.ok) throw new Error(`device: ${result.error}`);
  return { device: result.device, created: true };
}

function printSummary({
  demo,
  acme,
  flags,
  platformAdminKey,
}) {
  const base = `http://localhost:${PORT}`;
  console.log('\n=== PeakLogic Cloud seed complete ===\n');
  console.log('Product:      PeakLogic (Purple Standard) — CMMS is a module inside the shell');
  console.log(`Database:     ${MONGODB_DB}`);
  console.log('\n--- Demo tenant (CMMS enabled) ---');
  console.log(`  Tenant slug:  ${demo.tenant.slug} (${demo.tenant.name})`);
  console.log(`  Tenant id:    ${demo.tenant.id}`);
  console.log(`  CMMS:         ${demo.tenant.cmmsEnabled ? `enabled (${demo.tenant.cmms.plan})` : 'disabled'}`);
  console.log(`  Location:     ${demo.location.slug} → System: ${demo.system.slug} → Device: ${demo.device.slug}`);
  console.log('\n--- Acme tenant (CMMS disabled — demo enable flow) ---');
  console.log(`  Tenant slug:  ${acme.tenant.slug} (${acme.tenant.name})`);
  console.log(`  CMMS:         ${acme.tenant.cmmsEnabled ? 'enabled' : 'disabled'}`);
  console.log('\nCreated this run:');
  console.log(`  demo tenant:   ${flags.demoTenant ? 'yes' : 'skipped (exists)'}`);
  console.log(`  demo location: ${flags.demoLocation ? 'yes' : 'skipped (exists)'}`);
  console.log(`  demo system:   ${flags.demoSystem ? 'yes' : 'skipped (exists)'}`);
  console.log(`  demo device:   ${flags.demoDevice ? 'yes' : 'skipped (exists)'}`);
  console.log(`  acme tenant:   ${flags.acmeTenant ? 'yes' : 'skipped (exists)'}`);
  console.log('\n--- Sign in ---\n');
  console.log(`Tenant login:       ${base}/login`);
  console.log(`  demo (CMMS on):   slug demo · ${SEED_DEMO.adminEmail} · ${SEED_DEMO.adminPassword}`);
  console.log(`  acme (CMMS off):  slug acme · ${SEED_ACME.adminEmail} · ${SEED_ACME.adminPassword}`);
  console.log('\nPlatform superuser:  ' + `${base}/admin/login`);
  console.log(`  key:              ${platformAdminKey}`);
  console.log('\nRestart npm start if it was already running so it picks up .env changes.');
  console.log('');
}

async function main() {
  validateEnv();
  console.log('[seed] Connecting to MongoDB…');
  await connectMongo();
  await ensureIndexes();

  const { tenant: demoTenant, created: demoTenantCreated } = await ensureTenant(SEED_DEMO, { platformAdmin: true });
  const { location, created: demoLocationCreated } = await ensureLocation(demoTenant.id, SEED_DEMO);
  const { system, created: demoSystemCreated } = await ensureSystem(demoTenant.id, location.id, SEED_DEMO);
  const { device, created: demoDeviceCreated } = await ensureDevice(demoTenant.id, system.id, SEED_DEMO);

  const { tenant: acmeTenant, created: acmeTenantCreated } = await ensureTenant(SEED_ACME);

  printSummary({
    demo: { tenant: demoTenant, location, system, device },
    acme: { tenant: acmeTenant },
    flags: {
      demoTenant: demoTenantCreated,
      demoLocation: demoLocationCreated,
      demoSystem: demoSystemCreated,
      demoDevice: demoDeviceCreated,
      acmeTenant: acmeTenantCreated,
    },
    platformAdminKey: PLATFORM_ADMIN_KEY,
  });
}

if (require.main === module) {
  main()
    .catch((err) => {
      console.error('[seed] Failed:', err.message);
      process.exit(1);
    })
    .finally(async () => {
      try {
        await closeMongo();
      } catch {
        /* ignore */
      }
    });
}

module.exports = { main, SEED_DEMO, SEED_ACME, SEED: SEED_DEMO };
