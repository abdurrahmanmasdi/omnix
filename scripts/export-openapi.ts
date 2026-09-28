import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { AppModule } from '../src/app.module';

async function main() {
  const destination = process.argv[2];
  if (!destination) throw new Error('Output path required');
  const app = await NestFactory.create(AppModule, { logger: false });
  try {
    const config = new DocumentBuilder()
      .setTitle('Lean Commerce API')
      .setDescription('The AI Sales Agent CRM API Documentation')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    writeFileSync(destination, JSON.stringify(document, null, 2) + '\n');
  } finally {
    await app.close();
  }
}
void main().catch(() => {
  process.stderr.write('OPENAPI_EXPORT_FAILED\n');
  process.exitCode = 1;
});
