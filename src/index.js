require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const pino = require('pino');

// Initialize Express app
const app = express();
const port = process.env.PORT || 3000;

// Import routes
const userRoutes = require('./routes/userRoutes');

const corsOptions = {
  origin: [
    'https://drjduarte.com',
    'http://localhost:5173' 
  ],
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(pino());
}

// Initialize Firebase
require('./config/firebase');

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'Healthcare Authentication Service API' });
});

// API Routes
app.use('/api', userRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
