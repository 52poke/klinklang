FROM node:lts

RUN mkdir -p /app
WORKDIR /app

RUN npm i pnpm -g

COPY . /app
RUN pnpm install

ENV NODE_ENV=production
RUN pnpm build

EXPOSE 3000
VOLUME ["/app/config.json", "/app/workflow.yml"]

CMD [ "pnpm", "serve" ]
