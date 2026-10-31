const express = require('express');
const {
  createSubscription,
  createFromTemplate,
  getSubscriptions,
  getSubscriptionById,
  updateSubscription,
  transitionStatus,
  confirmSubscription,
  activateSubscription,
  pauseSubscription,
  resumeSubscription,
  closeSubscription,
  renewSubscription,
} = require('../controllers/subscriptionController');
const { protect } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');

const router = express.Router();

router.use(protect);

// Template quotation generation
router.post('/from-template', authorize('admin', 'staff'), createFromTemplate);

// Base Collection
router
  .route('/')
  .get(authorize('admin', 'staff', 'customer'), getSubscriptions)
  .post(authorize('admin', 'staff'), createSubscription);

// Single Item Operations
router
  .route('/:id')
  .get(authorize('admin', 'staff', 'customer'), getSubscriptionById)
  .put(authorize('admin', 'staff'), updateSubscription);

// Lifecycle Transition Handlers
router.patch('/:id/status', authorize('admin', 'staff'), transitionStatus);
router.post('/:id/confirm', authorize('admin', 'staff'), confirmSubscription);
router.post('/:id/activate', authorize('admin', 'staff'), activateSubscription);
router.post('/:id/pause', authorize('admin', 'staff'), pauseSubscription);
router.post('/:id/resume', authorize('admin', 'staff'), resumeSubscription);
router.post('/:id/close', authorize('admin', 'staff'), closeSubscription);
router.post('/:id/renew', authorize('admin', 'staff'), renewSubscription);

module.exports = router;

