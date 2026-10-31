#!/usr/bin/env node

/**
 * Admin Bootstrap CLI Script
 * Securely seeds or provisions the initial Administrator account for Brightloop Software.
 *
 * Usage:
 *   Interactive:
 *     npm run create-admin
 *   Non-interactive (via env or flags):
 *     node scripts/createAdmin.js --name "Admin User" --email "admin@brightloop.com" --password "AdminPass123!"
 */

const path = require('path');
const readline = require('readline');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables via loadEnv helper (checks backend/.env and root .env)
require('../config/loadEnv');

const connectDB = require('../config/db');
const User = require('../models/User');
const { validatePassword, validateEmail } = require('../utils/passwordValidator');

/**
 * Parses command-line arguments in format --key value or --key=value
 */
const parseArgs = () => {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const parts = arg.substring(2).split('=');
      const key = parts[0];
      if (parts.length > 1) {
        parsed[key] = parts[1];
      } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        parsed[key] = args[++i];
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
};

/**
 * Prompt question in terminal using readline
 */
const askQuestion = (rl, question, isPassword = false) => {
  return new Promise((resolve) => {
    if (!isPassword) {
      rl.question(question, (answer) => resolve(answer.trim()));
      return;
    }

    // Mask password in terminal
    process.stdout.write(question);
    const stdin = process.stdin;
    const oldRaw = stdin.isRaw;
    let password = '';

    const onData = (char) => {
      char = char.toString('utf8');
      switch (char) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdout.write('\n');
          cleanup();
          resolve(password.trim());
          break;
        case '\u0003': // Ctrl+C
          cleanup();
          process.exit(1);
          break;
        case '\u0008':
        case '\x7f': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          break;
        default:
          password += char;
          process.stdout.write('*');
          break;
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      if (stdin.setRawMode) stdin.setRawMode(oldRaw || false);
    };

    if (stdin.setRawMode) {
      stdin.setRawMode(true);
      stdin.resume();
      stdin.on('data', onData);
    } else {
      // Fallback for non-TTY environments
      rl.question('', (answer) => resolve(answer.trim()));
    }
  });
};

const run = async () => {
  console.log('\n======================================================');
  console.log('   Brightloop Software - Initial Admin Provisioning   ');
  console.log('======================================================\n');

  const args = parseArgs();
  let name = args.name || process.env.ADMIN_NAME;
  let email = args.email || process.env.ADMIN_EMAIL;
  let password = args.password || process.env.ADMIN_PASSWORD;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    // 1. Gather missing inputs interactively if not passed
    if (!name) {
      name = await askQuestion(rl, 'Enter Admin Full Name: ');
    }
    if (!email) {
      email = await askQuestion(rl, 'Enter Admin Email Address: ');
    }
    if (!password) {
      password = await askQuestion(rl, 'Enter Admin Password: ', true);
    }

    rl.close();

    // 2. Validate inputs
    if (!name || name.length < 2) {
      console.error('\n[Error] Admin name must be at least 2 characters long.');
      process.exit(1);
    }

    if (!validateEmail(email)) {
      console.error('\n[Error] Please provide a valid email address.');
      process.exit(1);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      console.error('\n[Error] Password does not meet Brightloop security requirements:');
      passwordValidation.errors.forEach((err) => console.error(`  - ${err}`));
      process.exit(1);
    }

    // 3. Connect to Database
    console.log('\nConnecting to database...');
    await connectDB();

    const normalizedEmail = email.toLowerCase().trim();

    // 4. Check for existing account
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      if (existingUser.role === 'admin') {
        console.log(`\n[Info] An administrator account with email '${normalizedEmail}' already exists.`);
        process.exit(0);
      } else {
        console.error(`\n[Error] An account with email '${normalizedEmail}' already exists with role '${existingUser.role}'.`);
        console.error('To protect against privilege escalation, existing accounts cannot be promoted via this script.');
        process.exit(1);
      }
    }

    // 5. Create Admin Account
    const adminUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'admin',
      isActive: true,
    });

    console.log('\n======================================================');
    console.log(' [SUCCESS] Admin account created successfully!');
    console.log(` ID:    ${adminUser._id}`);
    console.log(` Name:  ${adminUser.name}`);
    console.log(` Email: ${adminUser.email}`);
    console.log(` Role:  ${adminUser.role}`);
    console.log('======================================================\n');
  } catch (error) {
    console.error('\n[Fatal Error] Failed to create admin user:', error.message);
    process.exit(1);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
      console.log('Database connection closed.');
    }
  }
};

run();

