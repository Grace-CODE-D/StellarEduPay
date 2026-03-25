require('dotenv').config();
const config = require('./config');
const express = require('express');
const cors = require('cors');

const studentRoutes = require('./routes/studentRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const feeRoutes = require('./routes/feeRoutes');
const reportRoutes = require('./routes/reportRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/students', studentRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/fees', feeRoutes);
app.use('/api/reports', reportRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Global error handler — all controllers forward errors here via next(err)
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const statusMap = {
    TX_FAILED: 400,
    MISSING_MEMO: 400,
    INVALID_DESTINATION: 400,
    UNSUPPORTED_ASSET: 400,
    DUPLICATE_TX: 409,
    NOT_FOUND: 404,
    VALIDATION_ERROR: 400,
    MISSING_IDEMPOTENCY_KEY: 400,
    STELLAR_NETWORK_ERROR: 502,
  };
  const status = statusMap[err.code] || err.status || 500;
  console.error(`[${err.code || 'ERROR'}] ${err.message}`);
  res.status(status).json({ error: err.message, code: err.code || 'INTERNAL_ERROR' });
});

// Only bind the port and connect to DB when run directly (not when required by tests)
if (require.main === module) {
  const mongoose = require('mongoose');
  const { startPolling } = require('./services/transactionService');
  const { startRetryWorker } = require('./services/retryService');

  mongoose.connect(config.MONGO_URI)
    .then(() => {
      console.log('MongoDB connected');
      startPolling();
      startRetryWorker();
    })
    .catch(err => console.error('MongoDB error:', err));

  app.listen(config.PORT, () => console.log(`Server running on port ${config.PORT}`));
}

module.exports = app;
