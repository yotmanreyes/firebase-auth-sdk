# Firebase Authentication Microservice

A Node.js microservice for handling Firebase Authentication with a RESTful API.

## Features

- User management (create, read, update, delete)
- Custom token generation
- Token verification
- Secure endpoints
- Environment-based configuration

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- Firebase project with Authentication enabled
- Firebase Admin SDK credentials

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Copy `.env.example` to `.env` and update with your Firebase Admin SDK credentials
4. Start the server:
   ```bash
   npm start
   ```
   For development with auto-reload:
   ```bash
   npm run dev
   ```

## Environment Variables

Create a `.env` file in the root directory with the following variables:

```
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=your-private-key
PORT=3000
NODE_ENV=development
```

## API Endpoints

- `POST /users` - Create a new user
- `GET /users/:uid` - Get user by UID
- `PUT /users/:uid` - Update user
- `DELETE /users/:uid` - Delete user
- `POST /custom-token` - Generate custom token
- `POST /verify-token` - Verify ID token

## Example Requests

### Create User
```http
POST /users
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "displayName": "John Doe"
}
```

### Get User
```http
GET /users/{uid}
```

### Generate Custom Token
```http
POST /custom-token
Content-Type: application/json

{
  "uid": "user-uid-123",
  "additionalClaims": {
    "premium": true,
    "role": "admin"
  }
}
```

## Security

- Always use HTTPS in production
- Keep your Firebase Admin credentials secure
- Implement rate limiting in production
- Use proper CORS configuration for your frontend domain

## License

MIT
