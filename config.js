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

const awsRegion = process.env.AWS_REGION || "ap-southeast-2";

const secretsManager = new SecretsManagerClient({ region: awsRegion });
const ssmClient = new SSMClient({ region: awsRegion });

const getSecret = async (secretName) => {
  try {
    const data = await secretsManager.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );
    if (data.SecretString) {
      console.log(`Secret ${secretName} fetched successfully.`);
      return JSON.parse(data.SecretString); 
    } else {
      console.warn(`Secret ${secretName} contains no secret string.`);
      return {};
    }
  } catch (err) {
    console.error(`Error fetching secret (${secretName}):`, err);
    return {};
  }
};

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

const loadConfig = async () => {
  try {
     let secrets = await getSecret(process.env.AWS_SECRETS_NAME);

     secrets = {
        awsAccessKeyId: secrets.awsAccessKeyId || process.env.AWS_ACCESS_KEY_ID,
        awsSecretAccessKey: secrets.awsSecretAccessKey || process.env.AWS_SECRET_ACCESS_KEY,
        awsSessionToken: secrets.awsSessionToken || process.env.AWS_SESSION_TOKEN,
        cognitoClientId: secrets.cognitoClientId || process.env.COGNITO_CLIENT_ID,
        cognitoUserPoolId: secrets.cognitoUserPoolId || process.env.COGNITO_USER_POOL_ID,
     };

     console.log("AWS Access Key ID:", secrets.awsAccessKeyId);

     if (!secrets.awsAccessKeyId || !secrets.awsSecretAccessKey) {
        console.error("AWS credentials are missing. Please check your secrets or environment variables.");
        throw new Error("AWS credentials are missing.");
     }

     const s3BucketName = await getParameter(process.env.S3_BUCKET_PARAM_NAME || "/app/s3/n11521147-a2");

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
