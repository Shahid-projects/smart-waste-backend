// =================================================================
//                      IMPORTS AND CONFIGURATION
// =================================================================
// require('dotenv').config(); // Vercel manages this

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI; // Standardized variable name
const JWT_SECRET = process.env.JWT_SECRET; // Required for auth routes

// =================================================================
//                           MIDDLEWARE
// =================================================================

// CRITICAL CORS FIX: Explicitly allow the deployed frontend domain
const allowedOrigins = [
    'https://smart-waste-frontend.vercel.app', 
    'https://smart-waste-frontend.vercel.app/', // Include trailing slash for robustness
    'http://localhost:3000' // For local testing
];
app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
}));

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
        
        // This handles errors thrown by the actual routes (like validation or JWT)
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

// Import and use routes, applying the routeHandler to each route function inside the files
// NOTE: Ensure your auth and classify route files export functions wrapped in routeHandler.

// Placeholder: Assume your auth route file exports the Express Router
app.use('/api/auth', routeHandler(require('./routes/auth'))); // You'll need to adjust how you export/wrap routes
app.use('/api/classify', routeHandler(require('./routes/classify')));

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