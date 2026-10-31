const mongoose = require('mongoose');
const User = require('../models/User');
const { Subscription } = require('../models/Subscription');
const Invoice = require('../models/Invoice');
const { Payment } = require('../models/Payment');

/**
 * Helper to parse and sanitize date range filters
 */
const parseDateRange = (startDateStr, endDateStr, defaultDays = 90) => {
  const now = new Date();
  let start;
  let end;

  if (startDateStr && !isNaN(new Date(startDateStr).getTime())) {
    start = new Date(startDateStr);
  } else {
    start = new Date();
    start.setDate(start.getDate() - defaultDays);
    start.setHours(0, 0, 0, 0);
  }

  if (endDateStr && !isNaN(new Date(endDateStr).getTime())) {
    end = new Date(endDateStr);
    // If only YYYY-MM-DD was provided, set to end of that day
    if (!endDateStr.includes('T')) {
      end.setHours(23, 59, 59, 999);
    }
  } else {
    end = new Date();
    end.setHours(23, 59, 59, 999);
  }

  return { startDate: start, endDate: end };
};

/**
 * 1. Overall Executive Dashboard Summary
 */
const getDashboardSummary = async () => {
  const now = new Date();

  // Execute all aggregations in parallel for maximum performance
  const [
    totalCustomers,
    subStats,
    invoiceStats,
    overdueStats,
    paymentStats,
  ] = await Promise.all([
    // Total customers count
    User.countDocuments({ role: 'customer' }),

    // Subscriptions count by status
    Subscription.aggregate([
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          active: {
            $sum: { $cond: [{ $eq: ['$status', 'Active'] }, 1, 0] },
          },
          paused: {
            $sum: { $cond: [{ $eq: ['$status', 'Paused'] }, 1, 0] },
          },
          closed: {
            $sum: { $cond: [{ $eq: ['$status', 'Closed'] }, 1, 0] },
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ['$status', 'Confirmed'] }, 1, 0] },
          },
        },
      },
    ]),

    // Invoices financial summary (excluding cancelled)
    Invoice.aggregate([
      {
        $facet: {
          totalCounts: [
            {
              $group: {
                _id: null,
                totalInvoices: { $sum: 1 },
                paidInvoices: {
                  $sum: { $cond: [{ $eq: ['$status', 'Paid'] }, 1, 0] },
                },
                unpaidInvoices: {
                  $sum: {
                    $cond: [
                      {
                        $and: [
                          { $ne: ['$status', 'Paid'] },
                          { $ne: ['$status', 'Cancelled'] },
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                totalOutstanding: {
                  $sum: {
                    $cond: [
                      { $ne: ['$status', 'Cancelled'] },
                      '$amountDue',
                      0,
                    ],
                  },
                },
                totalBilled: {
                  $sum: {
                    $cond: [
                      { $ne: ['$status', 'Cancelled'] },
                      '$totalAmount',
                      0,
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    ]),

    // Overdue invoices calculation
    Invoice.aggregate([
      {
        $match: {
          status: { $ne: 'Cancelled' },
          amountDue: { $gt: 0 },
          dueDate: { $lt: now },
        },
      },
      {
        $group: {
          _id: null,
          overdueCount: { $sum: 1 },
          overdueAmount: { $sum: '$amountDue' },
        },
      },
    ]),

    // Payments collected (actual cash collected)
    Payment.aggregate([
      {
        $group: {
          _id: null,
          totalRevenueCollected: { $sum: '$amount' },
          totalPaymentsReceived: { $sum: 1 },
        },
      },
    ]),
  ]);

  const s = subStats[0] || { total: 0, active: 0, paused: 0, closed: 0 };
  const inv = (invoiceStats[0] && invoiceStats[0].totalCounts[0]) || {
    totalInvoices: 0,
    paidInvoices: 0,
    unpaidInvoices: 0,
    totalOutstanding: 0,
    totalBilled: 0,
  };
  const ov = overdueStats[0] || { overdueCount: 0, overdueAmount: 0 };
  const p = paymentStats[0] || { totalRevenueCollected: 0, totalPaymentsReceived: 0 };

  return {
    totalCustomers,
    totalSubscriptions: s.total,
    activeSubscriptions: s.active,
    pausedSubscriptions: s.paused,
    closedSubscriptions: s.closed,
    totalInvoices: inv.totalInvoices,
    paidInvoices: inv.paidInvoices,
    unpaidInvoices: inv.unpaidInvoices,
    overdueInvoices: ov.overdueCount,
    overdueAmount: Math.round(ov.overdueAmount * 100) / 100,
    totalRevenueCollected: Math.round(p.totalRevenueCollected * 100) / 100,
    totalOutstandingAmount: Math.round(inv.totalOutstanding * 100) / 100,
    totalBilledAmount: Math.round(inv.totalBilled * 100) / 100,
    totalPaymentsReceived: p.totalPaymentsReceived,
  };
};

/**
 * 2. Revenue Analytics & Period Comparisons
 */
const getRevenueAnalytics = async ({ startDateStr, endDateStr, interval = 'monthly' }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 180);

  let dateFormat;
  switch (interval.toLowerCase()) {
    case 'daily':
      dateFormat = '%Y-%m-%d';
      break;
    case 'weekly':
      dateFormat = '%Y-%U'; // Year - Week number
      break;
    case 'yearly':
      dateFormat = '%Y';
      break;
    case 'monthly':
    default:
      dateFormat = '%Y-%m';
  }

  // 1. Current period revenue aggregation
  const currentPeriodData = await Payment.aggregate([
    {
      $match: {
        paymentDate: { $gte: startDate, $lte: endDate },
      },
    },
    {
      $group: {
        _id: { $dateToString: { format: dateFormat, date: '$paymentDate' } },
        totalRevenue: { $sum: '$amount' },
        paymentCount: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Total collected in selected range
  const totalCollectedInRange = currentPeriodData.reduce((acc, curr) => acc + curr.totalRevenue, 0);

  // 2. Previous equivalent period comparison
  const durationMs = endDate.getTime() - startDate.getTime();
  const prevStartDate = new Date(startDate.getTime() - durationMs);
  const prevEndDate = new Date(startDate.getTime() - 1);

  const prevPeriodData = await Payment.aggregate([
    {
      $match: {
        paymentDate: { $gte: prevStartDate, $lte: prevEndDate },
      },
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        paymentCount: { $sum: 1 },
      },
    },
  ]);

  const prevRevenue = prevPeriodData[0] ? prevPeriodData[0].totalRevenue : 0;
  const prevPaymentCount = prevPeriodData[0] ? prevPeriodData[0].paymentCount : 0;

  let growthPercentage = 0;
  if (prevRevenue > 0) {
    growthPercentage = Math.round(((totalCollectedInRange - prevRevenue) / prevRevenue) * 10000) / 100;
  } else if (totalCollectedInRange > 0) {
    growthPercentage = 100;
  }

  return {
    interval,
    dateRange: {
      startDate,
      endDate,
    },
    totalRevenue: Math.round(totalCollectedInRange * 100) / 100,
    totalPayments: currentPeriodData.reduce((acc, curr) => acc + curr.paymentCount, 0),
    trends: currentPeriodData.map((d) => ({
      period: d._id,
      revenue: Math.round(d.totalRevenue * 100) / 100,
      count: d.paymentCount,
    })),
    comparisonWithPreviousPeriod: {
      previousRange: {
        startDate: prevStartDate,
        endDate: prevEndDate,
      },
      previousRevenue: Math.round(prevRevenue * 100) / 100,
      previousPaymentCount: prevPaymentCount,
      growthPercentage,
    },
  };
};

/**
 * 3. Subscription Analytics
 */
const getSubscriptionAnalytics = async ({ startDateStr, endDateStr, billingFrequency, subscriptionStatus }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 180);

  const matchFilter = {};
  if (subscriptionStatus) matchFilter.status = subscriptionStatus;

  const [
    statusDistribution,
    frequencyStats,
    newSubscriptionsInRange,
    renewalsStats,
  ] = await Promise.all([
    // Status breakdown
    Subscription.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),

    // Grouped by plan's billingFrequency
    Subscription.aggregate([
      { $match: matchFilter },
      {
        $lookup: {
          from: 'plans',
          localField: 'plan',
          foreignField: '_id',
          as: 'planInfo',
        },
      },
      { $unwind: '$planInfo' },
      ...(billingFrequency ? [{ $match: { 'planInfo.billingFrequency': billingFrequency.toLowerCase() } }] : []),
      {
        $group: {
          _id: '$planInfo.billingFrequency',
          count: { $sum: 1 },
          totalContractValue: { $sum: '$totalAmount' },
        },
      },
    ]),

    // New subscriptions created within date range
    Subscription.countDocuments({
      createdAt: { $gte: startDate, $lte: endDate },
      ...(subscriptionStatus ? { status: subscriptionStatus } : {}),
    }),

    // Renewals analysis (from statusHistory where renewed)
    Subscription.aggregate([
      {
        $match: {
          'statusHistory.note': { $regex: /renew/i },
        },
      },
      {
        $group: {
          _id: null,
          totalRenewedSubscriptions: { $sum: 1 },
        },
      },
    ]),
  ]);

  const distribution = {};
  statusDistribution.forEach((item) => {
    distribution[item._id] = item.count;
  });

  return {
    dateRange: { startDate, endDate },
    statusDistribution: {
      Draft: distribution.Draft || 0,
      Quotation: distribution.Quotation || 0,
      Confirmed: distribution.Confirmed || 0,
      Active: distribution.Active || 0,
      Paused: distribution.Paused || 0,
      Closed: distribution.Closed || 0,
    },
    byBillingFrequency: frequencyStats.map((f) => ({
      frequency: f._id,
      count: f.count,
      totalContractValue: f.totalContractValue,
    })),
    newSubscriptionsCount: newSubscriptionsInRange,
    renewalsCount: renewalsStats[0] ? renewalsStats[0].totalRenewedSubscriptions : 0,
  };
};

/**
 * 4. Invoice Analytics
 */
const getInvoiceAnalytics = async ({ startDateStr, endDateStr, invoiceStatus }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 180);
  const now = new Date();
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);

  const filter = {
    invoiceDate: { $gte: startDate, $lte: endDate },
  };
  if (invoiceStatus) filter.status = invoiceStatus;

  const [financials, statusStats, overdueStats, approachingDueStats] = await Promise.all([
    // Financial aggregations
    Invoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalInvoiceAmount: {
            $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, '$totalAmount', 0] },
          },
          paidAmount: { $sum: '$amountPaid' },
          outstandingAmount: {
            $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, '$amountDue', 0] },
          },
        },
      },
    ]),

    // Status breakdown
    Invoice.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          amount: { $sum: '$totalAmount' },
        },
      },
    ]),

    // Overdue invoices (overall currently overdue)
    Invoice.aggregate([
      {
        $match: {
          status: { $ne: 'Cancelled' },
          amountDue: { $gt: 0 },
          dueDate: { $lt: now },
        },
      },
      {
        $group: {
          _id: null,
          overdueCount: { $sum: 1 },
          overdueAmount: { $sum: '$amountDue' },
        },
      },
    ]),

    // Invoices approaching due date (within 7 days)
    Invoice.find({
      status: 'Confirmed',
      amountDue: { $gt: 0 },
      dueDate: { $gte: now, $lte: nextWeek },
    })
      .select('invoiceNumber customer dueDate amountDue totalAmount')
      .populate('customer', 'name email')
      .limit(10)
      .lean(),
  ]);

  const f = financials[0] || { totalInvoiceAmount: 0, paidAmount: 0, outstandingAmount: 0 };
  const ov = overdueStats[0] || { overdueCount: 0, overdueAmount: 0 };

  const distribution = {};
  statusStats.forEach((s) => {
    distribution[s._id] = { count: s.count, amount: Math.round(s.amount * 100) / 100 };
  });

  return {
    dateRange: { startDate, endDate },
    totalInvoiceAmount: Math.round(f.totalInvoiceAmount * 100) / 100,
    paidAmount: Math.round(f.paidAmount * 100) / 100,
    outstandingAmount: Math.round(f.outstandingAmount * 100) / 100,
    overdueInvoices: {
      count: ov.overdueCount,
      amount: Math.round(ov.overdueAmount * 100) / 100,
    },
    statusDistribution: {
      Draft: distribution.Draft || { count: 0, amount: 0 },
      Confirmed: distribution.Confirmed || { count: 0, amount: 0 },
      Paid: distribution.Paid || { count: 0, amount: 0 },
      Cancelled: distribution.Cancelled || { count: 0, amount: 0 },
    },
    invoicesApproachingDueDate: approachingDueStats.map((inv) => ({
      id: inv._id,
      invoiceNumber: inv.invoiceNumber,
      customer: inv.customer ? inv.customer.name : 'Unknown',
      dueDate: inv.dueDate,
      amountDue: inv.amountDue,
      totalAmount: inv.totalAmount,
    })),
  };
};

