const mongoose = require('mongoose');
const { Payment, PAYMENT_METHODS } = require('../models/Payment');
const Invoice = require('../models/Invoice');
const User = require('../models/User');

/**
 * Generates unique payment number: PAY-YYYYMM-XXXX
 * @returns {Promise<string>}
 */
const generatePaymentNumber = async () => {
  const date = new Date();
  const yearMonth = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}`;
  const prefix = `PAY-${yearMonth}-`;

  const latestPay = await Payment.findOne({
    paymentNumber: new RegExp(`^${prefix}`),
  })
    .sort({ paymentNumber: -1 })
    .select('paymentNumber')
    .lean();

  let nextSequence = 1;
  if (latestPay && latestPay.paymentNumber) {
    const parts = latestPay.paymentNumber.split('-');
    const currentSeq = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(currentSeq)) {
      nextSequence = currentSeq + 1;
    }
  }

  let candidate = `${prefix}${String(nextSequence).padStart(4, '0')}`;
  let exists = await Payment.exists({ paymentNumber: candidate });
  while (exists) {
    nextSequence += 1;
    candidate = `${prefix}${String(nextSequence).padStart(4, '0')}`;
    exists = await Payment.exists({ paymentNumber: candidate });
  }

  return candidate;
};

/**
 * @desc    Record a new payment against an invoice (supports full & partial payments)
 * @route   POST /api/payments
 * @access  Private (Admin & Staff)
 */
const recordPayment = async (req, res, next) => {
  try {
    const {
      invoiceId,
      amount,
      paymentMethod,
      paymentDate,
      note,
      transactionReference,
    } = req.body;

    // 1. Validate invoiceId
    if (!invoiceId || !mongoose.Types.ObjectId.isValid(invoiceId)) {
      return res.status(400).json({ success: false, message: 'A valid invoice ID is required.' });
    }

    const invoice = await Invoice.findById(invoiceId);
    if (!invoice) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    // 2. Validate invoice status
    if (invoice.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'Cannot record payment for a Cancelled invoice.' });
    }

    if (invoice.status === 'Draft') {
      return res.status(400).json({
        success: false,
        message: 'Invoice is currently in Draft status. Please confirm the invoice before recording payments.',
      });
    }

    if (invoice.status === 'Paid' || invoice.amountDue <= 0) {
      return res.status(400).json({
        success: false,
        message: 'This invoice has already been fully paid ($0.00 balance due).',
      });
    }

    // 3. Validate payment amount
    const payAmount = Number(amount);
    if (isNaN(payAmount) || payAmount <= 0) {
      return res.status(400).json({ success: false, message: 'Payment amount must be a positive number greater than 0.' });
    }

    // 4. Overpayment check
    // Allow small floating-point tolerance of 0.001
    if (payAmount > invoice.amountDue + 0.001) {
      return res.status(400).json({
        success: false,
        message: `Overpayment rejected: Attempted to pay $${payAmount}, but only $${invoice.amountDue} is due on invoice ${invoice.invoiceNumber}.`,
      });
    }

    // 5. Validate payment method
    if (!paymentMethod || !PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment method '${paymentMethod}'. Allowed: ${PAYMENT_METHODS.join(', ')}.`,
      });
    }

    const paymentNumber = await generatePaymentNumber();

    // 6. Record Payment
    const payment = await Payment.create({
      paymentNumber,
      invoice: invoice._id,
      customer: invoice.customer,
      amount: Math.round(payAmount * 100) / 100,
      paymentMethod,
      paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
      note: note ? String(note).trim() : '',
      transactionReference: transactionReference ? String(transactionReference).trim() : '',
      recordedBy: req.user._id,
    });

    // 7. Update Invoice balances and status
    invoice.amountPaid = Math.round((invoice.amountPaid + payment.amount) * 100) / 100;
    invoice.amountDue = Math.max(0, Math.round((invoice.totalAmount - invoice.amountPaid) * 100) / 100);

    if (invoice.amountDue <= 0.001) {
      invoice.status = 'Paid';
      invoice.paymentStatus = 'Paid';
      invoice.paidAt = new Date();
    } else {
      invoice.paymentStatus = 'Partially Paid';
    }

    await invoice.save();

    const populatedPayment = await Payment.findById(payment._id)
      .populate('customer', 'name email')
      .populate('invoice', 'invoiceNumber totalAmount amountPaid amountDue status paymentStatus')
      .populate('recordedBy', 'name role');

    return res.status(201).json({
      success: true,
      message: `Payment of $${payment.amount} recorded successfully. Invoice ${invoice.invoiceNumber} status is now '${invoice.status}' (Balance Due: $${invoice.amountDue}).`,
      payment: populatedPayment,
      invoiceSummary: {
        invoiceNumber: invoice.invoiceNumber,
        totalAmount: invoice.totalAmount,
        amountPaid: invoice.amountPaid,
        amountDue: invoice.amountDue,
        status: invoice.status,
        paymentStatus: invoice.paymentStatus,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get all payments (with customer data isolation)
 * @route   GET /api/payments
 * @access  Private (Admin, Staff, Customer)
 */
const getPayments = async (req, res, next) => {
  try {
    const { invoiceId, customerId, paymentMethod } = req.query;
    const filter = {};

    // Customer Isolation Guard
    if (req.user.role === 'customer') {
      filter.customer = req.user._id;
    } else if (customerId) {
      if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({ success: false, message: 'Invalid customer ID filter.' });
      }
      filter.customer = customerId;
    }

    if (invoiceId) {
      if (!mongoose.Types.ObjectId.isValid(invoiceId)) {
        return res.status(400).json({ success: false, message: 'Invalid invoice ID filter.' });
      }
      filter.invoice = invoiceId;
    }

    if (paymentMethod) filter.paymentMethod = paymentMethod;

    const payments = await Payment.find(filter)
      .populate('customer', 'name email')
      .populate('invoice', 'invoiceNumber totalAmount amountPaid amountDue status')
      .populate('recordedBy', 'name role')
      .sort({ paymentDate: -1 });

    return res.status(200).json({
      success: true,
      count: payments.length,
      payments,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get single payment by ID (with customer data isolation)
 * @route   GET /api/payments/:id
 * @access  Private (Admin, Staff, Customer)
 */
const getPaymentById = async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Invalid payment ID format.' });
    }

    const payment = await Payment.findById(id)
      .populate('customer', 'name email')
      .populate('invoice', 'invoiceNumber totalAmount amountPaid amountDue status')
      .populate('recordedBy', 'name role');

    if (!payment) {
      return res.status(404).json({ success: false, message: 'Payment not found.' });
    }

    // Customer Ownership Guard
    if (req.user.role === 'customer' && payment.customer._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Access denied: You do not have permission to view another customer’s payment record.',
      });
    }

    return res.status(200).json({
      success: true,
      payment,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  recordPayment,
  getPayments,
  getPaymentById,
};

