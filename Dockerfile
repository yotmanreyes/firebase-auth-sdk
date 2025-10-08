FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json /app
RUN npm install
COPY . /app
EXPOSE 3000
CMD ["npm", "start"]
