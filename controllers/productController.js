const mongoose = require('mongoose');
const Product = require('../models/Product');
const Plan = require('../models/Plan');
const QuotationTemplate = require('../models/QuotationTemplate');
const { Subscription } = require('../models/Subscription');

/**
 * Validates variant items and checks for duplicate names
 * @param {Array} variants
 * @returns {{ isValid: boolean, message?: string }}
 */
const validateVariants = (variants) => {
  if (!Array.isArray(variants)) {
    return { isValid: false, message: 'Variants must be an array.' };
  }

  const seenNames = new Set();
  for (const v of variants) {
    if (!v || typeof v !== 'object') {
      return { isValid: false, message: 'Each variant must be a valid object.' };
    }
    if (!v.name || typeof v.name !== 'string' || !v.name.trim()) {
      return { isValid: false, message: 'Every variant must have a valid name.' };
    }

    const normalizedName = v.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      return { isValid: false, message: `Duplicate variant name detected: '${v.name}'. Variant names within a product must be unique.` };
    }
    seenNames.add(normalizedName);

    if (v.additionalPrice !== undefined) {
      const price = Number(v.additionalPrice);
      if (isNaN(price) || price < 0) {
        return { isValid: false, message: `Variant '${v.name}' additionalPrice must be a non-negative number.` };
      }
    }
  }

  return { isValid: true };
};

/**
 * @desc    Create a new product
 * @route   POST /api/products
 * @access  Private (Admin only)
 */
const createProduct = async (req, res, next) => {
  try {
    const { name, type, salesPrice, costPrice, notes, variants, isActive } = req.body;

    // 1. Validate required fields
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product name is required.',
      });
    }

    if (!type || typeof type !== 'string' || !type.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Product type is required.',
      });
    }

    if (salesPrice === undefined || salesPrice === null || isNaN(Number(salesPrice)) || Number(salesPrice) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Sales price must be a valid non-negative number.',
      });
    }

    if (costPrice === undefined || costPrice === null || isNaN(Number(costPrice)) || Number(costPrice) < 0) {
      return res.status(400).json({
        success: false,
        message: 'Cost price must be a valid non-negative number.',
      });
    }

    // 2. Validate variants if provided
    if (variants && variants.length > 0) {
      const variantCheck = validateVariants(variants);
      if (!variantCheck.isValid) {
        return res.status(400).json({
          success: false,
          message: variantCheck.message,
        });
      }
    }

    // 3. Create Product
    const product = await Product.create({
      name: name.trim(),
      type: type.trim().toLowerCase(),
      salesPrice: Number(salesPrice),
      costPrice: Number(costPrice),
      notes: notes ? String(notes).trim() : '',
      variants: variants || [],
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    });

    return res.status(201).json({
      success: true,
      message: 'Product created successfully.',
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all products (with optional filters)
 * @route   GET /api/products
 * @access  Private (Admin & Staff)
 */
const getProducts = async (req, res, next) => {
  try {
    const { type, isActive, search } = req.query;
    const filter = {};

    // Filter by type
    if (type) {
      filter.type = String(type).trim().toLowerCase();
    }

    // H1: Customers can ONLY view active products
    if (req.user && req.user.role === 'customer') {
      filter.isActive = true;
    } else if (isActive !== undefined) {
      filter.isActive = String(isActive).toLowerCase() === 'true';
    }

    // Search by product name
    if (search) {
      filter.name = { $regex: String(search).trim(), $options: 'i' };
    }

    // M4: Pagination support
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const skip = (page - 1) * limit;

    const total = await Product.countDocuments(filter);
    const totalPages = Math.ceil(total / limit) || 1;

    const products = await Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json({
      success: true,
      count: products.length,
      total,
      page,
      totalPages,
      limit,
      products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single product by ID
 * @route   GET /api/products/:id
 * @access  Private (Admin & Staff)
 */
const getProductById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product ID format: '${id}'.`,
      });
    }

    const product = await Product.findById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    // H1: Customers cannot access inactive products
    if (req.user && req.user.role === 'customer' && !product.isActive) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    return res.status(200).json({
      success: true,
      product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update an existing product
 * @route   PUT /api/products/:id
 * @access  Private (Admin only)
 */
const updateProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product ID format: '${id}'.`,
      });
    }

    const { name, type, salesPrice, costPrice, notes, variants, isActive } = req.body;
    const updateData = {};

    if (name !== undefined) {
      if (typeof name !== 'string' || !name.trim()) {
        return res.status(400).json({ success: false, message: 'Product name cannot be empty.' });
      }
      updateData.name = name.trim();
    }

    if (type !== undefined) {
      if (typeof type !== 'string' || !type.trim()) {
        return res.status(400).json({ success: false, message: 'Product type cannot be empty.' });
      }
      updateData.type = type.trim().toLowerCase();
    }

    if (salesPrice !== undefined) {
      const price = Number(salesPrice);
      if (isNaN(price) || price < 0) {
        return res.status(400).json({ success: false, message: 'Sales price must be a non-negative number.' });
      }
      updateData.salesPrice = price;
    }

    if (costPrice !== undefined) {
      const cost = Number(costPrice);
      if (isNaN(cost) || cost < 0) {
        return res.status(400).json({ success: false, message: 'Cost price must be a non-negative number.' });
      }
      updateData.costPrice = cost;
    }

    if (notes !== undefined) {
      updateData.notes = String(notes).trim();
    }

    if (variants !== undefined) {
      const variantCheck = validateVariants(variants);
      if (!variantCheck.isValid) {
        return res.status(400).json({ success: false, message: variantCheck.message });
      }
      updateData.variants = variants;
    }

    if (isActive !== undefined) {
      updateData.isActive = Boolean(isActive);
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Product updated successfully.',
      product: updatedProduct,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Delete a product (safe deletion check)
 * @route   DELETE /api/products/:id
 * @access  Private (Admin only)
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: `Invalid product ID format: '${id}'.`,
      });
    }

    // Verify product exists
    const product = await Product.findById(id);
    if (!product) {
      return res.status(404).json({
        success: false,
        message: 'Product not found.',
      });
    }

    // Check if any plan references this product
    const referencingPlansCount = await Plan.countDocuments({ product: id });
    if (referencingPlansCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete product. It is referenced by ${referencingPlansCount} plan(s). Consider deactivating it instead by setting isActive to false.`,
      });
    }

    // Check if any template references this product
    const referencingTemplatesCount = await QuotationTemplate.countDocuments({ 'productLineItems.product': id });
    if (referencingTemplatesCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete product. It is referenced by ${referencingTemplatesCount} quotation template(s).`,
      });
    }

    // Check if any subscription references this product
    const referencingSubsCount = await Subscription.countDocuments({ 'lineItems.product': id });
    if (referencingSubsCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete product. It is referenced by ${referencingSubsCount} active subscription(s).`,
      });
    }

    await Product.findByIdAndDelete(id);

    return res.status(200).json({
      success: true,
      message: 'Product deleted successfully.',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};

