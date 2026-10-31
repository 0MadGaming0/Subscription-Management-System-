const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Please provide a valid email address'],
      index: true,
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      select: false, // Never return password in queries by default
    },
    role: {
      type: String,
      enum: {
        values: ['admin', 'staff', 'customer'],
        message: '{VALUE} is not a valid role',
      },
      default: 'customer',
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    resetPasswordToken: {
      type: String,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.__v;
        return ret;
      },
    },
    toObject: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.resetPasswordToken;
        delete ret.resetPasswordExpires;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// High-performance sparse index for password reset token lookups (M3)
userSchema.index({ resetPasswordToken: 1 }, { sparse: true });

/**
 * Pre-save middleware to hash passwords automatically when modified.
 * Work factor: 12 salt rounds for production-grade security.
 */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Compare entered password with hashed password in database.
 * @param {string} candidatePassword
 * @returns {Promise<boolean>}
 */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

/**
 * Generate cryptographically secure password reset token.
 * Token expires in 15 minutes.
 * Returns the unhashed token (to be sent via email), while saving the SHA-256 hash in DB.
 * @returns {string} unhashed token
 */
userSchema.methods.createPasswordResetToken = function () {
  // Generate random 32-byte hex token (64 characters)
  const resetToken = crypto.randomBytes(32).toString('hex');

  // Hash token using SHA-256 and set to resetPasswordToken field
  this.resetPasswordToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token expires after 15 minutes (15 * 60 * 1000 ms)
  this.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

  return resetToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;

