const express = require('express');
const {
  createDiscount,
  getDiscounts,
  getDiscountById,
  updateDiscount,
  deleteDiscount,
  validateDiscount,
} = require('../controllers/discountController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(protect);

router.post('/validate', authorize('admin', 'staff'), validateDiscount);

router
  .route('/')
  .get(authorize('admin', 'staff'), getDiscounts)
  .post(authorize('admin'), createDiscount);

router
  .route('/:id')
  .get(authorize('admin', 'staff'), getDiscountById)
  .put(authorize('admin'), updateDiscount)
  .delete(authorize('admin'), deleteDiscount);

module.exports = router;

