const mongoose = require('mongoose');
const QuotationTemplate = require('../models/QuotationTemplate');
const Plan = require('../models/Plan');
const Product = require('../models/Product');
const { Subscription } = require('../models/Subscription');

/**
 * Validates and normalizes product line items for templates
 * @param {Array} lineItems
 * @returns {Promise<{ isValid: boolean, message?: string, validatedItems?: Array }>}
 */
const validateTemplateLineItems = async (lineItems) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return { isValid: false, message: 'At least one product line item is required.' };
  }

  const validated = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
      return { isValid: false, message: `Line item #${i + 1} has an invalid or missing product ID.` };
    }

    const product = await Product.findById(item.product);
    if (!product) {
      return { isValid: false, message: `Product referenced in line item #${i + 1} ('${item.product}') was not found.` };
    }

    if (!product.isActive) {
      return { isValid: false, message: `Product '${product.name}' in line item #${i + 1} is inactive.` };
    }

    const qty = item.defaultQuantity !== undefined ? Number(item.defaultQuantity) : 1;
    if (isNaN(qty) || !Number.isInteger(qty) || qty < 1) {
      return { isValid: false, message: `Default quantity in line item #${i + 1} must be an integer >= 1.` };
    }

    // Determine unit price: use supplied price or fallback to product salesPrice + variant additionalPrice
    let unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : null;
    let variantData = { name: '', additionalPrice: 0 };

    if (item.variant && item.variant.name) {
      const foundVariant = product.variants.find(
        (v) => v.name.toLowerCase() === item.variant.name.trim().toLowerCase()
      );
      if (foundVariant) {
        variantData = {
          name: foundVariant.name,
          additionalPrice: foundVariant.additionalPrice,
        };
      } else {
        return { isValid: false, message: `Variant '${item.variant.name}' does not exist on product '${product.name}'.` };
      }
    }

    if (unitPrice === null || isNaN(unitPrice)) {
      unitPrice = product.salesPrice + variantData.additionalPrice;
    } else if (unitPrice < 0) {
      return { isValid: false, message: `Unit price in line item #${i + 1} cannot be negative.` };
    }

    const taxPercentage = item.taxPercentage !== undefined ? Number(item.taxPercentage) : 0;
    if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      return { isValid: false, message: `Tax percentage in line item #${i + 1} must be between 0 and 100.` };
    }

    validated.push({
      product: product._id,
      variant: variantData,
      description: item.description ? String(item.description).trim() : product.name,
      defaultQuantity: qty,
      unitPrice,
      taxPercentage,
    });
  }

  return { isValid: true, validatedItems: validated };
};

/**
 * @desc    Create a new Quotation Template
 * @route   POST /api/quotation-templates
 * @access  Private (Admin only)
 */