/**
 * 5. Payment Analytics
 */
const getPaymentAnalytics = async ({ startDateStr, endDateStr, paymentMethod }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 180);

  const filter = {
    paymentDate: { $gte: startDate, $lte: endDate },
  };
  if (paymentMethod) filter.paymentMethod = paymentMethod;

  const [summary, byMethod, trends, partialStats] = await Promise.all([
    // Overall payment stats
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalCollected: { $sum: '$amount' },
          paymentCount: { $sum: 1 },
        },
      },
    ]),

    // Grouped by payment method
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$paymentMethod',
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
    ]),

    // Payment trends over time
    Payment.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$paymentDate' } },
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Partial payments vs Full payments stats
    Invoice.aggregate([
      {
        $match: {
          status: { $in: ['Paid', 'Confirmed'] },
          amountPaid: { $gt: 0 },
        },
      },
      {
        $group: {
          _id: '$paymentStatus',
          invoicesCount: { $sum: 1 },
          totalAmountPaid: { $sum: '$amountPaid' },
        },
      },
    ]),
  ]);

  const s = summary[0] || { totalCollected: 0, paymentCount: 0 };

  return {
    dateRange: { startDate, endDate },
    totalCollectedPayments: Math.round(s.totalCollected * 100) / 100,
    paymentCount: s.paymentCount,
    byPaymentMethod: byMethod.map((m) => ({
      method: m._id,
      totalAmount: Math.round(m.totalAmount * 100) / 100,
      count: m.count,
    })),
    paymentTrends: trends.map((t) => ({
      date: t._id,
      amount: Math.round(t.totalAmount * 100) / 100,
      count: t.count,
    })),
    partialPaymentStatistics: partialStats.map((p) => ({
      status: p._id,
      invoiceCount: p.invoicesCount,
      totalPaid: Math.round(p.totalAmountPaid * 100) / 100,
    })),
  };
};

