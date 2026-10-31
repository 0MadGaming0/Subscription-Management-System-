const express = require('express');
const {
  getSummary,
  getRevenue,
  getSubscriptions,
  getInvoices,
  getPayments,
  exportRevenue,
  exportInvoices,
} = require('../controllers/dashboardController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

// All dashboard endpoints require authentication and Admin/Staff role. Customers are strictly forbidden.
router.use(protect);
router.use(authorize('admin', 'staff'));

router.get('/summary', getSummary);
router.get('/revenue', getRevenue);
router.get('/subscriptions', getSubscriptions);
router.get('/invoices', getInvoices);
router.get('/payments', getPayments);

// Export endpoints
router.get('/export/revenue', exportRevenue);
router.get('/export/invoices', exportInvoices);

module.exports = router;

