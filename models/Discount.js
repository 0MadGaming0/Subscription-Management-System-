const mongoose = require('mongoose');

const discountSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: [true, 'Discount code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      minlength: [2, 'Discount code must be at least 2 characters'],
      maxlength: [30, 'Discount code cannot exceed 30 characters'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Discount name is required'],
      trim: true,
      maxlength: [100, 'Discount name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      required: [true, 'Discount type is required'],
      enum: {
        values: ['fixed', 'percentage'],
        message: '{VALUE} is not a valid discount type. Allowed: fixed, percentage',
      },
    },
    value: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0, 'Discount value cannot be negative'],
      validate: {
        validator: function (val) {
          if (this.type === 'percentage') {
            return val >= 0 && val <= 100;
          }
          return val >= 0;
        },
        message: 'Percentage discount must be between 0 and 100',
      },
    },
    appliesTo: {
      type: String,
      enum: ['subscription', 'product'],
      default: 'subscription',
      index: true,
    },
    applicableProducts: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    minPurchaseAmount: {
      type: Number,
      default: 0,
      min: [0, 'Minimum purchase amount cannot be negative'],
    },
    minQuantity: {
      type: Number,
      default: 0,
      min: [0, 'Minimum quantity cannot be negative'],
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
      default: Date.now,
    },
    endDate: {
      type: Date,
      default: null,
      validate: {
        validator: function (val) {
          if (!val || !this.startDate) return true;
          return new Date(val) >= new Date(this.startDate);
        },
        message: 'End date cannot be earlier than start date',
      },
    },
    maxUsageCount: {
      type: Number,
      default: null,
      validate: {
        validator: function (val) {
          if (val === null || val === undefined) return true;
          return Number.isInteger(val) && val >= 1;
        },
        message: 'Maximum usage count must be an integer >= 1 or null for unlimited',
      },
    },
    currentUsageCount: {
      type: Number,
      default: 0,
      min: 0,
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

const Discount = mongoose.model('Discount', discountSchema);

module.exports = Discount;

