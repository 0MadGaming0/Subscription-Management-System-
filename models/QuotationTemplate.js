const mongoose = require('mongoose');

/**
 * Line item sub-schema for Quotation Templates
 */
const templateLineItemSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product reference is required for each line item'],
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
    defaultQuantity: {
      type: Number,
      required: [true, 'Default quantity is required'],
      min: [1, 'Default quantity must be at least 1'],
      default: 1,
      validate: {
        validator: Number.isInteger,
        message: 'Default quantity must be an integer',
      },
    },
    unitPrice: {
      type: Number,
      required: [true, 'Unit price is required'],
      min: [0, 'Unit price must be non-negative'],
    },
    taxPercentage: {
      type: Number,
      default: 0,
      min: [0, 'Tax percentage cannot be negative'],
      max: [100, 'Tax percentage cannot exceed 100%'],
    },
  },
  { _id: true }
);

/**
 * Quotation Template Schema
 * Represents pre-configured proposal blueprints to streamline sales quotes.
 */
const quotationTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      minlength: [2, 'Template name must be at least 2 characters long'],
      maxlength: [150, 'Template name cannot exceed 150 characters'],
      unique: true,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    validityDays: {
      type: Number,
      required: [true, 'Validity days is required'],
      min: [1, 'Validity days must be at least 1 day'],
      default: 30,
    },
    plan: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: [true, 'Plan reference is required'],
      index: true,
    },
    productLineItems: {
      type: [templateLineItemSchema],
      required: [true, 'Product line items are required'],
      validate: [
        (items) => Array.isArray(items) && items.length > 0,
        'A quotation template must include at least one product line item',
      ],
    },
    paymentTerms: {
      type: String,
      trim: true,
      default: 'Net 30',
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

const QuotationTemplate = mongoose.model('QuotationTemplate', quotationTemplateSchema);

module.exports = QuotationTemplate;

