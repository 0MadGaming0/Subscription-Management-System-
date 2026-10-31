const mongoose = require('mongoose');
const { Subscription, SUBSCRIPTION_STATUSES } = require('../models/Subscription');
const Plan = require('../models/Plan');
const Product = require('../models/Product');
const User = require('../models/User');
const QuotationTemplate = require('../models/QuotationTemplate');

/**
 * Generates unique subscription number in format SUB-YYYYMM-XXXX
 * @returns {Promise<string>}
 */
const generateSubscriptionNumber = async () => {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `SUB-${yearMonth}-`;

  // Find the highest subscription number for this month
  const latestSub = await Subscription.findOne({
    subscriptionNumber: new RegExp(`^${prefix}`),
  })
    .sort({ subscriptionNumber: -1 })
    .select('subscriptionNumber')
    .lean();

  let nextSequence = 1;
  if (latestSub && latestSub.subscriptionNumber) {
    const parts = latestSub.subscriptionNumber.split('-');
    const currentSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(currentSeq)) {
      nextSequence = currentSeq + 1;
    }
  }

  // Ensure collision avoidance
  let candidateNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;
  let exists = await Subscription.exists({ subscriptionNumber: candidateNumber });
  while (exists) {
    nextSequence += 1;
    candidateNumber = `${prefix}${String(nextSequence).padStart(4, '0')}`;
    exists = await Subscription.exists({ subscriptionNumber: candidateNumber });
  }

  return candidateNumber;
};

/**
 * Server-side calculation and validation of line items against plan rules
 */
const calculateSubscriptionFinancials = async (lineItems, planRecord, discountAmount = 0) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('Subscription must contain at least one line item.');
  }

  let subtotal = 0;
  let taxAmount = 0;
  let totalQuantity = 0;
  const processedItems = [];

  for (let i = 0; i < lineItems.length; i++) {
    const item = lineItems[i];
    if (!item.product || !mongoose.Types.ObjectId.isValid(item.product)) {
      throw new Error(`Line item #${i + 1} has an invalid product reference.`);
    }

    const product = await Product.findById(item.product);
    if (!product) {
      throw new Error(`Product referenced in line item #${i + 1} was not found.`);
    }

    const rawQty = item.quantity !== undefined ? item.quantity : item.defaultQuantity;
    const quantity = Number(rawQty);
    if (isNaN(quantity) || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error(`Quantity in line item #${i + 1} must be an integer >= 1.`);
    }
    totalQuantity += quantity;

    let variantData = { name: '', additionalPrice: 0 };
    if (item.variant && item.variant.name) {
      const found = product.variants.find(
        (v) => v.name.toLowerCase() === item.variant.name.trim().toLowerCase()
      );
      if (found) {
        variantData = { name: found.name, additionalPrice: found.additionalPrice };
      } else {
        throw new Error(`Variant '${item.variant.name}' does not exist on product '${product.name}'.`);
      }
    }

    // Determine unit price
    let unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : null;
    if (unitPrice === null || isNaN(unitPrice)) {
      unitPrice = product.salesPrice + variantData.additionalPrice;
    } else if (unitPrice < 0) {
      throw new Error(`Unit price in line item #${i + 1} cannot be negative.`);
    }

    const taxPercentage = item.taxPercentage !== undefined ? Number(item.taxPercentage) : 0;
    if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      throw new Error(`Tax percentage in line item #${i + 1} must be between 0 and 100.`);
    }

    const itemSubtotal = quantity * unitPrice;
    const itemTax = itemSubtotal * (taxPercentage / 100);
    const lineTotal = itemSubtotal + itemTax;

    subtotal += itemSubtotal;
    taxAmount += itemTax;

    processedItems.push({
      product: product._id,
      variant: variantData,
      description: item.description ? String(item.description).trim() : product.name,
      quantity,
      unitPrice,
      taxPercentage,
      lineTotal: Math.round(lineTotal * 100) / 100,
    });
  }

  // Validate minimum quantity against the plan
  if (planRecord.minimumQuantity && totalQuantity < planRecord.minimumQuantity) {
    throw new Error(
      `Total line item quantity (${totalQuantity}) does not meet the plan's minimum quantity requirement (${planRecord.minimumQuantity}).`
    );
  }

  const validDiscount = Math.max(0, Number(discountAmount) || 0);
  const rawTotal = subtotal + taxAmount - validDiscount;
  const totalAmount = Math.max(0, Math.round(rawTotal * 100) / 100);

  return {
    lineItems: processedItems,
    subtotal: Math.round(subtotal * 100) / 100,
    taxAmount: Math.round(taxAmount * 100) / 100,
    discountAmount: validDiscount,
    totalAmount,
  };
};

