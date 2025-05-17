# Use a more secure and lightweight Node.js version
FROM node:20-alpine

# Set the working directory
WORKDIR /usr/src/app

# Install TypeScript globally
RUN npm install -g typescript

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Compile TypeScript to JavaScript
RUN tsc

# Expose the application port
EXPOSE 3000

# Command to run the application
CMD ["node", "dist/server.js"]