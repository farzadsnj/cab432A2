
# A2 Response to Criteria

## Core - First Data Persistence Service
S3 is used for storing video files. In the AWS console, S3 is configured to handle video file storage, and video files are uploaded through the application.
- **Details Page**: The S3 bucket created is named `my-app-videos`.
- **Stored Data**: The video files uploaded by users are stored in this S3 bucket.

## Core - Second Data Persistence Service
DynamoDB is used for storing video metadata. The metadata includes file names, sizes, upload times, and users associated with the files.
- **Details Page**: The DynamoDB table created is `n11521147_file_metadata`.
- **Stored Data**: Each uploaded video has metadata stored in DynamoDB.

## Third Data Persistence Service (If Attempted)
EBS is used for storing machine learning models that are accessed by the video processing system.
- **Details Page**: The EBS volume attached to the EC2 instance for model storage.
- **Stored Data**: Machine learning models required for video transcoding.

## S3 Pre-signed URLs (If Attempted)
Pre-signed URLs are used for uploading and downloading video files to S3 securely.
- **Tasks**: Upload and download operations use pre-signed URLs to avoid exposing the S3 bucket directly.
- **Evidence**: Network requests for uploading/downloading files using pre-signed URLs are shown in the browser's developer tools.

## In-memory Cache (If Attempted)
Redis is used to cache requests to DynamoDB for video metadata retrieval.
- **Cache Use**: Redis stores frequently requested video metadata to reduce DynamoDB calls.
- **Evidence**: Redis cache entries can be shown using `redis-cli` command.

## Core - Statelessness
The application follows a stateless architecture where each request is independent, and no session state is maintained on the server.

## Graceful Handling of Persistent Connections
Handled through the use of managed services like AWS RDS and S3, which ensure persistent connections are gracefully handled.

## Core - Authentication with Cognito
Cognito is used for user authentication. Users are registered in a user pool, and their email addresses are verified through the app.
- **Details Page**: The Cognito user pool is named `n11521147-a2`.
- **Evidence**: A new user is registered in the app, and the user is listed in the Cognito user pool, with email verification shown.

## Route 53 DNS
The application is accessed using a custom subdomain configured with Route 53.
- **Subdomain**: The subdomain `app.myapp.com` points to the EC2 instance running the application.

## Custom Security Groups
Custom security groups are created and assigned to the EC2 instance and RDS.
- **Details Page**: The security group allows incoming connections on ports 80 (HTTP) and 3306 (MySQL).
- **Evidence**: The security group is shown in the AWS console, and its rules are applied to the EC2 and RDS instances.

## Parameter Store
The application uses AWS Parameter Store to manage environment variables like database connection strings.
- **Parameters**: The parameter `DB_CONNECTION_STRING` is used to connect to the RDS instance securely.

## Secrets Manager
Secrets Manager is used to store sensitive information like API keys.
- **Secrets**: The API key for a third-party video processing service is stored securely in Secrets Manager.

