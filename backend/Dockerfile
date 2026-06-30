# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc

# Production stage
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY --from=builder /app/dist ./dist
# If no dist because tsc writes to root depending on tsconfig, we should adjust.
# Since we ran `npx tsc --init` without outDir, it compiles beside .ts files. 
# Let's just copy everything that is .js
COPY --from=builder /app .

EXPOSE 4000
CMD ["node", "src/index.js"]
