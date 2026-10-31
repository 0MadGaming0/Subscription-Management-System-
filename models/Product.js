const mongoose = require('mongoose');

/**
 * Variant Sub-Schema
 * Represents variants offered for a product (e.g. brand, tier) with optional additional pricing.
 */
const variantSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Variant name is required'],
      trim: true,
    },
    additionalPrice: {
      type: Number,
      required: [true, 'Variant additional price is required'],
      min: [0, 'Variant additional price cannot be negative'],
      default: 0,
    },
  },
  { _id: true }
);

/**
 * Product Schema
 * Represents sellable items, services or software subscriptions in Brightloop.
 */
const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      minlength: [2, 'Product name must be at least 2 characters long'],
      maxlength: [150, 'Product name cannot exceed 150 characters'],
      index: true,
    },
    type: {
      type: String,
      required: [true, 'Product type is required'],
      trim: true,
      lowercase: true,
      index: true,
    },
    salesPrice: {
      type: Number,
      required: [true, 'Sales price is required'],
      min: [0, 'Sales price must be a non-negative number'],
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: [0, 'Cost price must be a non-negative number'],
    },
    notes: {
      type: String,
      trim: true,
      default: '',
    },
    variants: {
      type: [variantSchema],
      default: [],
      validate: [
        function (variants) {
          if (!variants || variants.length === 0) return true;
          const names = variants.map((v) => (v.name ? v.name.trim().toLowerCase() : ''));
          const uniqueNames = new Set(names);
          return uniqueNames.size === names.length;
        },
        'Duplicate variant names within a product are not allowed',
      ],
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

const Product = mongoose.model('Product', productSchema);

module.exports = Product;

