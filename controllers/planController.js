const mongoose = require('mongoose');
const Plan = require('../models/Plan');
const Product = require('../models/Product');

const ALLOWED_BILLING_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * @desc    Create a new plan
 * @route   POST /api/plans
 * @access  Private (Admin only)
 */
const createPlan = async (req, res, next) => {
  try {
    const {
      name,
      product,
      price,
      billingFrequency,
      minimumQuantity,
      startDate,
      endDate,
      autoClose,
      allowEarlyClose,
      allowPause,
      allowRenewal,
      isActive,
    } = req.body;

    // 1. Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Plan name is required.',
      });
    }

    if (!product || !mongoose.Types.ObjectId.isValid(product)) {
      return res.status(400).json({
        success: false,
        message: 'A valid product ObjectId is required.',
      });
    }

    // 2. Validate referenced product existence and active status
    const productRecord = await Product.findById(product);
    if (!productRecord) {
      return res.status(404).json({
        success: false,
        message: `Referenced product with ID '${product}' does not exist.`,
      });
    }

    if (!productRecord.isActive) {
      return res.status(400).json({
        success: false,
        message: `Cannot link plan to inactive product '${productRecord.name}'. Please activate the product first.`,
      });
    }

    // 3. Validate price
    if (price === undefined || price === null || isNaN(Number(price)) || Number(price) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Plan price must be a valid non-negative number.',
      });
    }

    // 4. Validate billing frequency
    if (!billingFrequency || !ALLOWED_BILLING_FREQUENCIES.includes(String(billingFrequency).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: `Invalid billing frequency '${billingFrequency}'. Allowed values: ${ALLOWED_BILLING_FREQUENCIES.join(', ')}.`,
      });
    }

    // 5. Validate minimum quantity
    const minQty = minimumQuantity !== undefined ? Number(minimumQuantity) : 1;
    if (isNaN(minQty) || !Number.isInteger(minQty) || minQty < 1) {
      return res.status(400).json({
        success: false,
        message: 'Minimum quantity must be an integer greater than or equal to 1.',
      });
    }

    // 6. Validate dates
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({
        success: false,
        message: 'A valid start date is required.',
      });
    }

    const parsedStartDate = new Date(startDate);
    let parsedEndDate = null;

    if (endDate) {
      if (isNaN(new Date(endDate).getTime())) {
        return res.status(400).json({
          success: false,
          message: 'End date format is invalid.',
        });
      }
      parsedEndDate = new Date(endDate);
      if (parsedEndDate < parsedStartDate) {
        return res.status(400).json({
          success: false,
          message: 'End date cannot be earlier than start date.',
        });
      }
    }

    // 7. Create Plan
    const newPlan = await Plan.create({
      name: name.trim(),
      product,
      price: Number(price),
      billingFrequency: String(billingFrequency).toLowerCase(),
      minimumQuantity: minQty,
      startDate: parsedStartDate,
      endDate: parsedEndDate,
      autoClose: Boolean(autoClose),
      allowEarlyClose: Boolean(allowEarlyClose),
      allowPause: Boolean(allowPause),
      allowRenewal: Boolean(allowRenewal),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const populatedPlan = await Plan.findById(newPlan._id).populate('product', 'name type salesPrice variants isActive');

    return res.status(201).json({
      success: true,
      message: 'Plan created successfully.',
      plan: populatedPlan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all plans (with filters and populated product details)
 * @route   GET /api/plans
 * @access  Private (Admin & Staff)
 */
const getPlans = async (req, res, next) => {
  try {
    const { billingFrequency, isActive, product } = req.query;
    const filter = {};

    if (billingFrequency) {
      filter.billingFrequency = String(billingFrequency).toLowerCase();
    }

    if (isActive !== undefined) {
      filter.isActive = String(isActive).toLowerCase() === 'true';
    }

    if (product) {
      if (!mongoose.Types.ObjectId.isValid(product)) {
        return res.status(400).json({
          success: false,
          message: `Invalid product filter ID: '${product}'.`,
        });
      }
      filter.product = product;
    }

    const plans = await Plan.find(filter)
      .populate('product', 'name type salesPrice variants isActive')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: plans.length,
      plans,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single plan by ID
 * @route   GET /api/plans/:id
 * @access  Private (Admin & Staff)
 */
const getPlanById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan ID format: '${id}'.`,
      });
    }

    const plan = await Plan.findById(id).populate('product', 'name type salesPrice variants isActive');

    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    return res.status(200).json({
      success: true,
      plan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing plan
 * @route   PUT /api/plans/:id
 * @access  Private (Admin only)
 */
const updatePlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan ID format: '${id}'.`,
      });
    }

    const existingPlan = await Plan.findById(id);
    if (!existingPlan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    const {
      name,
      product,
      price,
      billingFrequency,
      minimumQuantity,
      startDate,
      endDate,
      autoClose,
      allowEarlyClose,
      allowPause,
      allowRenewal,
      isActive,
    } = req.body;

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Plan name cannot be empty.' });
      }
      updateData.name = name.trim();
    }

    if (product !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(product)) {
        return res.status(400).json({ success: false, message: 'Invalid product ObjectId.' });
      }
      const productRecord = await Product.findById(product);
      if (!productRecord) {
        return res.status(404).json({ success: false, message: `Product '${product}' not found.` });
      }
      if (!productRecord.isActive) {
        return res.status(400).json({ success: false, message: `Product '${productRecord.name}' is inactive.` });
      }
      updateData.product = product;
    }

    if (price !== undefined) {
      const p = Number(price);
      if (isNaN(p) || p < 0) {
        return res.status(400).json({ success: false, message: 'Price must be a non-negative number.' });
      }
      updateData.price = p;
    }

    if (billingFrequency !== undefined) {
      const bf = String(billingFrequency).toLowerCase();
      if (!ALLOWED_BILLING_FREQUENCIES.includes(bf)) {
        return res.status(400).json({
          success: false,
          message: `Invalid billing frequency '${billingFrequency}'. Allowed: ${ALLOWED_BILLING_FREQUENCIES.join(', ')}.`,
        });
      }
      updateData.billingFrequency = bf;
    }

    if (minimumQuantity !== undefined) {
      const q = Number(minimumQuantity);
      if (isNaN(q) || !Number.isInteger(q) || q < 1) {
        return res.status(400).json({ success: false, message: 'Minimum quantity must be an integer >= 1.' });
      }
      updateData.minimumQuantity = q;
    }

    // Date validations
    const effectiveStart = startDate !== undefined ? new Date(startDate) : existingPlan.startDate;
    if (startDate !== undefined && isNaN(effectiveStart.getTime())) {
      return res.status(400).json({ success: false, message: 'Invalid start date format.' });
    }
    if (startDate !== undefined) updateData.startDate = effectiveStart;

    if (endDate !== undefined) {
      if (endDate === null) {
        updateData.endDate = null;
      } else {
        const effectiveEnd = new Date(endDate);
        if (isNaN(effectiveEnd.getTime())) {
          return res.status(400).json({ success: false, message: 'Invalid end date format.' });
        }
        if (effectiveEnd < effectiveStart) {
          return res.status(400).json({ success: false, message: 'End date cannot be earlier than start date.' });
        }
        updateData.endDate = effectiveEnd;
      }
    }

    if (autoClose !== undefined) updateData.autoClose = Boolean(autoClose);
    if (allowEarlyClose !== undefined) updateData.allowEarlyClose = Boolean(allowEarlyClose);
    if (allowPause !== undefined) updateData.allowPause = Boolean(allowPause);
    if (allowRenewal !== undefined) updateData.allowRenewal = Boolean(allowRenewal);
    if (isActive !== undefined) updateData.isActive = Boolean(isActive);

    const updatedPlan = await Plan.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).populate('product', 'name type salesPrice variants isActive');

    return res.status(200).json({
      success: true,
      message: 'Plan updated successfully.',
      plan: updatedPlan,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a plan (safe deletion check)
 * @route   DELETE /api/plans/:id
 * @access  Private (Admin only)
 */
const deletePlan = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid plan ID format: '${id}'.`,
      });
    }

    const plan = await Plan.findById(id);
    if (!plan) {
      return res.status(404).json({
        success: false,
        message: 'Plan not found.',
      });
    }

    // Safety check: Prevent deletion if actively referenced by subscriptions
    if (mongoose.models.Subscription) {
      const activeSubsCount = await mongoose.models.Subscription.countDocuments({ plan: id });
      if (activeSubsCount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot delete plan. It is actively referenced by ${activeSubsCount} subscription(s).`,
        });
      }
    }

    await Plan.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Plan deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createPlan,
  getPlans,
  getPlanById,
  updatePlan,
  deletePlan,
};

