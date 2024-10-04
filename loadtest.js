const loadtest = require('loadtest');
const path = require('path');
const fs = require('fs');

const options = {
    url: 'http://localhost:3000/api/v1/upload', 
    maxRequests: 200,  
    concurrency: 50,  
    method: 'POST',
    headers: {
        'Authorization': 'Bearer <YOUR_VALID_JWT_TOKEN>', 
    },
    files: {
        uploadFile: path.join(__dirname, 'uploads/video_2024-09-01_12-01-35.mp4')  
    }
};

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

simulateLoadTest();

loadtest.loadTest(options, (error, result) => {
    if (error) {
        return console.error("Error during load test:", error);
    }
    console.log("Load test completed:", result);
    console.log("Total Requests:", result.totalRequests);
    console.log("Total Failures:", result.totalErrors);
});
