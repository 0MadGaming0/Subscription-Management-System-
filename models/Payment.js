const mongoose = require('mongoose');

const PAYMENT_METHODS = [
  'credit_card',
  'bank_transfer',
  'cash',
  'stripe',
  'paypal',
  'check',
  'other',
];

const paymentSchema = new mongoose.Schema(
  {
    paymentNumber: {
      type: String,
      required: [true, 'Payment number is required'],
      unique: true,
      trim: true,
      index: true,
    },
    invoice: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: [true, 'Invoice reference is required'],
      index: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    amount: {
      type: Number,
      required: [true, 'Payment amount is required'],
      min: [0.01, 'Payment amount must be at least 0.01'],
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: PAYMENT_METHODS,
        message: '{VALUE} is not a valid payment method. Allowed: ' + PAYMENT_METHODS.join(', '),
      },
      index: true,
    },
    paymentDate: {
      type: Date,
      required: [true, 'Payment date is required'],
      default: Date.now,
      index: true,
    },
    note: {
      type: String,
      trim: true,
      default: '',
    },
    transactionReference: {
      type: String,
      trim: true,
      default: '',
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User who recorded payment is required'],
    },
  },
  {
    timestamps: true,
  }
);

// High-performance compound indexes for payment analytics and timelines
paymentSchema.index({ paymentDate: -1, paymentMethod: 1 });
paymentSchema.index({ customer: 1, paymentDate: -1 });
paymentSchema.index({ invoice: 1, paymentDate: -1 });

const Payment = mongoose.model('Payment', paymentSchema);

module.exports = {
  Payment,
  PAYMENT_METHODS,
};