/**
 * 6. CSV Export Helpers
 */
const exportRevenueCSV = async ({ startDateStr, endDateStr }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 365);

  const payments = await Payment.find({
    paymentDate: { $gte: startDate, $lte: endDate },
  })
    .populate('customer', 'name email')
    .populate('invoice', 'invoiceNumber')
    .sort({ paymentDate: -1 })
    .lean();

  const headers = ['Payment Number', 'Payment Date', 'Customer Name', 'Customer Email', 'Invoice Number', 'Amount', 'Payment Method', 'Transaction Ref'];
  const rows = payments.map((p) => [
    p.paymentNumber,
    p.paymentDate ? p.paymentDate.toISOString().split('T')[0] : '',
    p.customer ? `"${p.customer.name}"` : 'N/A',
    p.customer ? `"${p.customer.email}"` : 'N/A',
    p.invoice ? p.invoice.invoiceNumber : 'N/A',
    p.amount.toFixed(2),
    p.paymentMethod,
    `"${p.transactionReference || ''}"`,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csv;
};

const exportInvoicesCSV = async ({ startDateStr, endDateStr }) => {
  const { startDate, endDate } = parseDateRange(startDateStr, endDateStr, 365);

  const invoices = await Invoice.find({
    invoiceDate: { $gte: startDate, $lte: endDate },
  })
    .populate('customer', 'name email')
    .sort({ invoiceDate: -1 })
    .lean();

  const headers = ['Invoice Number', 'Invoice Date', 'Due Date', 'Customer Name', 'Customer Email', 'Subtotal', 'Tax Amount', 'Discount Amount', 'Total Amount', 'Amount Paid', 'Amount Due', 'Status', 'Payment Status'];
  const rows = invoices.map((inv) => [
    inv.invoiceNumber,
    inv.invoiceDate ? inv.invoiceDate.toISOString().split('T')[0] : '',
    inv.dueDate ? inv.dueDate.toISOString().split('T')[0] : '',
    inv.customer ? `"${inv.customer.name}"` : 'N/A',
    inv.customer ? `"${inv.customer.email}"` : 'N/A',
    inv.subtotal.toFixed(2),
    inv.taxAmount.toFixed(2),
    inv.discountAmount.toFixed(2),
    inv.totalAmount.toFixed(2),
    inv.amountPaid.toFixed(2),
    inv.amountDue.toFixed(2),
    inv.status,
    inv.paymentStatus,
  ]);

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  return csv;
};

module.exports = {
  getDashboardSummary,
  getRevenueAnalytics,
  getSubscriptionAnalytics,
  getInvoiceAnalytics,
  getPaymentAnalytics,
  exportRevenueCSV,
  exportInvoicesCSV,
};

