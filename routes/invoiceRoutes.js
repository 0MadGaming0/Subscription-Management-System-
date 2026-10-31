const express = require('express');
const {
  createInvoice,
  generateSubscriptionInvoice,
  getInvoices,
  getInvoiceById,
  confirmInvoice,
  cancelInvoice,
  triggerRecurringBilling,
} = require('../controllers/invoiceController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(protect);

// Recurring billing batch
router.post('/run-recurring-billing', authorize('admin', 'staff'), triggerRecurringBilling);

// Invoice from subscription
router.post('/from-subscription/:subscriptionId', authorize('admin', 'staff'), generateSubscriptionInvoice);

// Collection operations
router
  .route('/')
  .get(authorize('admin', 'staff', 'customer'), getInvoices)
  .post(authorize('admin', 'staff'), createInvoice);

// Single item operations
router
  .route('/:id')
  .get(authorize('admin', 'staff', 'customer'), getInvoiceById);

// Status actions
router.post('/:id/confirm', authorize('admin', 'staff'), confirmInvoice);
router.post('/:id/cancel', authorize('admin', 'staff'), cancelInvoice);

module.exports = router;

