const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const Discount = require('../models/Discount');
const Product = require('../models/Product');
const { Subscription } = require('../models/Subscription');

/**
 * Generates unique Invoice number: INV-YYYYMM-XXXX
 * @returns {Promise<string>}
 */
const generateInvoiceNumber = async () => {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `INV-${yearMonth}-`;

  const latestInv = await Invoice.findOne({
    invoiceNumber: new RegExp(`^${prefix}`),
  })
    .sort({ invoiceNumber: -1 })
    .select('invoiceNumber')
    .lean();

  let nextSequence = 1;
  if (latestInv && latestInv.invoiceNumber) {
    const parts = latestInv.invoiceNumber.split('-');
    const currentSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(currentSeq)) {
      nextSequence = currentSeq + 1;
    }
  }

  let candidate = `${prefix}${String(nextSequence).padStart(4, '0')}`;
  let exists = await Invoice.exists({ invoiceNumber: candidate });
  while (exists) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(4, '0')}`;
    exists = await Invoice.exists({ invoiceNumber: candidate });
  }

  return candidate;
};

/**
 * Calculates due date based on payment terms string (e.g. 'Net 30', 'Net 15', 'Immediate')
 * @param {Date} invoiceDate
 * @param {string} paymentTerms
 * @returns {Date}
 */
const calculateDueDate = (invoiceDate, paymentTerms = 'Net 30') => {
  const due = new Date(invoiceDate);
  const terms = String(paymentTerms).trim().toLowerCase();

  const match = terms.match(/net\s*(\d+)/i);
  if (match) {
    due.setDate(due.getDate() + parseInt(match[1], 10));
    return due;
  }

  if (terms.includes('immediate') || terms.includes('due on receipt')) {
    return due;
  }

  // Default: Net 30
  due.setDate(due.getDate() + 30);
  return due;
};

/**
 * Calculates billing period bounds for a given frequency
 * @param {Date} periodStart
 * @param {string} frequency
 * @returns {{ startDate: Date, endDate: Date }}
 */
const getBillingPeriodDates = (periodStart, frequency = 'monthly') => {
  const start = new Date(periodStart);
  const end = new Date(periodStart);

  switch (frequency.toLowerCase()) {
    case 'daily':
      end.setDate(end.getDate() + 1);
      break;
    case 'weekly':
      end.setDate(end.getDate() + 7);
      break;
    case 'monthly':
      end.setMonth(end.getMonth() + 1);
      break;
    case 'yearly':
      end.setFullYear(end.getFullYear() + 1);
      break;
    default:
      end.setMonth(end.getMonth() + 1);
  }

  return { startDate: start, endDate: end };
};

/**
 * Evaluates and calculates discount deduction
 * @param {string} discountCode
 * @param {Object} context
 * @returns {Promise<Object>}
 */
const evaluateDiscount = async (discountCode, { subtotal, totalQuantity, lineItems = [] }) => {
  if (!discountCode) {
    return { isValid: false, amount: 0, discount: null, message: 'No discount code supplied.' };
  }

  const normalizedCode = String(discountCode).trim().toUpperCase();
  const discount = await Discount.findOne({ code: normalizedCode });

  if (!discount) {
    return { isValid: false, amount: 0, discount: null, message: `Discount code '${normalizedCode}' not found.` };
  }

  if (!discount.isActive) {
    return { isValid: false, amount: 0, discount: null, message: `Discount code '${normalizedCode}' is inactive.` };
  }

  const now = new Date();
  if (discount.startDate && now < new Date(discount.startDate)) {
    return { isValid: false, amount: 0, discount: null, message: `Discount code '${normalizedCode}' has not started yet.` };
  }

  if (discount.endDate && now > new Date(discount.endDate)) {
    return { isValid: false, amount: 0, discount: null, message: `Discount code '${normalizedCode}' has expired.` };
  }

  if (discount.maxUsageCount !== null && discount.maxUsageCount !== undefined) {
    if (discount.currentUsageCount >= discount.maxUsageCount) {
      return { isValid: false, amount: 0, discount: null, message: `Discount code '${normalizedCode}' usage limit has been reached.` };
    }
  }

  if (discount.minPurchaseAmount > 0 && subtotal < discount.minPurchaseAmount) {
    return {
      isValid: false,
      amount: 0,
      discount: null,
      message: `Minimum purchase amount of $${discount.minPurchaseAmount} required for discount '${normalizedCode}'. Current subtotal is $${subtotal}.`,
    };
  }

  if (discount.minQuantity > 0 && totalQuantity < discount.minQuantity) {
    return {
      isValid: false,
      amount: 0,
      discount: null,
      message: `Minimum quantity of ${discount.minQuantity} items required for discount '${normalizedCode}'. Current quantity is ${totalQuantity}.`,
    };
  }

  // Calculate discount amount
  let discountAmount = 0;

  if (discount.appliesTo === 'product' && Array.isArray(discount.applicableProducts) && discount.applicableProducts.length > 0) {
    const applicableIds = discount.applicableProducts.map((p) => p.toString());
    let eligibleSubtotal = 0;

    for (const item of lineItems) {
      const prodId = item.product._id ? item.product._id.toString() : item.product.toString();
      if (applicableIds.includes(prodId)) {
        eligibleSubtotal += (Number(item.quantity) || 1) * (Number(item.unitPrice) || 0);
      }
    }

    if (discount.type === 'percentage') {
      discountAmount = eligibleSubtotal * (discount.value / 100);
    } else {
      discountAmount = Math.min(eligibleSubtotal, discount.value);
    }
  } else {
    // Applies to whole subscription / invoice subtotal
    if (discount.type === 'percentage') {
      discountAmount = subtotal * (discount.value / 100);
    } else {
      discountAmount = Math.min(subtotal, discount.value);
    }
  }

  discountAmount = Math.round(discountAmount * 100) / 100;

  return {
    isValid: true,
    amount: discountAmount,
    discount,
    message: 'Discount applied successfully.',
  };
};

/**
 * Server-authoritative calculation of invoice financial figures
 * @param {Array} lineItems
 * @param {string} discountCode
 * @returns {Promise<Object>}
 */
const calculateInvoiceFinancials = async (lineItems, discountCode = null) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    throw new Error('Invoice must contain at least one line item.');
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
      throw new Error(`Product referenced in line item #${i + 1} does not exist.`);
    }

    const quantity = Number(item.quantity);
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
      }
    }

    let unitPrice = item.unitPrice !== undefined ? Number(item.unitPrice) : product.salesPrice + variantData.additionalPrice;
    if (isNaN(unitPrice) || unitPrice < 0) {
      throw new Error(`Unit price in line item #${i + 1} must be a non-negative number.`);
    }

    const taxPercentage = item.taxPercentage !== undefined ? Number(item.taxPercentage) : 0;
    if (isNaN(taxPercentage) || taxPercentage < 0 || taxPercentage > 100) {
      throw new Error(`Tax percentage in line item #${i + 1} must be between 0 and 100.`);
    }

    const lineSubtotal = quantity * unitPrice;
    const lineTax = Math.round(lineSubtotal * (taxPercentage / 100) * 100) / 100;
    const lineTotal = Math.round((lineSubtotal + lineTax) * 100) / 100;

    subtotal += lineSubtotal;
    taxAmount += lineTax;

    processedItems.push({
      product: product._id,
      variant: variantData,
      description: item.description ? String(item.description).trim() : product.name,
      quantity,
      unitPrice,
      taxPercentage,
      taxAmount: lineTax,
      lineTotal,
    });
  }

  subtotal = Math.round(subtotal * 100) / 100;
  taxAmount = Math.round(taxAmount * 100) / 100;

  // Evaluate discount
  let discountInfo = null;
  let discountAmount = 0;

  if (discountCode) {
    const evalResult = await evaluateDiscount(discountCode, {
      subtotal,
      totalQuantity,
      lineItems: processedItems,
    });

    if (evalResult.isValid) {
      discountAmount = evalResult.amount;
      discountInfo = {
        discountId: evalResult.discount._id,
        code: evalResult.discount.code,
        type: evalResult.discount.type,
        value: evalResult.discount.value,
        amount: discountAmount,
      };
    } else {
      throw new Error(`Invalid discount: ${evalResult.message}`);
    }
  }

  const rawTotal = subtotal + taxAmount - discountAmount;
  const totalAmount = Math.max(0, Math.round(rawTotal * 100) / 100);

  return {
    lineItems: processedItems,
    subtotal,
    taxAmount,
    discount: discountInfo,
    discountAmount,
    totalAmount,
    amountDue: totalAmount,
  };
};

