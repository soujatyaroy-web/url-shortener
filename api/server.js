require('dotenv').config();
require('ts-node/register');

const Fastify = require('fastify');
const cors = require('@fastify/cors');

const urlRoutes = require('../src/routes/urlRoutes.ts').default;
const redirectRoutes = require('../src/routes/redirectRoutes.ts').default;

const app = Fastify({ logger: true });

app.register(cors, {
  origin: true,
  methods: ['GET', 'POST', 'OPTIONS'],
});

app.register(urlRoutes);
app.register(redirectRoutes);

const PORT = Number(process.env.PORT || 3000);

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
