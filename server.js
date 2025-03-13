const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

// Initialize Express app
const app = express();
app.use(cors());
app.use(bodyParser.json());

// Create data directory if it doesn't exist
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Path to license data file
const LICENSE_FILE = path.join(DATA_DIR, 'licenses.json');

// Initialize empty licenses file if it doesn't exist
if (!fs.existsSync(LICENSE_FILE)) {
  fs.writeFileSync(LICENSE_FILE, JSON.stringify({}), 'utf8');
}

// Helper functions for license management
function getLicenses() {
  try {
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch (error) {
    console.error('Error reading licenses:', error);
    return {};
  }
}

function saveLicenses(licenses) {
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify(licenses, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Error saving licenses:', error);
    return false;
  }
}

function generateLicenseKey(prefix = 'LIC') {
  try {
    const randomBytes = crypto.randomBytes(12);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    
    const section1 = randomHex.substr(0, 8);
    const section2 = randomHex.substr(8, 8);
    const section3 = randomHex.substr(16, 8);
    
    return `${prefix}-${section1}-${section2}-${section3}`;
  } catch (error) {
    console.error('Error generating license key:', error);
    // Fallback to a simpler method if crypto fails
    return `${prefix}-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
  }
}

// API Endpoints

// Health check
app.get('/', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    message: 'File-based license server is running',
    timestamp: new Date().toISOString()
  });
});

// Generate a test license
app.get('/api/generate-test-license', (req, res) => {
  try {
    console.log('Generating test license key...');
    
    // Generate license key
    const licenseKey = generateLicenseKey('TEST');
    console.log('Generated key:', licenseKey);
    
    // Save to license store
    const licenses = getLicenses();
    licenses[licenseKey] = {
      product: 'test_product',
      activated: false,
      createdAt: new Date().toISOString()
    };
    
    if (saveLicenses(licenses)) {
      console.log('License saved successfully');
      res.status(201).json({ licenseKey });
    } else {
      throw new Error('Failed to save license data');
    }
  } catch (error) {
    console.error('Error generating license:', error);
    res.status(500).json({ 
      error: 'Failed to generate license', 
      message: error.message 
    });
  }
});

// Activate a license
app.post('/api/activate-license', (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    
    console.log(`Activation request for key: ${licenseKey}, device: ${deviceId}`);
    
    // Validate input
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'License key and device ID are required' });
    }
    
    // Get current licenses
    const licenses = getLicenses();
    
    // Check if license exists
    if (!licenses[licenseKey]) {
      console.log(`License not found: ${licenseKey}`);
      return res.status(404).json({ error: 'Invalid license key' });
    }
    
    // Check if already activated
    if (licenses[licenseKey].activated) {
      if (licenses[licenseKey].deviceId !== deviceId) {
        console.log(`License already activated on different device: ${licenses[licenseKey].deviceId}`);
        return res.status(403).json({ error: 'License key is already activated on another device' });
      }
      
      console.log(`License already activated for this device: ${deviceId}`);
      return res.status(200).json({
        status: 'activated',
        message: 'License is already activated for this device'
      });
    }
    
    // Activate the license
    licenses[licenseKey].activated = true;
    licenses[licenseKey].deviceId = deviceId;
    licenses[licenseKey].activationDate = new Date().toISOString();
    
    // Save changes
    if (saveLicenses(licenses)) {
      console.log(`License activated successfully for device: ${deviceId}`);
      res.status(200).json({
        status: 'activated',
        message: 'License activated successfully'
      });
    } else {
      throw new Error('Failed to save activation data');
    }
  } catch (error) {
    console.error('Error activating license:', error);
    res.status(500).json({ 
      error: 'Failed to activate license', 
      message: error.message 
    });
  }
});

// Verify a license
app.post('/api/verify-license', (req, res) => {
  try {
    const { licenseKey, deviceId } = req.body;
    
    console.log(`Verification request for key: ${licenseKey}, device: ${deviceId}`);
    
    // Validate input
    if (!licenseKey || !deviceId) {
      return res.status(400).json({ error: 'License key and device ID are required' });
    }
    
    // Get current licenses
    const licenses = getLicenses();
    
    // Check if license exists
    if (!licenses[licenseKey]) {
      console.log(`License not found: ${licenseKey}`);
      return res.status(404).json({ error: 'Invalid license key' });
    }
    
    // Check if activated
    if (!licenses[licenseKey].activated) {
      console.log(`License not activated: ${licenseKey}`);
      return res.status(403).json({ error: 'License key is not activated' });
    }
    
    // Check if activated for this device
    if (licenses[licenseKey].deviceId !== deviceId) {
      console.log(`License not activated for this device: ${deviceId}, but for: ${licenses[licenseKey].deviceId}`);
      return res.status(403).json({ error: 'License is not activated for this device' });
    }
    
    console.log(`License verified successfully: ${licenseKey}`);
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

// List all licenses (for debugging)
app.get('/api/admin/licenses', (req, res) => {
  try {
    const licenses = getLicenses();
    res.status(200).json(licenses);
  } catch (error) {
    res.status(500).json({ error: 'Failed to list licenses' });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`File-based license server running on port ${PORT}`);
});
