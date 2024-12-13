# Start with a Node.js image as the base image for building the app
FROM node:18-alpine AS base

# Set the working directory inside the container
WORKDIR /app

# Install pnpm globally (preferred package manager for Turborepo)
RUN npm install -g pnpm

# Copy only the package manager lock files for caching dependencies
COPY pnpm-lock.yaml ./

# Install dependencies only
RUN pnpm fetch

# Copy the entire project into the container
COPY . .

# Install dependencies using pnpm
RUN pnpm install --offline

# Build the project using Turborepo
RUN pnpm turbo run build --filter=app/*

# Use a lightweight image for serving the app
FROM nginx:stable-alpine AS runner

# Copy built assets from the build stage
COPY --from=base /app/apps/app/dist /usr/share/nginx/html

# Expose port 5173
EXPOSE 5173

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
