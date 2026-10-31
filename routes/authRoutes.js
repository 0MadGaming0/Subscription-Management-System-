const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  register,
  login,
  getMe,
  createStaff,
  forgotPassword,
  resetPassword,
  updateMe,
  changePassword,
} = require('../controllers/authController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

/**
 * Rate Limiter for Login Endpoint (Brute-force protection)
 * Default: 5 attempts per 15 minutes per IP
 */
const loginLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.LOGIN_RATE_LIMIT_MAX) || 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many login attempts from this IP. Please try again after 15 minutes.',
  },
});

/**
 * Rate Limiter for sensitive auth operations (Registration, Password Reset)
 * Default: 15 attempts per 15 minutes per IP
 */
const sensitiveOpLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests for this operation. Please try again later.',
  },
});

// --- Public Authentication Routes ---
router.post('/register', sensitiveOpLimiter, register);
router.post('/login', loginLimiter, login);
router.post('/forgot-password', sensitiveOpLimiter, forgotPassword);
router.post('/reset-password/:token', sensitiveOpLimiter, resetPassword);

// --- Authenticated Profile Route ---
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.put('/me/password', protect, changePassword);

// --- Admin-Only Management Route ---
router.post('/staff', protect, authorize('admin'), createStaff);

module.exports = router;

