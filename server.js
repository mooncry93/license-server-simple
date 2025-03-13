const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Detailed logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error', message: err.message });
});

// ================ LICENSE MODEL DEFINITION ================
const LicenseSchema = new mongoose.Schema({
  licenseKey: { type: String, required: true, unique: true },
  product: { type: String, default: 'default_product' },
  deviceId: { type: String, default: null },
  activated: { type: Boolean, default: false },
  activationDate: { type: Date },
  createdAt: { type: Date, default: Date.now }
});

// Connect to MongoDB with proper error handling
console.log('Connecting to MongoDB...');
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/license_system';

// Improved connection with detailed logging
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => {
  console.log('✅ Successfully connected to MongoDB');
})
.catch(err => {
  console.error('❌ MongoDB connection error:', err.message);
  console.error('Connection string used:', mongoURI.replace(/mongodb:\/\/([^:]+):([^@]+)@/, 'mongodb://****:****@'));
  console.error('Full error:', err);
});

// Create the model outside of the try-catch
const License = mongoose.model('License', LicenseSchema);

// Generate a secure license key
function generateLicenseKey(prefix = 'TEST') {
  try {
    const randomBytes = crypto.randomBytes(12);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    
    // Format as PREFIX-XXXXXXXX-XXXXXXXX-XXXXXXXX
    const section1 = randomHex.substr(0, 8);
    const section2 = randomHex.substr(8, 8);
    const section3 = randomHex.substr(16, 8);
    
    return `${prefix}-${section1}-${section2}-${section3}`;
  } catch (error) {
    console.error('Error generating license key:', error);
    // Fallback to a simple random key if crypto fails
    return `${prefix}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }
}

// ================ API ENDPOINTS ================

// Root endpoint for health check
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'License server is running',
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// Simple test endpoint that doesn't use MongoDB
app.get('/api/test', (req, res) => {
  res.status(200).json({
    message: 'Test endpoint is working',
    timestamp: new Date().toISOString()
  });
});

// 1. Generate a test license
app.get('/api/generate-test-license', async (req, res) => {
  try {
    console.log('Generating test license...');
    
    // If MongoDB isn't connected, return a temporary license
    if (mongoose.connection.readyState !== 1) {
      console.log('MongoDB not connected, returning temporary license');
      const tempKey = generateLicenseKey('TEMP');
      return res.status(200).json({ 
        licenseKey: tempKey,
        temporary: true,
        warning: 'Database not connected - this license is for testing only'
      });
    }
    
    // Generate a license key
    const licenseKey = generateLicenseKey('TEST');
    console.log('Generated license key:', licenseKey);
    
    // Create a new license document
    const license = new License({
      licenseKey: licenseKey,
      product: 'test_product'
    });
    
    // Save to database with detailed error handling
    try {
      console.log('Saving license to database...');
      await license.save();
      console.log('License saved successfully');
      
      res.status(201).json({ licenseKey });
    } catch (saveError) {
      console.error('Error saving license:', saveError);
      
      // Check if it's a duplicate key error
      if (saveError.code === 11000) {
        // Try to generate a new unique key
        const newKey = generateLicenseKey('TEST-' + Date.now().toString(36).substring(-4));
        console.log('Duplicate key detected, trying new key:', newKey);
        
        const newLicense = new License({
          licenseKey: newKey,
          product: 'test_product'
        });
        
        await newLicense.save();
        return res.status(201).json({ licenseKey: newKey });
      }
      
      // For other errors, return detailed information
      res.status(500).json({ 
        error: 'Failed to save license', 
        details: saveError.message,
        code: saveError.code
      });
    }
  } catch (error) {
    console.error('Unhandled error in license generation:', error);
    res.status(500).json({ 
      error: 'Failed to generate test license', 
      message: error.message
    });
  }
});

// 2. Activate a license key
app.post('/api/activate-license', async (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    
    // Validate input
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'License key and device ID are required' });
    }
    
    console.log(`Activating license: ${licenseKey} for device: ${deviceId}`);
    
    // Find the license in the database
    const license = await License.findOne({ licenseKey });
    
    // Check if license exists
    if (!license) {
      console.log(`License not found: ${licenseKey}`);
      return res.status(404).json({ error: 'Invalid license key' });
    }
    
    // If license is already activated, check if it's for this device
    if (license.activated) {
      if (license.deviceId !== deviceId) {
        console.log(`License already activated on another device: ${license.deviceId}`);
        return res.status(403).json({ 
          error: 'License key is already activated on another device' 
        });
      }
      
      console.log(`License already activated for this device: ${deviceId}`);
      return res.status(200).json({
        status: 'activated',
        message: 'License is already activated for this device'
      });
    }
    
    // First activation - set as activated
    license.activated = true;
    license.deviceId = deviceId;
    license.activationDate = new Date();
    
    // Save changes
    await license.save();
    console.log(`License activated successfully for device: ${deviceId}`);
    
    // Return success with license details
    res.status(200).json({
      status: 'activated',
      message: 'License activated successfully'
    });
    
  } catch (error) {
    console.error('Error activating license:', error);
    res.status(500).json({ 
      error: 'Failed to activate license',
      message: error.message
    });
  }
});

// 3. Verify a license key
app.post('/api/verify-license', async (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    
    // Validate input
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'License key and device ID are required' });
    }
    
    console.log(`Verifying license: ${licenseKey} for device: ${deviceId}`);
    
    // Find the license
    const license = await License.findOne({ licenseKey });
    
    // Basic validations
    if (!license) {
      console.log(`License not found: ${licenseKey}`);
      return res.status(404).json({ error: 'Invalid license key' });
    }
    
    if (!license.activated) {
      console.log(`License not activated: ${licenseKey}`);
      return res.status(403).json({ error: 'License key is not activated' });
    }
    
    if (license.deviceId !== deviceId) {
      console.log(`License not activated for this device: ${deviceId}, but for: ${license.deviceId}`);
      return res.status(403).json({ error: 'License is not activated for this device' });
    }
    
    console.log(`License verification successful for: ${licenseKey}`);
    
    // License is valid
    res.status(200).json({
      status: 'valid',
      message: 'License is valid'
    });
    
  } catch (error) {
    console.error('Error verifying license:', error);
    res.status(500).json({ 
      error: 'Failed to verify license',
      message: error.message
    });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`License server running on port ${PORT}`);
});
