const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { validatePassword, validateEmail } = require('../utils/passwordValidator');
const { sendPasswordResetEmail } = require('../services/emailService');

/**
 * Generate JWT token signed with user ID, role and email
 * @param {Object} user
 * @returns {string} JWT Token
 */
const generateToken = (user) => {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET is not configured in environment variables');
    }
    console.warn('[Security Warning] JWT_SECRET is not set in .env. Using temporary fallback for development.');
    return jwt.sign(
      { id: user._id, role: user.role, email: user.email },
      'brightloop_dev_temporary_jwt_secret_key_32_chars',
      { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
    );
  }

  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      email: user.email,
    },
    secret,
    {
      expiresIn: process.env.JWT_EXPIRES_IN || '24h',
    }
  );
};

/**
 * Helper to construct safe user response object
 * @param {Object} user
 * @returns {Object} Safe user object
 */
const sanitizeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

/**
 * @desc    Register a new customer account (Public registration)
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required and must be a valid string.',
      });
    }

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    // 2. Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements.',
        errors: passwordValidation.errors,
      });
    }

    // 3. Normalize email and check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists. Please log in.',
      });
    }

    // 4. Create user with strictly customer role (Prevents mass-assignment / privilege escalation)
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'customer', // Public registration ALWAYS creates a customer
      isActive: true,
    });

    // 5. Issue JWT token
    const token = generateToken(user);

    return res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Authenticate user & issue token
 * @route   POST /api/auth/login
 * @access  Public
 */
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // 1. Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide both email and password.',
      });
    }

    const normalizedEmail = String(email).toLowerCase().trim();

    // 2. Find user by email, explicitly including password field
    const user = await User.findOne({ email: normalizedEmail }).select('+password');

    // 3. Generic rejection for incorrect credentials (prevents account enumeration)
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.',
      });
    }

    // 4. Reject inactive accounts
    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact Brightloop support.',
      });
    }

    // 5. Issue JWT token
    const token = generateToken(user);

    return res.status(200).json({
      success: true,
      message: 'Login successful.',
      token,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get currently authenticated user's profile
 * @route   GET /api/auth/me
 * @access  Private (Authenticated users)
 */
const getMe = async (req, res, next) => {
  try {
    // req.user is populated by protect middleware
    return res.status(200).json({
      success: true,
      user: sanitizeUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Create staff account (Admin only)
 * @route   POST /api/auth/staff
 * @access  Private (Admin only)
 */
const createStaff = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;

    // 1. Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Name is required and must be a valid string.',
      });
    }

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    // 2. Validate password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements.',
        errors: passwordValidation.errors,
      });
    }

    // 3. Normalize email and check if user already exists
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'An account with this email address already exists.',
      });
    }

    // 4. Create user with staff role
    const staffUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      password,
      role: 'staff',
      isActive: true,
    });

    return res.status(201).json({
      success: true,
      message: 'Staff account created successfully.',
      user: sanitizeUser(staffUser),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Request password reset token (Sends email)
 * @route   POST /api/auth/forgot-password
 * @access  Public
 */
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email || !validateEmail(email)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid email address.',
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    // Generic response message to prevent email enumeration attacks
    const genericSuccessResponse = {
      success: true,
      message: 'If an account with that email exists, a password reset link has been sent.',
    };

    // If user does not exist, return generic message without error
    if (!user) {
      return res.status(200).json(genericSuccessResponse);
    }

    // Generate reset token and set expiry
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    // Send reset email via service
    try {
      const origin = `${req.protocol}://${req.get('host')}`;
      await sendPasswordResetEmail({
        to: user.email,
        name: user.name,
        resetToken,
        origin,
      });

      return res.status(200).json(genericSuccessResponse);
    } catch (emailError) {
      // If email fails, roll back reset token in DB
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false });

      console.error('[Auth Error] Failed to send password reset email:', emailError.message);
      return res.status(500).json({
        success: false,
        message: 'There was an error dispatching the password reset email. Please try again later.',
      });
    }
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Reset password using single-use token
 * @route   POST /api/auth/reset-password/:token
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Password reset token is required.',
      });
    }

    // 1. Validate new password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
      return res.status(400).json({
        success: false,
        message: 'Password does not meet security requirements.',
        errors: passwordValidation.errors,
      });
    }

    // 2. Hash incoming token using SHA-256 to compare with stored token
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // 3. Find user with matching active token that has not expired
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or expired password reset token.',
      });
    }

    // 4. Update password and invalidate reset token (single-use)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return res.status(200).json({
      success: true,
      message: 'Password has been reset successfully. You may now log in with your new credentials.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  register,
  login,
  getMe,
  createStaff,
  forgotPassword,
  resetPassword,
};

