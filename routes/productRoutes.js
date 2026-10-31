const express = require('express');
const {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} = require('../controllers/productController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

// Require authentication on all product endpoints
router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'staff', 'customer'), getProducts)
  .post(authorize('admin'), createProduct);

router
  .route('/:id')
  .get(authorize('admin', 'staff', 'customer'), getProductById)
  .put(authorize('admin'), updateProduct)
  .delete(authorize('admin'), deleteProduct);

module.exports = router;

