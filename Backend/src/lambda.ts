import awsLambdaFastify from '@fastify/aws-lambda';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { buildApp } from './server.js';

let proxy: ((event: APIGatewayProxyEvent, context: Context) => Promise<any>) | null = null;

export const handler = async (event: APIGatewayProxyEvent, context: Context) => {
  if (!proxy) {
    const app = await buildApp();
    await app.ready();
    proxy = awsLambdaFastify(app);
  }
  return proxy(event, context);
};
