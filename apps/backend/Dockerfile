# Start with the official Go image
FROM golang:1.23 AS build

# Set the working directory inside the container
WORKDIR /app

# Copy go.mod and go.sum files to the container
COPY go.mod go.sum ./

# Download dependencies
RUN go mod download

# Copy the entire application code to the container
COPY . .

# Build the application
RUN go build -o main .

# Use a lightweight image for the final container
FROM alpine:latest

# Set the working directory for the final image
WORKDIR /root/

# Copy the compiled binary from the build stage
COPY --from=build /app/main .

# Expose the port the application listens on
EXPOSE 4000

# Run the application
CMD ["./main"]
