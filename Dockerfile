# Stage 1: Build the application
FROM node:16-alpine AS builder

# Install dependencies for building native addons
RUN apk add --no-cache python3 make g++

# Set the working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install all dependencies (including dev dependencies)
RUN npm install

# Copy the rest of the application code
COPY . .

# Rebuild native modules for Alpine Linux
RUN npm rebuild sqlite3

# Remove development dependencies to reduce image size
RUN npm prune --production

# Stage 2: Create the final optimized image
FROM node:16-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy the node modules and application code from the builder stage
COPY --from=builder /usr/src/app /usr/src/app

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
