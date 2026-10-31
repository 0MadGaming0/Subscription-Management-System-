const express = require('express');
const {
  createQuotationTemplate,
  getQuotationTemplates,
  getQuotationTemplateById,
  updateQuotationTemplate,
  deleteQuotationTemplate,
} = require('../controllers/quotationTemplateController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'staff'), getQuotationTemplates)
  .post(authorize('admin'), createQuotationTemplate);

router
  .route('/:id')
  .get(authorize('admin', 'staff'), getQuotationTemplateById)
  .put(authorize('admin'), updateQuotationTemplate)
  .delete(authorize('admin'), deleteQuotationTemplate);

module.exports = router;

