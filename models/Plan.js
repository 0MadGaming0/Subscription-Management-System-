const mongoose = require('mongoose');

const BILLING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * Plan Schema
 * Represents a billing recurrence specification attached to a Product.
 */
const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      minlength: [2, 'Plan name must be at least 2 characters long'],
      maxlength: [150, 'Plan name cannot exceed 150 characters'],
      index: true,
    },
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Referenced product ID is required'],
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: [0, 'Plan price must be a non-negative number'],
    },
    billingFrequency: {
      type: String,
      required: [true, 'Billing frequency is required'],
      enum: {
        values: BILLING_FREQUENCIES,
        message: '{VALUE} is not a valid billing frequency. Allowed values: daily, weekly, monthly, yearly',
      },
      lowercase: true,
      index: true,
    },
    minimumQuantity: {
      type: Number,
      required: [true, 'Minimum quantity is required'],
      min: [1, 'Minimum quantity must be at least 1'],
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Minimum quantity must be an integer',
      },
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    endDate: {
      type: Date,
      default: null,
      validate: {
        validator: function (value) {
          if (!value || !this.startDate) return true;
          return new Date(value) >= new Date(this.startDate);
        },
        message: 'End date cannot be earlier than start date',
      },
    },
    autoClose: {
      type: Boolean,
      default: false,
    },
    allowEarlyClose: {
      type: Boolean,
      default: false,
    },
    allowPause: {
      type: Boolean,
      default: false,
    },
    allowRenewal: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

const Plan = mongoose.model('Plan', planSchema);

module.exports = Plan;

