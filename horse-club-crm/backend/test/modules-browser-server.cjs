require('reflect-metadata');
const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const express = require('express');
const path = require('node:path');
const { AppModule } = require('../dist/app.module');
(async () => {
  const app = await NestFactory.create(AppModule, { logger: ['error'] });
  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ transform: true, transformOptions: { enableImplicitConversion: true }, whitelist: true, forbidNonWhitelisted: true }));
  const frontend = path.resolve(__dirname, '../../frontend/dist');
  app.use(express.static(frontend));
  app.use((req, res, next) => req.method === 'GET' && !req.path.startsWith('/api/') ? res.sendFile(path.join(frontend, 'index.html')) : next());
  await app.listen(Number(process.env.PORT), '127.0.0.1');
})().catch(error => { console.error(error.message); process.exitCode = 1; });
