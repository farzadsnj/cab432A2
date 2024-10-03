// config.js
console.log("Config.js is being loaded");
const {
  SecretsManagerClient,
  GetSecretValueCommand,
} = require("@aws-sdk/client-secrets-manager");
const {
  SSMClient,
  GetParameterCommand,
} = require("@aws-sdk/client-ssm");
const AWS = require('aws-sdk');
require("dotenv").config();

// Set AWS region from environment variables or default to ap-southeast-2
const awsRegion = process.env.AWS_REGION || "ap-southeast-2";

// Initialize AWS SDK clients for Secrets Manager and SSM
const secretsManager = new SecretsManagerClient({ region: awsRegion });
const ssmClient = new SSMClient({ region: awsRegion });

// Helper to fetch secrets from AWS Secrets Manager
const getSecret = async (secretName) => {
  try {
    const data = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    if (data.SecretString) {
      console.log(`Secret ${secretName} fetched successfully.`);
      return JSON.parse(data.SecretString); // assuming secrets are stored as JSON
    } else {
      console.warn(`Secret ${secretName} contains no secret string.`);
      return {};
    }
  } catch (err) {
    console.error(`Error fetching secret (${secretName}):`, err);
    return {};
  }
};

// Helper to fetch parameters from AWS SSM Parameter Store
const getParameter = async (paramName) => {
  try {
    const data = await ssmClient.send(
      new GetParameterCommand({ Name: paramName, WithDecryption: true })
    );
    console.log(`Parameter ${paramName} fetched successfully.`);
    return data.Parameter.Value;
  } catch (err) {
    console.error(`Error fetching parameter (${paramName}):`, err);
    throw new Error(`Failed to fetch parameter: ${paramName}`);
  }
};

// Function to fetch configuration (secrets and parameters)
const loadConfig = async () => {
  try {
    // Fetch secrets from Secrets Manager
    let secrets = await getSecret(process.env.AWS_SECRETS_NAME);

    // Merge secrets with environment variables (environment variables take precedence)
    secrets = {
      awsAccessKeyId: secrets.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID,
      awsSecretAccessKey: secrets.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
      awsSessionToken: secrets.awsSessionToken || process.env.AWS_SESSION_TOKEN,
      cognitoClientId: secrets.cognitoClientId || process.env.COGNITO_CLIENT_ID,
      cognitoUserPoolId: secrets.cognitoUserPoolId || process.env.COGNITO_USER_POOL_ID,
    };

    // Validate that AWS credentials are available
    if (!secrets.awsAccessKeyId || !secrets.awsSecretAccessKey) {
      console.error("AWS credentials are missing. Please check your secrets or environment variables.");
      throw new Error("AWS credentials are missing.");
    }

    // Fetch additional configuration parameters from SSM Parameter Store
    const s3BucketName = await getParameter(process.env.S3_BUCKET_PARAM_NAME || "/app/s3/n11521147-a2");

    // Return the configuration
    return {
      awsAccessKeyId: secrets.awsAccessKeyId,
      awsSecretAccessKey: secrets.awsSecretAccessKey,
      awsSessionToken: secrets.awsSessionToken,
      awsRegion: awsRegion,
      cognitoClientId: secrets.cognitoClientId,
      cognitoUserPoolId: secrets.cognitoUserPoolId,
      s3BucketName,
    };
  } catch (error) {
    console.error("Error loading configuration:", error);
    throw new Error("Failed to load configuration.");
  }
};

module.exports = { loadConfig };
