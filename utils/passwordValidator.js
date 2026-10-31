/**
 * Password Validator Utility
 * Specification requirements:
 * 1. Must contain MORE than 8 characters (> 8, i.e., at least 9 characters).
 * 2. Require at least one uppercase letter.
 * 3. Require at least one lowercase letter.
 * 4. Require at least one special character.
 */

// Regex for special characters: punctuation/symbols commonly used in passwords
const SPECIAL_CHAR_REGEX = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/;
const UPPERCASE_REGEX = /[A-Z]/;
const LOWERCASE_REGEX = /[a-z]/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validates candidate password against Brightloop security rules.
 * @param {string} password
 * @returns {{ isValid: boolean, errors: string[] }}
 */
const validatePassword = (password) => {
  const errors = [];

  if (!password || typeof password !== 'string') {
    return {
      isValid: false,
      errors: ['Password is required and must be a string.'],
    };
  }

  // Must contain MORE than 8 characters (i.e., minimum 9 characters)
  if (password.length <= 8) {
    errors.push('Password must be MORE than 8 characters in length (minimum 9 characters).');
  }

  if (!UPPERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }

  if (!LOWERCASE_REGEX.test(password)) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }

  if (!SPECIAL_CHAR_REGEX.test(password)) {
    errors.push('Password must contain at least one special character (e.g. !@#$%^&*).');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
};

/**
 * Validates email format.
 * @param {string} email
 * @returns {boolean}
 */
const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  return EMAIL_REGEX.test(email.trim().toLowerCase());
};

module.exports = {
  validatePassword,
  validateEmail,
  SPECIAL_CHAR_REGEX,
};