/**
 * Creates an invoice for a given subscription (Idempotent: prevents duplicate invoices for same billing period)
 * @param {string|ObjectId} subscriptionId
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const createInvoiceFromSubscription = async (subscriptionId, options = {}) => {
  const subscription = await Subscription.findById(subscriptionId)
    .populate('customer')
    .populate('plan');

  if (!subscription) {
    throw new Error(`Subscription '${subscriptionId}' was not found.`);
  }

  if (['Paused', 'Closed'].includes(subscription.status)) {
    throw new Error(`Cannot invoice subscription in '${subscription.status}' status.`);
  }

  const plan = subscription.plan;
  const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();

  // Determine billing period:
  // Check the latest invoice for this subscription to set next billing start
  const lastInvoice = await Invoice.findOne({ subscription: subscription._id })
    .sort({ 'billingPeriod.endDate': -1 })
    .lean();

  const periodStart = lastInvoice && lastInvoice.billingPeriod && lastInvoice.billingPeriod.endDate
    ? new Date(lastInvoice.billingPeriod.endDate)
    : new Date(subscription.startDate);

  const billingPeriod = getBillingPeriodDates(periodStart, plan.billingFrequency);

  // Idempotency check: Does an invoice already exist overlapping this exact billing period?
  const existingInvoice = await Invoice.findOne({
    subscription: subscription._id,
    'billingPeriod.startDate': { $gte: new Date(billingPeriod.startDate.getTime() - 1000) },
    'billingPeriod.endDate': { $lte: new Date(billingPeriod.endDate.getTime() + 1000) },
    status: { $ne: 'Cancelled' },
  });

  if (existingInvoice) {
    return {
      created: false,
      invoice: existingInvoice,
      message: `Invoice for subscription ${subscription.subscriptionNumber} and period (${billingPeriod.startDate.toISOString().split('T')[0]} to ${billingPeriod.endDate.toISOString().split('T')[0]}) already exists (${existingInvoice.invoiceNumber}).`,
    };
  }

  // Calculate financials based on subscription line items
  const financials = await calculateInvoiceFinancials(
    subscription.lineItems,
    options.discountCode || null
  );

  const invoiceNumber = await generateInvoiceNumber();
  const invoiceDate = targetDate;
  const dueDate = calculateDueDate(invoiceDate, subscription.paymentTerms);

  const invoice = await Invoice.create({
    invoiceNumber,
    subscription: subscription._id,
    customer: subscription.customer._id,
    invoiceDate,
    dueDate,
    billingPeriod,
    lineItems: financials.lineItems,
    subtotal: financials.subtotal,
    taxAmount: financials.taxAmount,
    discount: financials.discount,
    discountAmount: financials.discountAmount,
    totalAmount: financials.totalAmount,
    amountPaid: 0,
    amountDue: financials.totalAmount,
    status: options.autoConfirm ? 'Confirmed' : 'Draft',
    confirmedAt: options.autoConfirm ? new Date() : null,
    notes: options.notes || `Generated from subscription ${subscription.subscriptionNumber} (${plan.billingFrequency} billing).`,
  });

  // If discount was applied, increment its usage count
  if (financials.discount && financials.discount.discountId) {
    await Discount.findByIdAndUpdate(financials.discount.discountId, {
      $inc: { currentUsageCount: 1 },
    });
  }

  return {
    created: true,
    invoice,
    message: `Invoice ${invoiceNumber} created successfully.`,
  };
};

/**
 * Runs a recurring billing batch across all eligible active subscriptions.
 * Fully idempotent: safely skips already billed periods and handles auto-close on expiration.
 * @param {Object} options
 * @returns {Promise<Object>}
 */
