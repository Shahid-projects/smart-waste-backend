const express = require('express');
const router = express.Router();
const multer = require('multer');
const axios = require('axios');

// Configure multer to handle file uploads in memory
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Segregation tips database (UNCHANGED)
const segregationTips = {
  plastic: { category: 'Dry Waste (Sukha Kachra)', tips: ['Rinse the item...', 'Crush bottles...', 'Remove caps...', 'Check recycling symbol...', 'Keep soft plastics separate.'], impact: 'Recycling one ton of plastic can save 7,500 kWh of electricity.' },
  paper: { category: 'Dry Waste (Sukha Kachra)', tips: ['Ensure paper is clean...', 'Remove wrapping...', 'Staples usually fine...', 'Avoid shredding...', 'Flatten paper.'], impact: 'Recycling one ton of paper saves 17 trees.' },
  cardboard: { category: 'Dry Waste (Sukha Kachra)', tips: ['Flatten boxes...', 'Remove tape...', 'Keep dry...', 'Avoid greasy pizza boxes...', 'Stack neatly.'], impact: 'Recycling cardboard uses 75% less energy.' },
  metal: { category: 'Dry Waste (Sukha Kachra)', tips: ['Rinse cans...', 'Watch sharp edges...', 'Labels can stay...', 'Do not crush aerosol...', 'Foil can be recycled if clean.'], impact: 'One recycled aluminum can saves enough energy to run a TV for 3 hours.' },
  glass: { category: 'Dry Waste (Sukha Kachra)', tips: ['Rinse bottles...', 'Remove lids...', 'Don’t recycle broken glass...', 'No mirrors/bulbs...', 'Separate by color if required.'], impact: 'Recycling glass cuts pollution significantly.' },
  organic: { category: 'Wet Waste (Geela Kachra)', tips: ['Use a bin with lid...', 'Include peels...', 'Avoid too much oil/meat...', 'Line bin with newspaper...', 'Use for composting.'], impact: 'Composting reduces methane emissions.' },
  trash: { category: 'Reject Waste', tips: ['For non-recyclables...', 'Includes chip packets...', 'Styrofoam & tissues...', 'Always check packaging...', 'Reduce non-recyclables.'], impact: 'Segregating trash prevents contamination of recyclables.' }
};

// Helper function to map detailed Roboflow classes to general categories (UNCHANGED)
function mapWasteType(className) {
    const lowerClassName = className.toLowerCase();
    if (lowerClassName.includes('plastic')) return 'plastic';
    if (lowerClassName.includes('paper')) return 'paper';
    if (lowerClassName.includes('cardboard')) return 'cardboard';
    if (lowerClassName.includes('metal')) return 'metal';
    if (lowerClassName.includes('glass')) return 'glass';
    if (lowerClassName.includes('food') || lowerClassName.includes('organic')) return 'organic';
    return 'trash'; // Default fallback for anything else
}


// Route: POST /api/classify/upload
router.post('/upload', upload.single('wasteImage'), async (req, res) => {
  // NOTE: This route needs to be wrapped by a routeHandler in the main server file 
  // to ensure DB connection, though DB isn't strictly needed for Roboflow API call itself.
  
  if (!req.file) {
    return res.status(400).json({ msg: 'No file uploaded.' });
  }

  // Ensure Roboflow keys are available in Vercel environment
  const model = process.env.ROBOFLOW_MODEL_NAME;
  const version = process.env.ROBOFLOW_MODEL_VERSION;
  const apiKey = process.env.ROBOFLOW_API_KEY;

  if (!model || !version || !apiKey) {
    console.error("Roboflow credentials missing. Check Vercel environment variables.");
    return res.status(500).json({ error: "Server configuration error: Roboflow keys missing." });
  }

  try {
    // Convert image to Base64
    const imageBase64 = req.file.buffer.toString('base64');

    const roboflowUrl = `https://detect.roboflow.com/${model}/${version}?api_key=${apiKey}`;

    // Send POST request to Roboflow
    const roboflowResponse = await axios({
      method: 'POST',
      url: roboflowUrl,
      data: imageBase64,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    console.log("✅ Roboflow raw response received.");

    // --- FIX: Robust prediction handling based on Roboflow's API response structure ---
    const predictions = roboflowResponse.data.predictions || [];

    if (predictions.length === 0) {
      // Check for predicted_classes fallback for classification models
      const fallbackClass = roboflowResponse.data.predicted_classes?.[0];
      if (fallbackClass) {
          const generalWasteType = mapWasteType(fallbackClass);
          const tipsData = segregationTips[generalWasteType] || segregationTips['trash'];
          return res.status(200).json({
              name: fallbackClass,
              category: tipsData.category,
              confidence: 99, // High default confidence for classification fallback
              info: `This item was classified as ${fallbackClass}.`,
              tips: tipsData.tips,
              impact: tipsData.impact
          });
      }
      return res.status(400).json({ msg: "No object detected or low confidence. Try a clearer image." });
    }

    // Process object detection predictions (assuming predictions is an array of objects)
    // Find the prediction with the highest confidence
    let topPrediction = predictions.reduce((prev, current) => {
        return (prev.confidence > current.confidence) ? prev : current;
    }, { confidence: 0 }); 

    if (topPrediction.confidence < 0.5) { // Threshold check
      return res.status(400).json({ msg: "Confidence too low. Please try a clearer image." });
    }
    
    // Use the highest prediction
    const generalWasteType = mapWasteType(topPrediction.class);
    const tipsData = segregationTips[generalWasteType] || segregationTips['trash'];

    const finalResponse = {
      name: topPrediction.class,
      category: tipsData.category,
      confidence: Math.round(topPrediction.confidence * 100),
      info: `This item has been identified as ${topPrediction.class}.`,
      tips: tipsData.tips,
      impact: tipsData.impact
    };

    res.status(200).json(finalResponse);

  } catch (err) {
    console.error('--- DETAILED CLASSIFICATION ERROR ---');
    if (err.response) {
      console.error("Status:", err.response.status);
      console.error("Data:", err.response.data);
      // Return specific error from Roboflow if available
      return res.status(err.response.status).json({ error: err.response.data.error || "Roboflow API error." });
    } else {
      console.error("Error Message:", err.message);
    }
    return res.status(500).json({ error: "An internal server error occurred during classification." });
  }
});

module.exports = router;