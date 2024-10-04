# Stage 1: Build the application
FROM node:18-alpine AS builder

# Install dependencies for building native addons
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install all dependencies including dev dependencies
RUN npm install

# Copy the remaining project files, including the db folder
COPY . .

# Rebuild sqlite3 for Alpine
RUN npm rebuild sqlite3

# Remove development dependencies to reduce image size
RUN npm prune --production

# Stage 2: Create the final optimized image
FROM node:16-alpine

# Set working directory
WORKDIR /usr/src/app

# Copy only the built artifacts from the builder stage
COPY --from=builder /usr/src/app /usr/src/app

# Expose port 3000
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
