const {
    CognitoIdentityProviderClient,
    SignUpCommand,
    InitiateAuthCommand,
    ConfirmSignUpCommand,
    GlobalSignOutCommand
} = require("@aws-sdk/client-cognito-identity-provider");
const { CognitoJwtVerifier } = require("aws-jwt-verify");
const { loadConfig } = require("./config");
require("dotenv").config();

let cognitoClient, clientId, userPoolId, jwtVerifier, verifier;

const initializeConfig = async () => {
    try {
        const config = await loadConfig();
        cognitoClient = new CognitoIdentityProviderClient({
            region: process.env.AWS_REGION
        });
        clientId = config.cognitoClientId;
        userPoolId = config.cognitoUserPoolId;

        jwtVerifier = CognitoJwtVerifier.create({
            userPoolId: userPoolId,
            tokenUse: "access",
            clientId: clientId,
            issuer: `https://cognito-idp.${process.env.AWS_REGION}.amazonaws.com/${userPoolId}`
        });

        verifier = jwtVerifier;

        console.log("Configuration initialized successfully.");
    } catch (err) {
        console.error("Error loading configuration:", err);
        throw new Error("Failed to load configuration.");
    }
};

initializeConfig().catch((err) => {
    console.error("Failed to initialize config:", err);
});

const registerUser = async (username, password, callback) => {
    try {
        const params = {
            ClientId: clientId,
            Username: username,
            Password: password,
            UserAttributes: [
                { Name: "email", Value: username },
                { Name: "emails", Value: username } 
            ]
        };
        const command = new SignUpCommand(params);
        await cognitoClient.send(command);
        callback(null);  
    } catch (error) {
        console.error("Registration failed:", error);
        callback(new Error(error.message));
    }
};

const generateAccessToken = async (username, password, callback) => {
    try {
        const params = {
            AuthFlow: "USER_PASSWORD_AUTH",
            ClientId: clientId,
            AuthParameters: {
                USERNAME: username,
                PASSWORD: password
            }
        };
        const command = new InitiateAuthCommand(params);
        const response = await cognitoClient.send(command);

        const accessToken = response.AuthenticationResult.AccessToken;
        const idToken = response.AuthenticationResult.IdToken;
        const refreshToken = response.AuthenticationResult.RefreshToken;

        // Send tokens back to client
        callback(null, { accessToken, idToken, refreshToken });
    } catch (error) {
        console.error("Login failed:", error);
        callback(new Error(error.message)); 
    }
};

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.token) {
        token = req.cookies.token;
    }

    console.log('Cookies received:', req.cookies);
    console.log(`Received token: ${token}`);

    if (!token) {
        return res.status(401).json({ error: "No token provided" });
    }

    try {
        const payload = await verifier.verify(token);
        console.log('JWT Payload:', payload);
        const username = payload.username || payload['cognito:username'] || payload['sub'];

        if (!username) {
            console.error('Username not found in token payload');
            return res.status(403).json({ error: "Invalid token payload" });
        }
        const adminUsers = ['n11521147@qut.edu.au']; 

        // Set role
        const role = adminUsers.includes(username) ? 'admin' : 'user';
        req.user = {
            username: username,
            role: role,
        };

        console.log('Authenticated user:', req.user);

        next();
    } catch (error) {
        console.error("JWT verification failed:", error);
        res.status(403).json({ error: "Invalid token" });
    }
};

const logoutUser = async (accessToken, callback) => {
    try {
        const params = {
            AccessToken: accessToken
        };
        const command = new GlobalSignOutCommand(params);
        await cognitoClient.send(command);
        callback(null, { message: "Logged out successfully" });
    } catch (error) {
        console.error("Logout failed:", error);
        callback(new Error(error.message));
    }
};

function authorizeAdmin(req, res, next) {
    if (req.user && req.user.role === 'admin') {
        return next();
    } else {
        return res.status(403).json({ error: 'Access denied. Admins only.' });
    }
}

module.exports = {
    registerUser,
    generateAccessToken,
    authenticateToken,
    logoutUser,
    authorizeAdmin,
};
