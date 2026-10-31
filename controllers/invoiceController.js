const mongoose = require('mongoose');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const {
  generateInvoiceNumber,
  calculateDueDate,
  calculateInvoiceFinancials,
  createInvoiceFromSubscription,
  runRecurringBillingBatch,
} = require('../services/billingService');

/**
 * @desc    Create a manual invoice
 * @route   POST /api/invoices
 * @access  Private (Admin & Staff)
 */
const createInvoice = async (req, res, next) => {
  try {
    const {
      customer,
      subscription,
      invoiceDate,
      dueDate,
      paymentTerms,
      lineItems,
      discountCode,
      notes,
    } = req.body;

    // 1. Validate customer
    if (!customer || !mongoose.Types.ObjectId.isValid(customer)) {
      return res.status(400).json({ success: false, message: 'Valid customer ID is required.' });
    }
    const customerUser = await User.findById(customer);
    if (!customerUser) {
      return res.status(404).json({ success: false, message: 'Customer account not found.' });
    }

    // 2. Validate dates
    const parsedInvoiceDate = invoiceDate ? new Date(invoiceDate) : new Date();
    const parsedDueDate = dueDate
      ? new Date(dueDate)
      : calculateDueDate(parsedInvoiceDate, paymentTerms || 'Net 30');

    if (parsedDueDate < parsedInvoiceDate) {
      return res.status(400).json({ success: false, message: 'Due date cannot precede invoice date.' });
    }

    // 3. Server-authoritative calculations
    const financials = await calculateInvoiceFinancials(lineItems, discountCode);
    const invoiceNumber = await generateInvoiceNumber();

    const invoice = await Invoice.create({
      invoiceNumber,
      customer: customerUser._id,
      subscription: subscription && mongoose.Types.ObjectId.isValid(subscription) ? subscription : null,
      invoiceDate: parsedInvoiceDate,
      dueDate: parsedDueDate,
      lineItems: financials.lineItems,
      subtotal: financials.subtotal,
      taxAmount: financials.taxAmount,
      discount: financials.discount,
      discountAmount: financials.discountAmount,
      totalAmount: financials.totalAmount,
      amountPaid: 0,
      amountDue: financials.totalAmount,
      status: 'Draft',
      paymentStatus: 'Unpaid',
      notes: notes ? String(notes).trim() : '',
    });

    const populated = await Invoice.findById(invoice._id)
      .populate('customer', 'name email role')
      .populate('lineItems.product', 'name type salesPrice');

    return res.status(201).json({
      success: true,
      message: 'Invoice created successfully in Draft status.',
      invoice: populated,
    });
  } catch (error) {
    if (error.message && (error.message.includes('Line item') || error.message.includes('discount'))) {
      return res.status(400).json({ success: false, message: error.message });
    }
    next(error);
  }
};

/**
 * @desc    Generate invoice for a subscription
 * @route   POST /api/invoices/from-subscription/:subscriptionId
 * @access  Private (Admin & Staff)
 */
const generateSubscriptionInvoice = async (req, res, next) => {
  try {
    const { subscriptionId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(subscriptionId)) {
      return res.status(400).json({ success: false, message: 'Invalid subscription ID format.' });
    }

    const result = await createInvoiceFromSubscription(subscriptionId, req.body);

    const statusCode = result.created ? 201 : 200;
    return res.status(statusCode).json({
      success: true,
      created: result.created,
      message: result.message,
      invoice: result.invoice,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get all invoices (with customer data isolation)
 * @route   GET /api/invoices
 * @access  Private (Admin, Staff, Customer)
 */
const getInvoices = async (req, res, next) => {
  try {
    const { status, paymentStatus, customer, subscription, search } = req.query;
    const filter = {};

    // Customer Isolation Guard
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (customer) {
      if (!mongoose.Types.ObjectId.isValid(customer)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID filter.' });
      }
      filter.customer = customer;
    }

    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;
    if (subscription) filter.subscription = subscription;
    if (search) filter.invoiceNumber = { $regex: String(search).trim(), $options: 'i' };

    const invoices = await Invoice.find(filter)
      .populate('customer', 'name email role')
      .populate('subscription', 'subscriptionNumber status')
      .populate('lineItems.product', 'name salesPrice')
      .sort({ invoiceDate: -1 });

    return res.status(200).json({
      success: true,
      count: invoices.length,
      invoices,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get a single invoice by ID (with customer data isolation)
 * @route   GET /api/invoices/:id
 * @access  Private (Admin, Staff, Customer)
 */
const getInvoiceById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice ID format.' });
    }

    const invoice = await Invoice.findById(id)
      .populate('customer', 'name email role')
      .populate('subscription', 'subscriptionNumber status startDate expiryDate')
      .populate('lineItems.product', 'name type salesPrice variants');

    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    // Customer Ownership Guard
    if (req.user.role === 'customer' && invoice.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view another customer’s invoice.',
      });
    }

    return res.status(200).json({
      success: true,
      invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Confirm an invoice (Draft -> Confirmed)
 * @route   POST /api/invoices/:id/confirm
 * @access  Private (Admin & Staff)
 */
const confirmInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice ID format.' });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    if (invoice.status !== 'Draft') {
      return res.status(400).json({
        success: false,
        message: `Only Draft invoices can be confirmed. Current status: '${invoice.status}'.`,
      });
    }

    invoice.status = 'Confirmed';
    invoice.confirmedAt = new Date();
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: `Invoice '${invoice.invoiceNumber}' successfully confirmed.`,
      invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Cancel an invoice
 * @route   POST /api/invoices/:id/cancel
 * @access  Private (Admin & Staff)
 */
const cancelInvoice = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid invoice ID format.' });
    }

    const invoice = await Invoice.findById(id);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    if (invoice.status === 'Paid') {
      return res.status(400).json({
        success: false,
        message: 'Cannot cancel an invoice that has already been fully paid.',
      });
    }

    if (invoice.amountPaid > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel invoice with recorded payments ($${invoice.amountPaid}). Refund or adjust payments first.`,
      });
    }

    invoice.status = 'Cancelled';
    invoice.cancelledAt = new Date();
    if (reason) invoice.notes = (invoice.notes ? invoice.notes + ' | ' : '') + `Cancelled: ${reason}`;
    await invoice.save();

    return res.status(200).json({
      success: true,
      message: `Invoice '${invoice.invoiceNumber}' has been cancelled.`,
      invoice,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Run automated recurring billing batch
 * @route   POST /api/invoices/run-recurring-billing
 * @access  Private (Admin & Staff)
 */
const triggerRecurringBilling = async (req, res, next) => {
  try {
    const report = await runRecurringBillingBatch(req.body);

    return res.status(200).json({
      success: true,
      message: `Recurring billing completed: ${report.invoicesGenerated} invoices generated, ${report.invoicesSkippedAlreadyBilled} skipped (already billed), ${report.subscriptionsClosedExpired} auto-closed.`,
      report,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createInvoice,
  generateSubscriptionInvoice,
  getInvoices,
  getInvoiceById,
  confirmInvoice,
  cancelInvoice,
  triggerRecurringBilling,
};

