const mongoose = require('mongoose');
const Discount = require('../models/Discount');
const Product = require('../models/Product');
const { evaluateDiscount } = require('../services/billingService');

/**
 * @desc    Create a new discount rule
 * @route   POST /api/discounts
 * @access  Private (Admin only)
 */
const createDiscount = async (req, res, next) => {
  try {
    const {
      code,
      name,
      description,
      type,
      value,
      appliesTo = 'subscription',
      applicableProducts = [],
      minPurchaseAmount = 0,
      minQuantity = 0,
      startDate,
      endDate,
      maxUsageCount,
      isActive,
    } = req.body;

    // 1. Validate required fields
    if (!code || typeof code !== 'string' || !code.trim()) {
      return res.status(400).json({ success: false, message: 'Discount code is required.' });
    }

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Discount name is required.' });
    }

    if (!['fixed', 'percentage'].includes(type)) {
      return res.status(400).json({ success: false, message: 'Type must be either "fixed" or "percentage".' });
    }

    const val = Number(value);
    if (isNaN(val) || val < 0) {
      return res.status(400).json({ success: false, message: 'Discount value must be a non-negative number.' });
    }

    if (type === 'percentage' && val > 100) {
      return res.status(400).json({ success: false, message: 'Percentage discount cannot exceed 100%.' });
    }

    // 2. Normalize and check uniqueness
    const normalizedCode = code.trim().toUpperCase();
    const existing = await Discount.findOne({ code: normalizedCode });
    if (existing) {
      return res.status(409).json({ success: false, message: `Discount code '${normalizedCode}' already exists.` });
    }

    // 3. Validate applicable products if appliesTo is 'product'
    const validatedProducts = [];
    if (appliesTo === 'product') {
      if (!Array.isArray(applicableProducts) || applicableProducts.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Product-specific discount must specify at least one applicable product.',
        });
      }
      for (const pId of applicableProducts) {
        if (!mongoose.Types.ObjectId.isValid(pId)) {
          return res.status(400).json({ success: false, message: `Invalid product ID '${pId}'.` });
        }
        const prod = await Product.findById(pId);
        if (!prod) {
          return res.status(404).json({ success: false, message: `Product '${pId}' not found.` });
        }
        validatedProducts.push(prod._id);
      }
    }

    // 4. Validate dates
    const parsedStart = startDate ? new Date(startDate) : new Date();
    let parsedEnd = null;
    if (endDate) {
      parsedEnd = new Date(endDate);
      if (parsedEnd < parsedStart) {
        return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
      }
    }

    const discount = await Discount.create({
      code: normalizedCode,
      name: name.trim(),
      description: description ? String(description).trim() : '',
      type,
      value: val,
      appliesTo,
      applicableProducts: validatedProducts,
      minPurchaseAmount: Math.max(0, Number(minPurchaseAmount) || 0),
      minQuantity: Math.max(0, Number(minQuantity) || 0),
      startDate: parsedStart,
      endDate: parsedEnd,
      maxUsageCount: maxUsageCount !== undefined && maxUsageCount !== null ? Number(maxUsageCount) : null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: 'Discount created successfully.',
      discount,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all discounts
 * @route   GET /api/discounts
 * @access  Private (Admin & Staff)
 */
const getDiscounts = async (req, res, next) => {
  try {
    const { isActive, type, appliesTo } = req.query;
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = String(isActive).toLowerCase() === 'true';
    }
    if (type) filter.type = type;
    if (appliesTo) filter.appliesTo = appliesTo;

    const discounts = await Discount.find(filter)
      .populate('applicableProducts', 'name salesPrice')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: discounts.length,
      discounts,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get discount by ID
 * @route   GET /api/discounts/:id
 * @access  Private (Admin & Staff)
 */
const getDiscountById = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid discount ID format.' });
    }

    const discount = await Discount.findById(id).populate('applicableProducts', 'name salesPrice');
    if (!discount) {
      return res.status(404).json({ success: false, message: 'Discount not found.' });
    }

    return res.status(200).json({ success: true, discount });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a discount
 * @route   PUT /api/discounts/:id
 * @access  Private (Admin only)
 */
const updateDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid discount ID format.' });
    }

    const existing = await Discount.findById(id);
    if (!existing) {
      return res.status(404).json({ success: false, message: 'Discount not found.' });
    }

    const {
      name,
      description,
      type,
      value,
      appliesTo,
      applicableProducts,
      minPurchaseAmount,
      minQuantity,
      startDate,
      endDate,
      maxUsageCount,
      isActive,
    } = req.body;

    const updateData = {};

    if (name) updateData.name = name.trim();
    if (description !== undefined) updateData.description = String(description).trim();
    if (type) {
      if (!['fixed', 'percentage'].includes(type)) {
        return res.status(400).json({ success: false, message: 'Type must be fixed or percentage.' });
      }
      updateData.type = type;
    }
    if (value !== undefined) {
      const v = Number(value);
      if (isNaN(v) || v < 0) return res.status(400).json({ success: false, message: 'Value must be non-negative.' });
      if ((type || existing.type) === 'percentage' && v > 100) {
        return res.status(400).json({ success: false, message: 'Percentage cannot exceed 100%.' });
      }
      updateData.value = v;
    }
    if (appliesTo) updateData.appliesTo = appliesTo;
    if (applicableProducts) updateData.applicableProducts = applicableProducts;
    if (minPurchaseAmount !== undefined) updateData.minPurchaseAmount = Math.max(0, Number(minPurchaseAmount) || 0);
    if (minQuantity !== undefined) updateData.minQuantity = Math.max(0, Number(minQuantity) || 0);
    if (startDate) updateData.startDate = new Date(startDate);
    if (endDate !== undefined) updateData.endDate = endDate ? new Date(endDate) : null;
    if (maxUsageCount !== undefined) updateData.maxUsageCount = maxUsageCount ? Number(maxUsageCount) : null;
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updated = await Discount.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('applicableProducts', 'name salesPrice');

    return res.status(200).json({
      success: true,
      message: 'Discount updated successfully.',
      discount: updated,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete / deactivate a discount
 * @route   DELETE /api/discounts/:id
 * @access  Private (Admin only)
 */
const deleteDiscount = async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid discount ID format.' });
    }

    const discount = await Discount.findById(id);
    if (!discount) {
      return res.status(404).json({ success: false, message: 'Discount not found.' });
    }

    await Discount.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Discount deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Validate a discount code and return calculated discount
 * @route   POST /api/discounts/validate
 * @access  Private (Admin & Staff)
 */
const validateDiscount = async (req, res, next) => {
  try {
    const { code, subtotal, totalQuantity, lineItems } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, message: 'Discount code is required.' });
    }

    const result = await evaluateDiscount(code, {
      subtotal: Number(subtotal) || 0,
      totalQuantity: Number(totalQuantity) || 1,
      lineItems: lineItems || [],
    });

    if (!result.isValid) {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    return res.status(200).json({
      success: true,
      valid: true,
      discountAmount: result.amount,
      discount: {
        code: result.discount.code,
        name: result.discount.name,
        type: result.discount.type,
        value: result.discount.value,
        appliesTo: result.discount.appliesTo,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createDiscount,
  getDiscounts,
  getDiscountById,
  updateDiscount,
  deleteDiscount,
  validateDiscount,
};

