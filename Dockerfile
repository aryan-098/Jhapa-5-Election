FROM node:20-alpine

# Create app directory
WORKDIR /app

# Install app dependencies
COPY package*.json ./
RUN npm install --production

# Bundle app source
COPY . .

# Expose the API port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
