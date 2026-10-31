const express = require('express');
const {
  createPlan,
  getPlans,
  getPlanById,
  updatePlan,
  deletePlan,
} = require('../controllers/planController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

// Require authentication on all plan endpoints
router.use(protect);

router
  .route('/')
  .get(authorize('admin', 'staff'), getPlans)
  .post(authorize('admin'), createPlan);

router
  .route('/:id')
  .get(authorize('admin', 'staff'), getPlanById)
  .put(authorize('admin'), updatePlan)
  .delete(authorize('admin'), deletePlan);

module.exports = router;

