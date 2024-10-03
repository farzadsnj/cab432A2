const loadtest = require('loadtest');
const path = require('path');
const fs = require('fs');

// Define the load testing options
const options = {
    url: 'http://localhost:3000/api/v1/upload',  // Update with your actual upload API URL
    maxRequests: 200,  // Increase the number of requests to simulate a larger load
    concurrency: 50,   // Increase concurrency to 50 to simulate many uploads at once
    method: 'POST',
    headers: {
        'Authorization': 'Bearer <YOUR_VALID_JWT_TOKEN>',  // Replace with a valid JWT token
    },
    // Prepare file data for each simulated request
    files: {
        uploadFile: path.join(__dirname, 'uploads/video_2024-09-01_12-01-35.mp4')  // Path to the video you want to upload
    }
};

// Create a function to ensure load testing can handle large files efficiently
function simulateLoadTest() {
    loadtest.loadTest(options, (error, result) => {
        if (error) {
            return console.error("Error during load test:", error);
        }
        console.log("Load test completed:", result);
        console.log("Total Requests:", result.totalRequests);
        console.log("Total Failures:", result.totalErrors);
    });
}

// Start the load test
simulateLoadTest();

loadtest.loadTest(options, (error, result) => {
    if (error) {
        return console.error("Error during load test:", error);
    }
    console.log("Load test completed:", result);
    console.log("Total Requests:", result.totalRequests);
    console.log("Total Failures:", result.totalErrors);
});
