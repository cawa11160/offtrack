FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN chown -R node:node /app
USER node

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host", "::", "--port", "8080"]
