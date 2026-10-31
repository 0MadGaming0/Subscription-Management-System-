const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

// 1. Load and validate environment variables
require('./config/loadEnv');
const { validateEnv } = require('./config/envValidator');

// Validate environment on boot
const envStatus = validateEnv(process.env.NODE_ENV !== 'production');
if (!envStatus.isValid) {
  console.error('[Configuration Error] Missing required environment variables:', envStatus.missingRequired.join(', '));
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

const connectDB = require('./config/db');
const authRoutes = require('./routes/authRoutes');
const productRoutes = require('./routes/productRoutes');
const planRoutes = require('./routes/planRoutes');
const quotationTemplateRoutes = require('./routes/quotationTemplateRoutes');
const subscriptionRoutes = require('./routes/subscriptionRoutes');
const discountRoutes = require('./routes/discountRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const { notFound, errorHandler } = require('./middleware/errorMiddleware');

const app = express();

// ==========================================
// 2. SECURITY & UTILITY MIDDLEWARE
// ==========================================

// HTTP Security headers
app.use(helmet());

// Cross-Origin Resource Sharing (CORS)
const allowedOrigins = process.env.CLIENT_URL ? [process.env.CLIENT_URL] : ['http://localhost:3000'];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or Postman)
      if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
        callback(null, true);
      } else {
        callback(new Error('Blocked by CORS policy: Origin not allowed'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// General Rate Limiting for all API endpoints (configured via environment variables)
const generalLimiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.',
  },
});
app.use('/api', generalLimiter);

// Body parsers with size limit protection against payload attacks
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// ==========================================
// 3. API ROUTES
// ==========================================

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Brightloop Subscription Management API',
    modules: [
      'Part 1: Authentication & User Management',
      'Part 2: Product & Plan Management',
      'Part 3: Quotation & Subscription Management',
      'Part 4: Invoicing, Recurring Billing, Discounts & Payments',
      'Part 5: Dashboard, Analytics & Reporting',
    ],
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/quotation-templates', quotationTemplateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);

// ==========================================
// 4. ERROR HANDLING MIDDLEWARE
// ==========================================

// 404 handler for unrecognized routes
app.use(notFound);

// Centralized error handler
app.use(errorHandler);

// ==========================================
// 5. DATABASE & SERVER INITIALIZATION
// ==========================================

const PORT = process.env.PORT || 5000;

/**
 * Starts the HTTP server strictly after verifying database connection.
 */
const startServer = async () => {
  try {
    // Connect to database before accepting HTTP traffic
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log('------------------------------------------------------------');
      console.log(`[Server] Brightloop Backend running in ${process.env.NODE_ENV || 'development'} mode`);
      console.log(`[Server] Listening on http://localhost:${PORT}`);
      console.log(`[Server] Health check available at http://localhost:${PORT}/api/health`);
      console.log('------------------------------------------------------------');
    });

    // Graceful shutdown handling
    const gracefulShutdown = (signal) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        console.log('[Server] Closed remaining HTTP connections.');
        try {
          const mongoose = require('mongoose');
          await mongoose.connection.close(false);
          console.log('[Database] MongoDB connection closed.');
          process.exit(0);
        } catch (err) {
          console.error('[Server Error] Error during database disconnect:', err.message);
          process.exit(1);
        }
      });

      // Force close after 10 seconds timeout
      setTimeout(() => {
        console.error('[Server Error] Forcing shutdown: connections did not close in time.');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    console.error('[Server Error] Failed to start application:', error.message);
    process.exit(1);
  }
};

startServer();

module.exports = app;