const runRecurringBillingBatch = async (options = {}) => {
  const targetDate = options.targetDate ? new Date(options.targetDate) : new Date();

  // Find all active subscriptions
  const activeSubscriptions = await Subscription.find({
    status: { $in: ['Active', 'Confirmed'] },
  }).populate('plan customer');

  const report = {
    runDate: targetDate,
    totalSubscriptionsEvaluated: activeSubscriptions.length,
    invoicesGenerated: 0,
    invoicesSkippedAlreadyBilled: 0,
    subscriptionsClosedExpired: 0,
    errors: [],
    details: [],
  };

  for (const sub of activeSubscriptions) {
    try {
      // 1. Handle autoClose if past expiry
      if (sub.expiryDate && targetDate >= new Date(sub.expiryDate)) {
        if (sub.plan && sub.plan.autoClose) {
          sub.status = 'Closed';
          sub.closedAt = targetDate;
          sub.closureReason = 'Auto-closed upon reaching plan expiry date';
          sub.statusHistory.push({
            fromStatus: 'Active',
            toStatus: 'Closed',
            changedAt: targetDate,
            note: 'Automatic closure by recurring billing engine',
          });
          await sub.save();
          report.subscriptionsClosedExpired += 1;
          report.details.push({
            subscriptionNumber: sub.subscriptionNumber,
            action: 'closed_expired',
          });
          continue;
        }
      }

      // 2. Generate invoice for current period
      const result = await createInvoiceFromSubscription(sub._id, {
        targetDate,
        autoConfirm: options.autoConfirm !== undefined ? options.autoConfirm : true,
      });

      if (result.created) {
        report.invoicesGenerated += 1;
        report.details.push({
          subscriptionNumber: sub.subscriptionNumber,
          invoiceNumber: result.invoice.invoiceNumber,
          totalAmount: result.invoice.totalAmount,
          action: 'invoice_generated',
        });
      } else {
        report.invoicesSkippedAlreadyBilled += 1;
        report.details.push({
          subscriptionNumber: sub.subscriptionNumber,
          action: 'skipped_already_billed',
          reason: result.message,
        });
      }
    } catch (err) {
      report.errors.push({
        subscriptionNumber: sub.subscriptionNumber,
        error: err.message,
      });
    }
  }

  return report;
};

module.exports = {
  generateInvoiceNumber,
  calculateDueDate,
  getBillingPeriodDates,
  evaluateDiscount,
  calculateInvoiceFinancials,
  createInvoiceFromSubscription,
  runRecurringBillingBatch,
};

