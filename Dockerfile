# FROM node:22-alpine
FROM node:22-alpine
WORKDIR /app
# RUN apk add --no-cache python3 make g++
# INSTALACION DE PAQUETES NECESARIOS PARA CERTIFICADOS
RUN apk update && apk add --no-cache python3 make g++ ca-certificates
COPY package*.json /app
RUN npm install
COPY . /app
EXPOSE 3000
CMD ["npm", "start"]
