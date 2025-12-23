FROM node:18-alpine

WORKDIR /app

# Copy app
COPY . /app/

# Environment
ENV HOST=0.0.0.0
ENV PORT=8001

# Expose port
EXPOSE 8001

# Run Node server
CMD ["node", "server.js"]
