# Brightloop Software — Subscription Management System
## Full Platform Technical Documentation: Parts 1, 2, 3 & 4

Production-oriented backend for Brightloop Software, built with **Node.js, Express, MongoDB Atlas, and Mongoose**.

---

## 1. Architecture & Project Directory Structure

```text
backend/
├── config/
│   ├── db.js                                          # Strict MongoDB Atlas connection & event listeners
│   ├── envValidator.js                                # Static environment auditor (0 warnings / 0 errors)
│   └── loadEnv.js                                     # Dual-path (.env) zero-dependency loader
├── controllers/
│   ├── authController.js                              # Register, login, me, staff creation, password reset
│   ├── productController.js                           # Product CRUD, variant validation, safe deletion
│   ├── planController.js                              # Plan CRUD, frequency & date checks, population
│   ├── quotationTemplateController.js                 # Template CRUD, default pricing, line item guards
│   ├── subscriptionController.js                      # Subscription lifecycle engine & financial calculations
│   ├── discountController.js                          # Fixed/percentage discounts, usage limits, validation
│   ├── invoiceController.js                           # Invoicing, recurring billing batch, confirm, cancel
│   └── paymentController.js                           # Payment recording, partial payments, overpayment defense
├── middleware/
│   ├── authMiddleware.js                              # JWT Bearer token validation & isActive checks
│   ├── roleMiddleware.js                              # Declarative RBAC middleware (admin, staff, customer)
│   └── errorMiddleware.js                             # Centralized Mongoose, duplicate key & JWT error handler
├── models/
│   ├── User.js                                        # User schema with bcrypt (12 rounds) & crypto tokens
│   ├── Product.js                                     # Product schema with subdocument variants & pricing
│   ├── Plan.js                                        # Plan schema with recurrence & date range checks
│   ├── QuotationTemplate.js                           # Proposal blueprint with validity days & line items
│   ├── Subscription.js                                # Contract entity with SUB-YYYYMM-XXXX & state machine
│   ├── Discount.js                                    # Discount rules with caps, limits & product scopes
│   ├── Invoice.js                                     # Invoices with INV-YYYYMM-XXXX & billing periods
│   └── Payment.js                                     # Payments with PAY-YYYYMM-XXXX linked to invoices
├── routes/
│   ├── authRoutes.js                                  # Rate-limited auth routes
│   ├── productRoutes.js                               # Protected & RBAC-gated product routes
│   ├── planRoutes.js                                  # Protected & RBAC-gated plan routes
│   ├── quotationTemplateRoutes.js                     # Protected quotation template routes
│   ├── subscriptionRoutes.js                          # Subscription lifecycle action routes
│   ├── discountRoutes.js                              # Discount management routes
│   ├── invoiceRoutes.js                               # Invoicing & recurring billing routes
│   └── paymentRoutes.js                               # Payment recording & history routes
├── scripts/
│   └── createAdmin.js                                 # Secure interactive CLI bootstrap tool
├── services/
│   ├── emailService.js                                # Brevo SMTP service for HTML password reset links
│   └── billingService.js                              # Recurring billing engine, tax, discount & invoices
├── utils/
│   └── passwordValidator.js                           # Strict password validator (>8 chars, A-Z, a-z, symbol)
├── .env                                               # Live credentials (Atlas URI, JWT secret, Brevo SMTP)
├── .env.example                                       # Public sanitized template for version control
├── .gitignore                                         # Git ignore rules protecting secrets and dependencies
├── Brightloop_Part1_Auth_Postman_Collection.json     # Postman test collection for Part 1
├── Brightloop_Part2_Product_Plan_Postman_Collection.json # Postman test collection for Part 2
├── Brightloop_Part3_Subscription_Postman_Collection.json # Postman test collection for Part 3
├── Brightloop_Part4_Invoicing_Payments_Postman_Collection.json # Postman test collection for Part 4
├── package.json                                       # Package manifest and lifecycle scripts
├── README.md                                          # Technical docs and API guide
└── server.js                                          # Express entry point, Helmet, CORS, and rate limiting
```

---

## 2. API Endpoints Directory & RBAC Matrix

### Authentication (`/api/auth`)
- `POST /api/auth/register` (Public) — Registers customer accounts (`role: 'customer'`).
- `POST /api/auth/login` (Public, Rate-limited) — Authenticates credentials and returns JWT token.
- `GET /api/auth/me` (Authenticated) — Retrieves authenticated user profile.
- `POST /api/auth/staff` (Admin only) — Provisions internal staff accounts.
- `POST /api/auth/forgot-password` (Public) — Sends 15-minute reset token via Brevo SMTP.
- `POST /api/auth/reset-password/:token` (Public) — Resets password; invalidates single-use token.

### Products (`/api/products`)
- `POST /api/products` (Admin only) — Creates product with variants.
- `GET /api/products` (Admin & Staff) — Lists products (`?type=`, `?isActive=`, `?search=`).
- `GET /api/products/:id` (Admin & Staff) — Single product details.
- `PUT /api/products/:id` (Admin only) — Updates product details / variants.
- `DELETE /api/products/:id` (Admin only) — Deletes product (guarded against active plan references).

