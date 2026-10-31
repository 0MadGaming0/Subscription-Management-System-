const express = require('express');
const {
  recordPayment,
  getPayments,
  getPaymentById,
} = require('../controllers/paymentController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'staff', 'customer'), getPayments)
  .post(authorize('admin', 'staff'), recordPayment);

router
  .route('/:id')
  .get(authorize('admin', 'staff', 'customer'), getPaymentById);

module.exports = router;

