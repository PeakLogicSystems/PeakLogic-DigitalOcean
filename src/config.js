'use strict';

require('dotenv').config();

const PORT = Number(process.env.PORT) || 3100;
const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URL || '';
const MONGODB_DB = process.env.MONGODB_DB || 'peaklogic_cloud';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const PUBLIC_API_URL = process.env.PUBLIC_API_URL || '';
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || '';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || PUBLIC_APP_URL || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const LIMITS = {
  locationsPerTenant: Number(process.env.MAX_LOCATIONS_PER_TENANT) || 1000,
  systemsPerLocation: Number(process.env.MAX_SYSTEMS_PER_LOCATION) || 1000,
  devicesPerSystem: Number(process.env.MAX_DEVICES_PER_SYSTEM) || 1000,
};

module.exports = {
  PORT,
  MONGODB_URI,
  MONGODB_DB,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  PUBLIC_API_URL,
  PUBLIC_APP_URL,
  CORS_ORIGINS,
  LIMITS,
  NODE_ENV: process.env.NODE_ENV || 'development',
};
