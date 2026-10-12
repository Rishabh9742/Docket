// Loads and validates environment variables once, at startup.
const isProduction = process.env.NODE_ENV === 'production';

const missing = ['DATABASE_URL', 'JWT_SECRET'].filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in the values.');
  process.exit(1);
}

if (process.env.JWT_SECRET.length < 32) {
  const msg = 'JWT_SECRET should be at least 32 characters long.';
  if (isProduction) {
    console.error(msg);
    process.exit(1);
  }
  console.warn(`Warning: ${msg}`);
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  isProduction,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d'
};
