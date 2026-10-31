const mongoose = require('mongoose');

const SUBSCRIPTION_STATUSES = ['Draft', 'Quotation', 'Confirmed', 'Active', 'Paused', 'Closed'];

/**
 * Subscription Line Item Sub-schema
 */
const subscriptionLineItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required'],
    },
    variant: {
      name: { type: String, trim: true, default: '' },
      additionalPrice: { type: Number, default: 0, min: 0 },
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: [1, 'Quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Quantity must be an integer',
      },
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price cannot be negative'],
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: [0, 'Tax percentage cannot be negative'],
      max: [100, 'Tax percentage cannot exceed 100%'],
    },
    lineTotal: {
      type: Number,
      required: [true, 'Line total is required'],
      min: [0, 'Line total cannot be negative'],
    },
  },
  { _id: true }
);

/**
 * Status History Audit Sub-schema
 */
const statusHistorySchema = new mongoose.Schema(
  {
    fromStatus: { type: String, enum: SUBSCRIPTION_STATUSES },
    toStatus: { type: String, enum: SUBSCRIPTION_STATUSES, required: true },
    changedAt: { type: Date, default: Date.now },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    note: { type: String, default: '' },
  },
  { _id: false }
);

/**
 * Subscription Schema
 * Primary contractual and billing entity for Brightloop Software customers.
 */
const subscriptionSchema = new mongoose.Schema(
  {
    subscriptionNumber: {
      type: String,
      required: [true, 'Subscription number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: [true, 'Plan reference is required'],
      index: true,
    },
    quotationTemplate: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuotationTemplate',
      default: null,
      index: true,
    },
    startDate: {
      type: Date,
      required: [true, 'Start date is required'],
    },
    expiryDate: {
      type: Date,
      default: null,
    },
    paymentTerms: {
      type: String,
      trim: true,
      default: 'Net 30',
    },
    lineItems: {
      type: [subscriptionLineItemSchema],
      required: [true, 'Subscription must have at least one line item'],
      validate: [
        (items) => Array.isArray(items) && items.length > 0,
        'Subscription must have at least one line item',
      ],
    },
    subtotal: {
      type: Number,
      required: [true, 'Subtotal is required'],
      min: [0, 'Subtotal cannot be negative'],
    },
    taxAmount: {
      type: Number,
      required: [true, 'Tax amount is required'],
      min: [0, 'Tax amount cannot be negative'],
      default: 0,
    },
    discountAmount: {
      type: Number,
      default: 0,
      min: [0, 'Discount amount cannot be negative'],
    },
    totalAmount: {
      type: Number,
      required: [true, 'Total amount is required'],
      min: [0, 'Total amount cannot be negative'],
    },
    status: {
      type: String,
      required: [true, 'Subscription status is required'],
      enum: {
        values: SUBSCRIPTION_STATUSES,
        message: '{VALUE} is not a valid subscription status',
      },
      default: 'Draft',
      index: true,
    },
    statusHistory: {
      type: [statusHistorySchema],
      default: [],
    },
    pausedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    closureReason: {
      type: String,
      default: '',
    },
  },
  {
    timestamps: true,
  }
);

// High-performance compound indexes for subscription metrics and lifecycle filters
subscriptionSchema.index({ status: 1, createdAt: -1 });
subscriptionSchema.index({ customer: 1, status: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });

const Subscription = mongoose.model('Subscription', subscriptionSchema);

module.exports = {
  Subscription,
  SUBSCRIPTION_STATUSES,
};

