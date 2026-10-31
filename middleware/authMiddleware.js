const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Protect middleware: Ensures incoming request is authenticated with a valid JWT token.
 * Validates token expiration, signature, and user active status.
 */
const protect = async (req, res, next) => {
  let token;

  // Read Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access denied. No authorization token provided.',
    });
  }

  try {
    const secret = process.env.JWT_SECRET || (process.env.NODE_ENV !== 'production' ? 'brightloop_dev_temporary_jwt_secret_key_32_chars' : null);
    if (!secret) {
      return res.status(500).json({
        success: false,
        message: 'Authentication service configuration error: JWT_SECRET missing.',
      });
    }

    const decoded = jwt.verify(token, secret);

    // Verify user still exists in database
    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      return res.status(401).json({
        success: false,
        message: 'The user belonging to this token no longer exists.',
      });
    }

    // Verify account is active
    if (!currentUser.isActive) {
      return res.status(403).json({
        success: false,
        message: 'This account has been deactivated. Please contact Brightloop support.',
      });
    }

    // Attach user to request object
    req.user = currentUser;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Authorization token has expired. Please log in again.',
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid authorization token.',
    });
  }
};

module.exports = {
  protect,
};