/**
 * Calculates default expiry date based on plan billing frequency
 */
const calculatePlanExpiryDate = (startDate, billingFrequency) => {
  const expiry = new Date(startDate);
  switch (billingFrequency.toLowerCase()) {
    case 'daily':
      expiry.setDate(expiry.getDate() + 1);
      break;
    case 'weekly':
      expiry.setDate(expiry.getDate() + 7);
      break;
    case 'monthly':
      expiry.setMonth(expiry.getMonth() + 1);
      break;
    case 'yearly':
      expiry.setFullYear(expiry.getFullYear() + 1);
      break;
    default:
      expiry.setMonth(expiry.getMonth() + 1);
  }
  return expiry;
};

/**
 * @desc    Create a new subscription from scratch (Draft or Quotation)
 * @route   POST /api/subscriptions
 * @access  Private (Admin & Staff)
 */
const createSubscription = async (req, res, next) => {
  try {
    const {
      customer,
      plan,
      startDate,
      expiryDate,
      paymentTerms,
      lineItems,
      discountAmount,
      status = 'Draft',
    } = req.body;

    // 1. Validate customer
    if (!customer || !mongoose.Types.ObjectId.isValid(customer)) {
      return res.status(400).json({ success: false, message: 'A valid customer ID is required.' });
    }
    const customerUser = await User.findById(customer);
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Referenced customer account not found.' });
    }
    if (!customerUser.isActive) {
      return res.status(400).json({ success: false, message: 'Referenced customer account is inactive.' });
    }

    // 2. Validate plan
    if (!plan || !mongoose.Types.ObjectId.isValid(plan)) {
      return res.status(400).json({ success: false, message: 'A valid plan ID is required.' });
    }
    const planRecord = await Plan.findById(plan);
    if (!planRecord) {
      return res.status(404).json({ success: false, message: 'Referenced plan not found.' });
    }
    if (!planRecord.isActive) {
      return res.status(400).json({ success: false, message: `Plan '${planRecord.name}' is inactive.` });
    }

    // 3. Validate dates
    if (!startDate || isNaN(new Date(startDate).getTime())) {
      return res.status(400).json({ success: false, message: 'A valid start date is required.' });
    }
    const parsedStart = new Date(startDate);
    const parsedExpiry = expiryDate ? new Date(expiryDate) : calculatePlanExpiryDate(parsedStart, planRecord.billingFrequency);

    if (parsedExpiry < parsedStart) {
      return res.status(400).json({ success: false, message: 'Expiry date cannot be before start date.' });
    }

    // 4. Calculate financials on server
    const financials = await calculateSubscriptionFinancials(lineItems, planRecord, discountAmount);

    // 5. Generate unique subscription number
    const subscriptionNumber = await generateSubscriptionNumber();

    // 6. Validate initial status (Must be Draft or Quotation)
    if (!['Draft', 'Quotation'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `New subscriptions can only be created with status 'Draft' or 'Quotation'. Supplied: '${status}'.`,
      });
    }

    const subscription = await Subscription.create({
      subscriptionNumber,
      customer: customerUser._id,
      plan: planRecord._id,
      startDate: parsedStart,
      expiryDate: parsedExpiry,
      paymentTerms: paymentTerms ? String(paymentTerms).trim() : 'Net 30',
      lineItems: financials.lineItems,
      subtotal: financials.subtotal,
      taxAmount: financials.taxAmount,
      discountAmount: financials.discountAmount,
      totalAmount: financials.totalAmount,
      status,
      statusHistory: [
        {
          fromStatus: null,
          toStatus: status,
          changedAt: new Date(),
          changedBy: req.user._id,
          note: 'Initial subscription creation',
        },
      ],
    });

    const populatedSub = await Subscription.findById(subscription._id)
      .populate('customer', 'name email role isActive')
      .populate('plan', 'name price billingFrequency minimumQuantity autoClose allowEarlyClose allowPause allowRenewal')
      .populate('lineItems.product', 'name type salesPrice variants');

    return res.status(201).json({
      success: true,
      message: 'Subscription created successfully.',
      subscription: populatedSub,
    });
  } catch (error) {
    if (error.message && error.message.includes('Line item') || error.message.includes('minimum quantity')) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Generate quotation directly from a Quotation Template
 * @route   POST /api/subscriptions/from-template
 * @access  Private (Admin & Staff)
 */
const createFromTemplate = async (req, res, next) => {
  try {
    const { templateId, customerId, startDate, paymentTerms, lineItemOverrides } = req.body;

    if (!templateId || !mongoose.Types.ObjectId.isValid(templateId)) {
      return res.status(400).json({ success: false, message: 'Valid templateId is required.' });
    }

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
      return res.status(400).json({ success: false, message: 'Valid customerId is required.' });
    }

    const template = await QuotationTemplate.findById(templateId).populate('plan');
    if (!template) {
      return res.status(404).json({ success: false, message: 'Quotation template not found.' });
    }
    if (!template.isActive) {
      return res.status(400).json({ success: false, message: 'Quotation template is inactive.' });
    }

    const customerUser = await User.findById(customerId);
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }

    const parsedStart = startDate ? new Date(startDate) : new Date();
    // Expiry date calculated from template validityDays
    const expiryDate = new Date(parsedStart.getTime() + template.validityDays * 24 * 60 * 60 * 1000);

    // Merge or use template line items
    const rawItems = lineItemOverrides && lineItemOverrides.length > 0 ? lineItemOverrides : template.productLineItems;
    const financials = await calculateSubscriptionFinancials(rawItems, template.plan);

    const subscriptionNumber = await generateSubscriptionNumber();

    const subscription = await Subscription.create({
      subscriptionNumber,
      customer: customerUser._id,
      plan: template.plan._id,
      quotationTemplate: template._id,
      startDate: parsedStart,
      expiryDate,
      paymentTerms: paymentTerms || template.paymentTerms,
      lineItems: financials.lineItems,
      subtotal: financials.subtotal,
      taxAmount: financials.taxAmount,
      discountAmount: financials.discountAmount,
      totalAmount: financials.totalAmount,
      status: 'Quotation', // Directly generated into Quotation status
      statusHistory: [
        {
          fromStatus: null,
          toStatus: 'Quotation',
          changedAt: new Date(),
          changedBy: req.user._id,
          note: `Generated from template '${template.name}' with ${template.validityDays} validity days`,
        },
      ],
    });

    const populated = await Subscription.findById(subscription._id)
      .populate('customer', 'name email role isActive')
      .populate('plan', 'name price billingFrequency minimumQuantity autoClose allowEarlyClose allowPause allowRenewal')
      .populate('quotationTemplate', 'name validityDays')
      .populate('lineItems.product', 'name type salesPrice variants');

    return res.status(201).json({
      success: true,
      message: 'Quotation generated successfully from template.',
      subscription: populated,
    });
  } catch (error) {
    if (error.message && (error.message.includes('Line item') || error.message.includes('minimum quantity'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Get subscriptions (with ownership enforcement for customers)
 * @route   GET /api/subscriptions
 * @access  Private (Admin, Staff, Customer)
 */
const getSubscriptions = async (req, res, next) => {
  try {
    const { status, plan, customer } = req.query;
    const filter = {};

    // Customer Ownership Guard: Customers see ONLY their own subscriptions
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (customer) {
      if (!mongoose.Types.ObjectId.isValid(customer)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID filter.' });
      }
      filter.customer = customer;
    }

    if (status) {
      filter.status = status;
    }

    if (plan) {
      if (!mongoose.Types.ObjectId.isValid(plan)) {
        return res.status(400).json({ success: false, message: 'Invalid plan ID filter.' });
      }
      filter.plan = plan;
    }

    const subscriptions = await Subscription.find(filter)
      .populate('customer', 'name email role')
      .populate('plan', 'name price billingFrequency minimumQuantity autoClose allowEarlyClose allowPause allowRenewal')
      .populate('lineItems.product', 'name type salesPrice')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: subscriptions.length,
      subscriptions,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single subscription details (with ownership enforcement)
 * @route   GET /api/subscriptions/:id
 * @access  Private (Admin, Staff, Customer)
 */
const getSubscriptionById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid subscription ID format: '${id}'.` });
    }

    const subscription = await Subscription.findById(id)
      .populate('customer', 'name email role isActive')
      .populate('plan', 'name price billingFrequency minimumQuantity autoClose allowEarlyClose allowPause allowRenewal')
      .populate('quotationTemplate', 'name validityDays')
      .populate('lineItems.product', 'name type salesPrice variants')
      .populate('statusHistory.changedBy', 'name email role');

    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    // Customer Ownership Guard
    if (req.user.role === 'customer' && subscription.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view another customer’s subscription.',
      });
    }

    return res.status(200).json({
      success: true,
      subscription,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Update a draft subscription (Admin & Staff)
 * @route   PUT /api/subscriptions/:id
 * @access  Private (Admin & Staff)
 */
const updateSubscription = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid subscription ID format: '${id}'.` });
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    // Only Draft and Quotation subscriptions can be updated directly
    if (!['Draft', 'Quotation'].includes(subscription.status)) {
      return res.status(400).json({
        success: false,
        message: `Cannot edit subscription in '${subscription.status}' status. Only 'Draft' and 'Quotation' can be updated.`,
      });
    }

    const {
      startDate,
      expiryDate,
      paymentTerms,
      lineItems,
      discountAmount,
    } = req.body;

    const planRecord = await Plan.findById(subscription.plan);

    if (startDate) {
      const s = new Date(startDate);
      if (isNaN(s.getTime())) return res.status(400).json({ success: false, message: 'Invalid start date format.' });
      subscription.startDate = s;
    }

    if (expiryDate) {
      const e = new Date(expiryDate);
      if (isNaN(e.getTime())) return res.status(400).json({ success: false, message: 'Invalid expiry date format.' });
      if (e < subscription.startDate) return res.status(400).json({ success: false, message: 'Expiry date cannot precede start date.' });
      subscription.expiryDate = e;
    }

    if (paymentTerms) subscription.paymentTerms = String(paymentTerms).trim();

    if (lineItems && lineItems.length > 0) {
      const financials = await calculateSubscriptionFinancials(
        lineItems,
        planRecord,
        discountAmount !== undefined ? discountAmount : subscription.discountAmount
      );
      subscription.lineItems = financials.lineItems;
      subscription.subtotal = financials.subtotal;
      subscription.taxAmount = financials.taxAmount;
      subscription.discountAmount = financials.discountAmount;
      subscription.totalAmount = financials.totalAmount;
    }

    await subscription.save();

    const updated = await Subscription.findById(id)
      .populate('customer', 'name email role')
      .populate('plan', 'name price billingFrequency')
      .populate('lineItems.product', 'name type salesPrice');

    return res.status(200).json({
      success: true,
      message: 'Subscription updated successfully.',
      subscription: updated,
    });
  } catch (error) {
    if (error.message && (error.message.includes('Line item') || error.message.includes('minimum quantity'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * Validates allowed status transitions and Plan permission checks
 */
const executeStatusTransition = async (subscription, targetStatus, user, note = '') => {
  const currentStatus = subscription.status;
  const plan = await Plan.findById(subscription.plan);

  if (!plan) {
    throw new Error('Associated plan could not be retrieved.');
  }

  // Exact Valid Transitions Matrix:
  // Draft -> Quotation, Confirmed, Closed
  // Quotation -> Confirmed, Draft, Closed
  // Confirmed -> Active, Closed
  // Active -> Paused (if allowPause), Closed (if allowEarlyClose or expired)
  // Paused -> Active, Closed
  // Closed -> Active (Renewed, if allowRenewal)

  const allowedTransitions = {
    Draft: ['Quotation', 'Confirmed', 'Closed'],
    Quotation: ['Confirmed', 'Draft', 'Closed'],
    Confirmed: ['Active', 'Closed'],
    Active: ['Paused', 'Closed'],
    Paused: ['Active', 'Closed'],
    Closed: ['Active'], // Only via explicit renewal
  };

  if (!allowedTransitions[currentStatus] || !allowedTransitions[currentStatus].includes(targetStatus)) {
    throw new Error(
      `Invalid status transition from '${currentStatus}' to '${targetStatus}'. Allowed transitions: ${
        (allowedTransitions[currentStatus] || []).join(', ') || 'None'
      }.`
    );
  }

  // Plan permission checks
  if (targetStatus === 'Paused') {
    if (!plan.allowPause) {
      throw new Error(`Plan '${plan.name}' does not allow subscriptions to be paused.`);
    }
    subscription.pausedAt = new Date();
  }

  if (currentStatus === 'Paused' && targetStatus === 'Active') {
    subscription.pausedAt = null;
  }

  if (targetStatus === 'Closed') {
    const isEarly = subscription.expiryDate && new Date() < new Date(subscription.expiryDate);
    if (isEarly && !plan.allowEarlyClose && currentStatus === 'Active') {
      throw new Error(`Plan '${plan.name}' does not allow early closure before expiry date.`);
    }
    subscription.closedAt = new Date();
    subscription.closureReason = note || (isEarly ? 'Early closure by administrator' : 'Normal completion');
  }

  if (currentStatus === 'Closed' && targetStatus === 'Active') {
    if (!plan.allowRenewal) {
      throw new Error(`Plan '${plan.name}' does not allow subscription renewals.`);
    }
    // Renew: extend expiry date by billing frequency
    subscription.closedAt = null;
    subscription.closureReason = '';
    subscription.startDate = new Date();
    subscription.expiryDate = calculatePlanExpiryDate(subscription.startDate, plan.billingFrequency);
  }

  // Update status & history
  subscription.status = targetStatus;
  subscription.statusHistory.push({
    fromStatus: currentStatus,
    toStatus: targetStatus,
    changedAt: new Date(),
    changedBy: user._id,
    note: note || `Transitioned to ${targetStatus}`,
  });

  await subscription.save();

  return subscription;
};

/**
 * @desc    Transition subscription status (Dedicated lifecycle handler)
 * @route   PATCH /api/subscriptions/:id/status
 * @access  Private (Admin & Staff)
 */
const transitionStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: `Invalid subscription ID format: '${id}'.` });
    }

    if (!status || !SUBSCRIPTION_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid target status '${status}'. Must be one of: ${SUBSCRIPTION_STATUSES.join(', ')}.`,
      });
    }

    const subscription = await Subscription.findById(id);
    if (!subscription) {
      return res.status(404).json({ success: false, message: 'Subscription not found.' });
    }

    await executeStatusTransition(subscription, status, req.user, note);

    const updated = await Subscription.findById(id)
      .populate('customer', 'name email role')
      .populate('plan', 'name price billingFrequency allowEarlyClose allowPause allowRenewal')
      .populate('lineItems.product', 'name salesPrice');

    return res.status(200).json({
      success: true,
      message: `Subscription successfully transitioned from '${subscription.statusHistory[subscription.statusHistory.length - 1].fromStatus}' to '${status}'.`,
      subscription: updated,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Specialized lifecycle actions
 */
const confirmSubscription = async (req, res, next) => {
  req.body.status = 'Confirmed';
  return transitionStatus(req, res, next);
};

const activateSubscription = async (req, res, next) => {
  req.body.status = 'Active';
  return transitionStatus(req, res, next);
};

const pauseSubscription = async (req, res, next) => {
  req.body.status = 'Paused';
  return transitionStatus(req, res, next);
};

const resumeSubscription = async (req, res, next) => {
  req.body.status = 'Active';
  return transitionStatus(req, res, next);
};

const closeSubscription = async (req, res, next) => {
  req.body.status = 'Closed';
  return transitionStatus(req, res, next);
};

const renewSubscription = async (req, res, next) => {
  req.body.status = 'Active';
  req.body.note = req.body.note || 'Subscription renewed for an additional billing cycle';
  return transitionStatus(req, res, next);
};

module.exports = {
  createSubscription,
  createFromTemplate,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  transitionStatus,
  confirmSubscription,
  activateSubscription,
  pauseSubscription,
  resumeSubscription,
  closeSubscription,
  renewSubscription,
};

