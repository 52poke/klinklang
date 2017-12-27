FROM node:alpine

RUN mkdir -p /app
WORKDIR /app

COPY package.json /app/
COPY package-lock.json /app/

RUN npm install && npm cache clean --force

COPY . /app
ENV NODE_ENV production
RUN npm run build && npm run init

EXPOSE 3001
VOLUME ["/app/config.json"]

CMD [ "npm", "start" ]