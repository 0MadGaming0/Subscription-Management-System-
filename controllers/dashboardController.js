const {
  getDashboardSummary,
  getRevenueAnalytics,
  getSubscriptionAnalytics,
  getInvoiceAnalytics,
  getPaymentAnalytics,
  exportRevenueCSV,
  exportInvoicesCSV,
} = require('../services/analyticsService');

/**
 * @desc    Get executive dashboard summary metrics
 * @route   GET /api/dashboard/summary
 * @access  Private (Admin & Staff)
 */
const getSummary = async (req, res, next) => {
  try {
    const summary = await getDashboardSummary();
    return res.status(200).json({
      success: true,
      summary,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get revenue analytics, breakdown and comparisons
 * @route   GET /api/dashboard/revenue
 * @access  Private (Admin & Staff)
 */
const getRevenue = async (req, res, next) => {
  try {
    const { startDate, endDate, interval } = req.query;
    const analytics = await getRevenueAnalytics({
      startDateStr: startDate,
      endDateStr: endDate,
      interval,
    });

    return res.status(200).json({
      success: true,
      revenueAnalytics: analytics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get subscription status distribution, frequencies & renewals
 * @route   GET /api/dashboard/subscriptions
 * @access  Private (Admin & Staff)
 */
const getSubscriptions = async (req, res, next) => {
  try {
    const { startDate, endDate, billingFrequency, subscriptionStatus } = req.query;
    const analytics = await getSubscriptionAnalytics({
      startDateStr: startDate,
      endDateStr: endDate,
      billingFrequency,
      subscriptionStatus,
    });

    return res.status(200).json({
      success: true,
      subscriptionAnalytics: analytics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get invoice amounts, status distribution, overdue & approaching due
 * @route   GET /api/dashboard/invoices
 * @access  Private (Admin & Staff)
 */
const getInvoices = async (req, res, next) => {
  try {
    const { startDate, endDate, invoiceStatus } = req.query;
    const analytics = await getInvoiceAnalytics({
      startDateStr: startDate,
      endDateStr: endDate,
      invoiceStatus,
    });

    return res.status(200).json({
      success: true,
      invoiceAnalytics: analytics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Get payments breakdown by method, timeline & partial payment stats
 * @route   GET /api/dashboard/payments
 * @access  Private (Admin & Staff)
 */
const getPayments = async (req, res, next) => {
  try {
    const { startDate, endDate, paymentMethod } = req.query;
    const analytics = await getPaymentAnalytics({
      startDateStr: startDate,
      endDateStr: endDate,
      paymentMethod,
    });

    return res.status(200).json({
      success: true,
      paymentAnalytics: analytics,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export revenue report as CSV
 * @route   GET /api/dashboard/export/revenue
 * @access  Private (Admin & Staff)
 */
const exportRevenue = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const csvData = await exportRevenueCSV({
      startDateStr: startDate,
      endDateStr: endDate,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="revenue-report-${Date.now()}.csv"`);
    return res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
};

/**
 * @desc    Export invoices report as CSV
 * @route   GET /api/dashboard/export/invoices
 * @access  Private (Admin & Staff)
 */
const exportInvoices = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;
    const csvData = await exportInvoicesCSV({
      startDateStr: startDate,
      endDateStr: endDate,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="invoices-report-${Date.now()}.csv"`);
    return res.status(200).send(csvData);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  getRevenue,
  getSubscriptions,
  getInvoices,
  getPayments,
  exportRevenue,
  exportInvoices,
};

