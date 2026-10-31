const { loadedPath } = require('./loadEnv');

/**
 * Validates and logs environment variable configuration status
 * Ensures all required environment variables are loaded correctly
 * without exposing sensitive credentials.
 */
const validateEnv = (isVerbose = false) => {
  const status = {
    isValid: true,
    loadedFrom: loadedPath || 'No .env file found; using process.env',
    configured: [],
    missingRequired: [],
    warnings: [],
  };

  // 1. Mandatory Core Variables
  if (!process.env.MONGO_URI) {
    status.isValid = false;
    status.missingRequired.push('MONGO_URI');
  } else {
    status.configured.push('MONGO_URI');
  }

  if (!process.env.JWT_SECRET) {
    // If running in development without JWT_SECRET, flag a warning or error
    if (process.env.NODE_ENV === 'production') {
      status.isValid = false;
      status.missingRequired.push('JWT_SECRET');
    } else {
      status.warnings.push('JWT_SECRET is missing. A fallback secret is temporarily used for development. Set JWT_SECRET in .env.');
    }
  } else {
    status.configured.push('JWT_SECRET');
  }

  // 2. Variables with Defaults
  status.configured.push(`PORT (${process.env.PORT || 5000})`);
  status.configured.push(`NODE_ENV (${process.env.NODE_ENV || 'development'})`);
  status.configured.push(`JWT_EXPIRES_IN (${process.env.JWT_EXPIRES_IN || '24h'})`);
  status.configured.push(`CLIENT_URL (${process.env.CLIENT_URL || 'http://localhost:3000'})`);

  // 3. SMTP Variables
  const hasSmtp = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER);
  if (hasSmtp) {
    status.configured.push(`SMTP (${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587})`);
    status.configured.push(`EMAIL_FROM (${process.env.EMAIL_FROM || 'Brightloop Software <support@brightloop.com>'})`);
  } else {
    status.warnings.push('SMTP configuration incomplete. System will use Ethereal / Console mode for emails.');
  }

  // 4. Rate Limiting Variables
  status.configured.push(`RATE_LIMIT_WINDOW_MS (${process.env.RATE_LIMIT_WINDOW_MS || 900000} ms)`);
  status.configured.push(`RATE_LIMIT_MAX (${process.env.RATE_LIMIT_MAX || 100} req)`);
  status.configured.push(`LOGIN_RATE_LIMIT_MAX (${process.env.LOGIN_RATE_LIMIT_MAX || 5} req)`);
  status.configured.push(`AUTH_RATE_LIMIT_MAX (${process.env.AUTH_RATE_LIMIT_MAX || 15} req)`);

  if (isVerbose) {
    console.log('\n======================================================');
    console.log('       Brightloop Environment Verification Report     ');
    console.log('======================================================');
    console.log(`Config Source:   ${status.loadedFrom}`);
    console.log('\nConfigured Variables:');
    status.configured.forEach((v) => console.log(`  ✓ ${v}`));

    if (status.warnings.length > 0) {
      console.log('\nWarnings / Defaults:');
      status.warnings.forEach((w) => console.log(`  ! ${w}`));
    }

    if (status.missingRequired.length > 0) {
      console.log('\nCRITICAL MISSING:');
      status.missingRequired.forEach((m) => console.log(`  ✗ ${m}`));
    }
    console.log('======================================================\n');
  }

  return status;
};

// If run directly: node backend/config/envValidator.js
if (require.main === module) {
  const result = validateEnv(true);
  process.exit(result.isValid ? 0 : 1);
}

module.exports = {
  validateEnv,
};

