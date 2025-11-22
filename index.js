// =================================================================
//                      IMPORTS AND CONFIGURATION
// =================================================================
// require('dotenv').config(); // Vercel manages this

const express = require('express');
// Removed: const cors = require('cors'); 
const mongoose = require('mongoose');

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI; // Standardized variable name

// =================================================================
//                           MIDDLEWARE
// =================================================================

// CORS middleware has been removed. 
// WARNING: This leaves your API vulnerable to cross-site attacks 
// if not compensated by a Vercel header config or other firewall/gateway.

app.use(express.json());

// =================================================================
//                        DATABASE CONNECTION
// =================================================================

let isConnected;

const connectDB = async () => {
    if (isConnected) {
        console.log('=> Using existing database connection');
        return;
    }

    if (!MONGO_URI) {
        console.error('MONGO_URI is not defined. Check Vercel environment variables.');
        throw new Error('MONGO_URI_MISSING'); 
    }
    
    try {
        await mongoose.connect(MONGO_URI);
        isConnected = true;
        console.log('=> New database connection established');
    } catch (err) {
        console.error('MongoDB connection error:', err.message);
        throw new Error('DATABASE_CONNECTION_FAILED');
    }
};

// =================================================================
//                         ROUTE WRAPPER & ROUTES
// =================================================================

// Wrapper to ensure DB connection is attempted gracefully before route execution
const routeHandler = (handler) => async (req, res) => {
    try {
        await connectDB();
        await handler(req, res);
    } catch (error) {
        console.error("Route Handler Error:", error.message);

        if (error.message === 'MONGO_URI_MISSING' || error.message === 'DATABASE_CONNECTION_FAILED') {
            return res.status(503).json({ 
                message: 'Service temporarily unavailable. Check Vercel MONGO_URI and MongoDB IP Whitelisting.' 
            });
        }
        
        // If the error is not handled by the specific database checks, 
        // fall back to a generic 500 error if headers haven't been sent.
        if (!res.headersSent) {
            res.status(500).json({ message: 'Internal Server Error.' });
        }
    }
};

// --- Apply the wrapper to all imported routes ---

// A simple test route
app.get('/', (req, res) => {
    res.send('Hello from the EcoSort Server!');
});

// Assuming routes/auth.js and routes/classify.js export Express Routers
// NOTE: For this Vercel pattern, the imported routes need to handle 
// async/await and error throwing correctly, or the wrapper needs to be adjusted 
// to handle the Express Router directly. If the imported files are not wrapped, 
// the server may still crash.

app.use('/api/auth', require('./routes/auth')); 
app.use('/api/classify', require('./routes/classify'));

// Fallback route for Vercel deployment structure
app.use((req, res) => {
    res.status(404).json({ message: 'API route not found.' });
});


// Export the app for Vercel Serverless Function deployment
module.exports = app;

// Local startup code (Vercel ignores this, but useful for local testing)
if (process.env.NODE_ENV !== 'production') {
    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
}