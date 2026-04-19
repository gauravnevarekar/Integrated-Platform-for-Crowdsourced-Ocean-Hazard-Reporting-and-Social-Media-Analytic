FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173

# We run in host mode so docker exposes it properly
CMD ["npm", "run", "dev", "--", "--host"]
