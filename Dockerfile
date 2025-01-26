FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

ENV PORT=3000
ENV VITE_PORT=5173
ENV ROS_URL=http://user:password@host:port

EXPOSE ${PORT}/udp
EXPOSE ${VITE_PORT}

COPY docker-entrypoint.sh /
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]