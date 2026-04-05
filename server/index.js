require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const analysisRoutes = require('./routes/analysis');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// API routes
app.use('/api', analysisRoutes);

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.TWELVE_DATA_API_KEY) {
    console.warn('WARNING: TWELVE_DATA_API_KEY not set in .env file');
  }
});