### Plans (`/api/plans`)
- `POST /api/plans` (Admin only) — Creates recurring plan linked to an active product.
- `GET /api/plans` (Admin & Staff) — Lists plans with populated product specifications.
- `GET /api/plans/:id` (Admin & Staff) — Single plan details.
- `PUT /api/plans/:id` (Admin only) — Updates recurrence policies / pricing.
- `DELETE /api/plans/:id` (Admin only) — Deletes plan (guarded against subscription references).

### Quotation Templates (`/api/quotation-templates`)
- `POST /api/quotation-templates` (Admin only) — Creates proposal template.
- `GET /api/quotation-templates` (Admin & Staff) — Lists templates.
- `GET /api/quotation-templates/:id` (Admin & Staff) — Template details.
- `PUT /api/quotation-templates/:id` (Admin only) — Updates template.
- `DELETE /api/quotation-templates/:id` (Admin only) — Deletes template.

### Subscriptions (`/api/subscriptions`)
- `POST /api/subscriptions/from-template` (Admin & Staff) — Generates quotation from template.
- `POST /api/subscriptions` (Admin & Staff) — Creates subscription from scratch (Draft/Quotation).
- `GET /api/subscriptions` (Admin, Staff, Customer) — Lists subscriptions (Customers isolated to own).
- `GET /api/subscriptions/:id` (Admin, Staff, Customer) — Views subscription (Ownership verified).
- `PUT /api/subscriptions/:id` (Admin & Staff) — Updates Draft/Quotation subscription.
- `POST /api/subscriptions/:id/confirm` (Admin & Staff) — `Quotation` $\to$ `Confirmed`.
- `POST /api/subscriptions/:id/activate` (Admin & Staff) — `Confirmed` $\to$ `Active`.
- `POST /api/subscriptions/:id/pause` (Admin & Staff) — Pauses subscription (respects `plan.allowPause`).
- `POST /api/subscriptions/:id/resume` (Admin & Staff) — Resumes subscription (`Paused` $\to$ `Active`).
- `POST /api/subscriptions/:id/close` (Admin & Staff) — Closes subscription (respects `plan.allowEarlyClose`).
- `POST /api/subscriptions/:id/renew` (Admin & Staff) — Renews subscription (respects `plan.allowRenewal`).

### Discounts (`/api/discounts`)
- `POST /api/discounts` (Admin only) — Creates fixed or percentage discount rules.
- `GET /api/discounts` (Admin & Staff) — Lists discounts.
- `GET /api/discounts/:id` (Admin & Staff) — Views single discount.
- `PUT /api/discounts/:id` (Admin only) — Updates discount terms.
- `DELETE /api/discounts/:id` (Admin only) — Deletes / deactivates discount.
- `POST /api/discounts/validate` (Admin & Staff) — Validates discount code eligibility against an order payload.

### Invoices (`/api/invoices`)
- `POST /api/invoices` (Admin & Staff) — Creates manual invoice in Draft status.
- `POST /api/invoices/from-subscription/:subscriptionId` (Admin & Staff) — Invoices a subscription for its current billing period.
- `POST /api/invoices/run-recurring-billing` (Admin & Staff) — Idempotent batch run billing all active subscriptions.
- `GET /api/invoices` (Admin, Staff, Customer) — Lists invoices (Customers isolated to own).
- `GET /api/invoices/:id` (Admin, Staff, Customer) — Views single invoice.
- `POST /api/invoices/:id/confirm` (Admin & Staff) — `Draft` $\to$ `Confirmed`.
- `POST /api/invoices/:id/cancel` (Admin & Staff) — Cancels unpaid invoice.

### Payments (`/api/payments`)
- `POST /api/payments` (Admin & Staff) — Records payment against a confirmed invoice (supports partial & full payments, prevents overpayment).
- `GET /api/payments` (Admin, Staff, Customer) — Lists payments (Customers isolated to own).
- `GET /api/payments/:id` (Admin, Staff, Customer) — Views payment details.

---

## 3. Business Rules & Financial Integrity

1. **Server-Authoritative Calculations**:
   - Subtotal, taxes, discounts, and total amounts are calculated strictly on the backend.
   - Taxes are computed per line item and aggregated.
2. **Idempotent Recurring Billing**:
   - Subscriptions are billed per frequency: `daily`, `weekly`, `monthly`, `yearly`.
   - The engine checks existing invoices for the same `subscription` and overlapping `billingPeriod` to guarantee **no duplicate billing**.
   - Subscriptions with `autoClose: true` are automatically closed once the expiry date is reached.
3. **Discount Guards**:
   - Checks start/expiry dates, maximum usage counts, minimum purchase thresholds, and product-specific scopes.
   - Increments usage count atomically upon invoice generation.
4. **Payment Protections**:
   - Cannot record payments against `Draft` or `Cancelled` invoices.
   - Overpayment protection: payments greater than the remaining `amountDue` are rejected.
   - Partial payments update `amountPaid`, `amountDue`, and set `paymentStatus = 'Partially Paid'`.
   - When `amountDue` reaches `$0.00`, the invoice status transitions automatically to `'Paid'`.
5. **Customer Multi-Tenant Isolation**:
   - Customers can **only** view their own subscriptions, invoices, and payments.
   - Requests to view or modify records belonging to other customers return `403 Forbidden`.
