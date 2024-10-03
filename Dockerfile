FROM node:16-alpine

# Install dependencies for building native addons
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install node modules
RUN npm install

# Rebuild sqlite3 for Alpine
RUN npm rebuild sqlite3

# Copy the remaining project files
COPY . .

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