const createQuotationTemplate = async (req, res, next) => {
  try {
    const {
      name,
      description,
      validityDays,
      plan,
      productLineItems,
      paymentTerms,
      isActive,
    } = req.body;

    // 1. Basic field validation
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Template name is required.' });
    }

    if (!plan || !mongoose.Types.ObjectId.isValid(plan)) {
      return res.status(400).json({ success: false, message: 'A valid plan ID is required.' });
    }

    // 2. Validate plan
    const planRecord = await Plan.findById(plan);
    if (!planRecord) {
      return res.status(404).json({ success: false, message: `Referenced plan '${plan}' does not exist.` });
    }
    if (!planRecord.isActive) {
      return res.status(400).json({ success: false, message: `Plan '${planRecord.name}' is inactive.` });
    }

    // 3. Validate validityDays
    const days = validityDays !== undefined ? Number(validityDays) : 30;
    if (isNaN(days) || days < 1) {
      return res.status(400).json({ success: false, message: 'Validity days must be at least 1 day.' });
    }

    // 4. Validate line items
    const lineItemCheck = await validateTemplateLineItems(productLineItems);
    if (!lineItemCheck.isValid) {
      return res.status(400).json({ success: false, message: lineItemCheck.message });
    }

    // 5. Create Template
    const template = await QuotationTemplate.create({
      name: name.trim(),
      description: description ? String(description).trim() : '',
      validityDays: days,
      plan,
      productLineItems: lineItemCheck.validatedItems,
      paymentTerms: paymentTerms ? String(paymentTerms).trim() : 'Net 30',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    const populatedTemplate = await QuotationTemplate.findById(template._id)
      .populate('plan', 'name price billingFrequency minimumQuantity isActive')
      .populate('productLineItems.product', 'name type salesPrice variants isActive');

    return res.status(201).json({
      success: true,
      message: 'Quotation template created successfully.',
      template: populatedTemplate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all Quotation Templates
 * @route   GET /api/quotation-templates
 * @access  Private (Admin & Staff)
 */
const getQuotationTemplates = async (req, res, next) => {
  try {
    const { isActive, plan, search } = req.query;
    const filter = {};

    if (isActive !== undefined) {
      filter.isActive = String(isActive).toLowerCase() === 'true';
    }

    if (plan) {
      if (!mongoose.Types.ObjectId.isValid(plan)) {
        return res.status(400).json({ success: false, message: 'Invalid plan ID filter.' });
      }
      filter.plan = plan;
    }

    if (search) {
      filter.name = { $regex: String(search).trim(), $options: 'i' };
    }

    const templates = await QuotationTemplate.find(filter)
      .populate('plan', 'name price billingFrequency minimumQuantity isActive')
      .populate('productLineItems.product', 'name type salesPrice variants isActive')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: templates.length,
      templates,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single Quotation Template by ID
 * @route   GET /api/quotation-templates/:id
 * @access  Private (Admin & Staff)
 */
const getQuotationTemplateById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid template ID format: '${id}'.` });
    }

    const template = await QuotationTemplate.findById(id)
      .populate('plan', 'name price billingFrequency minimumQuantity isActive')
      .populate('productLineItems.product', 'name type salesPrice variants isActive');

    if (!template) {
      return res.status(404).json({ success: false, message: 'Quotation template not found.' });
    }

    return res.status(200).json({
      success: true,
      template,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a Quotation Template
 * @route   PUT /api/quotation-templates/:id
 * @access  Private (Admin only)
 */
const updateQuotationTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid template ID format: '${id}'.` });
    }

    const existingTemplate = await QuotationTemplate.findById(id);
    if (!existingTemplate) {
      return res.status(404).json({ success: false, message: 'Quotation template not found.' });
    }

    const {
      name,
      description,
      validityDays,
      plan,
      productLineItems,
      paymentTerms,
      isActive,
    } = req.body;

    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Template name cannot be empty.' });
      }
      updateData.name = name.trim();
    }

    if (description !== undefined) {
      updateData.description = String(description).trim();
    }

    if (validityDays !== undefined) {
      const days = Number(validityDays);
      if (isNaN(days) || days < 1) {
        return res.status(400).json({ success: false, message: 'Validity days must be at least 1 day.' });
      }
      updateData.validityDays = days;
    }

    if (plan !== undefined) {
      if (!mongoose.Types.ObjectId.isValid(plan)) {
        return res.status(400).json({ success: false, message: 'Invalid plan ID.' });
      }
      const planRecord = await Plan.findById(plan);
      if (!planRecord) {
        return res.status(404).json({ success: false, message: `Plan '${plan}' not found.` });
      }
      if (!planRecord.isActive) {
        return res.status(400).json({ success: false, message: `Plan '${planRecord.name}' is inactive.` });
      }
      updateData.plan = plan;
    }

    if (productLineItems !== undefined) {
      const check = await validateTemplateLineItems(productLineItems);
      if (!check.isValid) {
        return res.status(400).json({ success: false, message: check.message });
      }
      updateData.productLineItems = check.validatedItems;
    }

    if (paymentTerms !== undefined) {
      updateData.paymentTerms = String(paymentTerms).trim();
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const updatedTemplate = await QuotationTemplate.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    })
      .populate('plan', 'name price billingFrequency minimumQuantity isActive')
      .populate('productLineItems.product', 'name type salesPrice variants isActive');

    return res.status(200).json({
      success: true,
      message: 'Quotation template updated successfully.',
      template: updatedTemplate,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a Quotation Template (safe check)
 * @route   DELETE /api/quotation-templates/:id
 * @access  Private (Admin only)
 */
const deleteQuotationTemplate = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid template ID format: '${id}'.` });
    }

    const template = await QuotationTemplate.findById(id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Quotation template not found.' });
    }

    // Safety check: verify no subscriptions reference this template
    const refCount = await Subscription.countDocuments({ quotationTemplate: id });
    if (refCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete template. It is referenced by ${refCount} subscription(s). Consider deactivating it instead.`,
      });
    }

    await QuotationTemplate.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Quotation template deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createQuotationTemplate,
  getQuotationTemplates,
  getQuotationTemplateById,
  updateQuotationTemplate,
  deleteQuotationTemplate,
};

