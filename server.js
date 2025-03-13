const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const crypto = require('crypto');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const moment = require('moment');
require('dotenv').config();

// Initialize Express app
const app = express();
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Connect to MongoDB
const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/license_system';
mongoose.connect(mongoURI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ================ LICENSE MODEL DEFINITION ================
const LicenseSchema = new mongoose.Schema({
    licenseKey: { type: String, required: true, unique: true },
    product: { type: String, required: true, default: 'default_product' },
    deviceId: { type: String, default: null },
    activated: { type: Boolean, default: false },
    activationDate: { type: Date },
    expiryDate: { type: Date },
    status: { 
        type: String, 
        enum: ['active', 'expired', 'revoked', 'pending'],
        default: 'pending'
    },
    createdAt: { type: Date, default: Date.now }
});

const License = mongoose.model('License', LicenseSchema);

// ================ SECURITY FUNCTIONS ================
// Generate a secure license key
function generateSecureLicenseKey(productCode = 'PRO') {
    const randomBytes = crypto.randomBytes(16);
    const randomHex = randomBytes.toString('hex').toUpperCase();
    
    const section1 = randomHex.substr(0, 8);
    const section2 = randomHex.substr(8, 8);
    const section3 = randomHex.substr(16, 8);
    
    return `${productCode}-${section1}-${section2}-${section3}`;
}

// ================ API ENDPOINTS ================
// Health check endpoint
app.get('/', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'License server is running' });
});

// 1. Activate a license key
app.get('/api/generate-test-license', async (req, res) => {
    try {
        console.log("Attempting to generate test license...");
        const licenseKey = generateSecureLicenseKey('TEST');
        console.log("Generated key:", licenseKey);
        
        const license = new License({
            licenseKey,
            product: 'test_product'
        });
        
        console.log("About to save license to database...");
        await license.save();
        console.log("License saved successfully");
        
        res.status(201).json({ licenseKey });
    } catch (error) {
        console.error('Error generating test license:', error);
        // Return more detailed error information
        res.status(500).json({ 
            error: 'Failed to generate test license', 
            details: error.message,
            stack: error.stack
        });
    }
});
        
        license.activated = true;
        license.deviceId = deviceId;
        license.activationDate = new Date();
        license.status = 'active';
        
        await license.save();
        
        res.status(200).json({
            status: 'activated',
            message: 'License activated successfully'
        });
    } catch (error) {
        console.error('Error activating license:', error);
        res.status(500).json({ error: 'Failed to activate license' });
    }
});

// 2. Verify a license key
app.post('/api/verify-license', async (req, res) => {
    try {
        const { licenseKey, deviceId } = req.body;
        
        if (!licenseKey || !deviceId) {
            return res.status(400).json({ error: 'License key and device ID are required' });
        }
        
        const license = await License.findOne({ licenseKey });
        
        if (!license) {
            return res.status(404).json({ error: 'Invalid license key' });
        }
        
        if (!license.activated) {
            return res.status(403).json({ error: 'License key is not activated' });
        }
        
        if (license.deviceId !== deviceId) {
            return res.status(403).json({ error: 'License is not activated for this device' });
        }
        
        res.status(200).json({
            status: 'valid',
            message: 'License is valid'
        });
    } catch (error) {
        console.error('Error verifying license:', error);
        res.status(500).json({ error: 'Failed to verify license' });
    }
});

// Special endpoint to generate a test license
app.get('/api/generate-test-license', async (req, res) => {
    try {
        const licenseKey = generateSecureLicenseKey('TEST');
        
        const license = new License({
            licenseKey,
            product: 'test_product'
        });
        
        await license.save();
        
        res.status(201).json({ licenseKey });
    } catch (error) {
        console.error('Error generating test license:', error);
        res.status(500).json({ error: 'Failed to generate test license' });
    }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`License server running on port ${PORT}`);
});
