require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const analysisRoutes = require('./routes/analysis');
const priceStream = require('./services/priceStream');
const poller = require('./services/poller');

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

const server = http.createServer(app);
priceStream.attach(server);
poller.start();

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  if (!process.env.TWELVE_DATA_API_KEY) {
    console.warn('WARNING: TWELVE_DATA_API_KEY not set in .env file');
  }
});
