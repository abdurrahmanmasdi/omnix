# Global Internationalization (i18n) Setup Guide

## Overview

This guide documents the global internationalization (i18n) implementation for the NestJS backend, supporting **English (en)**, **Turkish (tr)**, and **Arabic (ar)** languages.

---

## 📁 Project Structure

```
backend/
├── src/
│   ├── i18n/                          # Translation files directory
│   │   ├── en/
│   │   │   └── errors.json            # English error messages
│   │   ├── tr/
│   │   │   └── errors.json            # Turkish error messages
│   │   └── ar/
│   │       └── errors.json            # Arabic error messages
│   ├── app.module.ts                  # I18nModule configuration
│   ├── main.ts                        # I18nValidationPipe setup
│   ├── auth/
│   │   └── dtos/
│   │       └── register.dto.ts        # DTO with i18n validation messages
│   └── ...
├── nest-cli.json                      # Assets configuration for build
└── package.json                       # Dependencies
```

---

## 🚀 Implementation Details

### Step 1: Dependencies Installed

```bash
npm install nestjs-i18n
```

**Versions:**

- `nestjs-i18n`: ^12.x.x (latest)

---

### Step 2: Build Configuration (nest-cli.json)

The following configuration ensures translation JSON files are included in the compiled output:

```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "assets": [{ "include": "i18n/**/*", "watchAssets": true }]
  }
}
```

**Key Points:**

- `assets`: Copies all files from `src/i18n/` to `dist/i18n/`
- `watchAssets`: Watches for changes in `i18n/` files during development

---

### Step 3: Translation Files

All error messages are organized by language and category.

#### English (src/i18n/en/errors.json)

```json
{
  "USER_NOT_FOUND": "User could not be found.",
  "VALIDATION": {
    "IS_EMAIL": "Must be a valid email address.",
    "MIN_LENGTH": "Value must be at least {constraint1} characters long.",
    "MAX_LENGTH": "Value must not exceed {constraint1} characters.",
    "IS_STRING": "Must be a string.",
    "IS_STRONG_PASSWORD": "Password must contain uppercase, lowercase, numbers, and symbols.",
    "MATCHES": "Value must match pattern {constraint1}.",
    "IS_UNIQUE": "This value already exists."
  },
  "UNAUTHORIZED": "Unauthorized access.",
  "FORBIDDEN": "Access denied.",
  "NOT_FOUND": "Resource not found.",
  "CONFLICT": "Resource already exists.",
  "BAD_REQUEST": "Invalid request.",
  "INTERNAL_SERVER_ERROR": "An internal server error occurred."
}
```

#### Turkish (src/i18n/tr/errors.json)

```json
{
  "USER_NOT_FOUND": "Kullanıcı bulunamadı.",
  "VALIDATION": {
    "IS_EMAIL": "Geçerli bir e-posta adresi olmalıdır.",
    "MIN_LENGTH": "Değer en az {constraint1} karakter uzunluğunda olmalıdır.",
    "IS_STRING": "Metin olmalıdır.",
    "IS_STRONG_PASSWORD": "Şifre büyük harf, küçük harf, sayı ve sembol içermelidir."
  }
  ...
}
```

#### Arabic (src/i18n/ar/errors.json)

```json
{
  "USER_NOT_FOUND": "لم يتم العثور على المستخدم.",
  "VALIDATION": {
    "IS_EMAIL": "يجب أن يكون عنوان بريد إلكتروني صالحًا.",
    "IS_STRONG_PASSWORD": "يجب أن تحتوي كلمة المرور على أحرف كبيرة وصغيرة وأرقام ورموز."
  }
  ...
}
```

**Message Placeholders:**

- `{constraint1}`, `{constraint2}`, etc. - Auto-replaced with constraint values from validators
- Example: `"MinLength value is {constraint1}"` → `"MinLength value is 6"`

---

### Step 4: Global Module Configuration (src/app.module.ts)

```typescript
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n';
import * as path from 'path';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),
    // ... other modules

    // Internationalization (i18n)
    I18nModule.forRoot({
      fallbackLanguage: 'en',
      loaderOptions: {
        path: path.join(__dirname, '/i18n/'),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),

    // ... other modules
  ],
})
export class AppModule {}
```

**Configuration Details:**

- **fallbackLanguage**: Defaults to English if no language is detected
- **loaderOptions.path**: Points to the compiled `dist/i18n/` directory
- **loaderOptions.watch**: Enables hot-reload of translation files during development
- **resolvers**: `AcceptLanguageResolver` automatically reads the `Accept-Language` HTTP header

---

### Step 5: Global Validation Pipe (src/main.ts)

```typescript
import { I18nValidationPipe } from 'nestjs-i18n';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  // ... other setup code

  // Global Validation with i18n Support
  app.useGlobalPipes(
    new I18nValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000);
}
```

**I18nValidationPipe Features:**

- Automatically translates validation error messages
- Respects the `Accept-Language` header
- Falls back to English if language not supported
- Maintains all validation features of `ValidationPipe`

---

### Step 6: DTO with i18n Validation Messages

Use `i18nValidationMessage()` helper to reference translation keys:

#### Before (src/auth/dtos/register.dto.ts)

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString()
  last_name: string;
}
```

#### After (with i18n)

```typescript
import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { i18nValidationMessage } from 'nestjs-i18n';

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: i18nValidationMessage('errors.VALIDATION.IS_EMAIL') })
  email: string;

  @ApiProperty({ example: 'password123' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(6, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  password: string;

  @ApiProperty({ example: 'John' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  first_name: string;

  @ApiProperty({ example: 'Doe' })
  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  last_name: string;
}
```

---

## 🔄 How It Works

### 1. **Client Sends Request with Accept-Language Header**

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Accept-Language: tr" \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid", "password":"123", "first_name":"", "last_name":""}'
```

### 2. **I18nModule Reads Header**

- `AcceptLanguageResolver` extracts `Accept-Language: tr` from the request
- Sets the language context to Turkish

### 3. **Validation Fails (Invalid Data)**

```json
{
  "statusCode": 400,
  "message": [
    {
      "field": "email",
      "message": "Geçerli bir e-posta adresi olmalıdır."
    },
    {
      "field": "password",
      "message": "Değer en az 6 karakter uzunluğunda olmalıdır."
    }
  ],
  "error": "Bad Request"
}
```

### 4. **Response Uses Turkish Translations**

All validation error messages are automatically translated to Turkish based on the language context.

---

## 🎯 Usage Examples

### Example 1: Validate Email with English Messages

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Accept-Language: en" \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid-email", "password":"123", "first_name":"John", "last_name":"Doe"}'
```

**Response (English):**

```json
{
  "statusCode": 400,
  "message": [
    {
      "field": "email",
      "message": "Must be a valid email address."
    }
  ]
}
```

---

### Example 2: Same Request with Turkish

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Accept-Language: tr" \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid-email", "password":"123", "first_name":"John", "last_name":"Doe"}'
```

**Response (Turkish):**

```json
{
  "statusCode": 400,
  "message": [
    {
      "field": "email",
      "message": "Geçerli bir e-posta adresi olmalıdır."
    }
  ]
}
```

---

### Example 3: Default Language (No Accept-Language Header)

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"invalid-email", "password":"123", "first_name":"John", "last_name":"Doe"}'
```

**Response (English - Fallback):**

```json
{
  "statusCode": 400,
  "message": [
    {
      "field": "email",
      "message": "Must be a valid email address."
    }
  ]
}
```

---

## 📝 How to Add More Translations

### 1. **Add Message to All Language Files**

**src/i18n/en/errors.json:**

```json
{
  "CUSTOM": {
    "UNIQUE_CONSTRAINT": "This email is already registered."
  }
}
```

**src/i18n/tr/errors.json:**

```json
{
  "CUSTOM": {
    "UNIQUE_CONSTRAINT": "Bu e-posta zaten kayıtlıdır."
  }
}
```

**src/i18n/ar/errors.json:**

```json
{
  "CUSTOM": {
    "UNIQUE_CONSTRAINT": "هذا البريد الإلكتروني مسجل بالفعل."
  }
}
```

### 2. **Use in DTO or Exception Handler**

**DTO with custom validation:**

```typescript
@IsUnique({ message: i18nValidationMessage('errors.CUSTOM.UNIQUE_CONSTRAINT') })
email: string;
```

**Global Exception Filter:**

```typescript
throw new BadRequestException(this.i18n.t('errors.CUSTOM.UNIQUE_CONSTRAINT'));
```

---

## 🔧 Available Language Codes

| Language | Code | Supported  |
| -------- | ---- | ---------- |
| English  | `en` | ✅ Yes     |
| Turkish  | `tr` | ✅ Yes     |
| Arabic   | `ar` | ✅ Yes     |
| Others   | -    | ❌ Not yet |

**To add a new language:**

1. Create `src/i18n/{lang_code}/errors.json`
2. Add all keys from the English version with translations
3. Restart the application

---

## 📚 Validation Rules with i18n

All standard class-validator rules are supported:

| Rule                  | Translation Key                |
| --------------------- | ------------------------------ |
| `@IsEmail()`          | `errors.VALIDATION.IS_EMAIL`   |
| `@IsString()`         | `errors.VALIDATION.IS_STRING`  |
| `@MinLength(6)`       | `errors.VALIDATION.MIN_LENGTH` |
| `@MaxLength(50)`      | `errors.VALIDATION.MAX_LENGTH` |
| `@Matches(/pattern/)` | `errors.VALIDATION.MATCHES`    |
| `@IsUnique()`         | `errors.VALIDATION.IS_UNIQUE`  |

**Example with all validators:**

```typescript
export class ExampleDto {
  @IsEmail({}, { message: i18nValidationMessage('errors.VALIDATION.IS_EMAIL') })
  email: string;

  @IsString({ message: i18nValidationMessage('errors.VALIDATION.IS_STRING') })
  @MinLength(6, {
    message: i18nValidationMessage('errors.VALIDATION.MIN_LENGTH'),
  })
  @MaxLength(50, {
    message: i18nValidationMessage('errors.VALIDATION.MAX_LENGTH'),
  })
  name: string;

  @Matches(/^[A-Z0-9]+$/, {
    message: i18nValidationMessage('errors.VALIDATION.MATCHES'),
  })
  code: string;
}
```

---

## 🐛 Troubleshooting

### Issue: Translations not loading

**Solution:** Ensure `i18n/**/*` is in `nest-cli.json` assets and run `npm run build`

### Issue: Default to English instead of client language

**Check:** Verify `Accept-Language` header is being sent by the client

```bash
curl -i http://localhost:3000/auth/register -H "Accept-Language: tr"
```

### Issue: Custom validation messages not translating

**Check:** Ensure you're using `i18nValidationMessage('key.path')` in DTO decorators

### Issue: i18n module not found at runtime

**Check:** Ensure i18n files exist in `dist/i18n/` after building

```bash
npm run build && ls -la dist/i18n/
```

---

## ✨ Best Practices

1. **Keep translation keys organized**
   - Use nested objects: `VALIDATION.IS_EMAIL`
   - Group related messages together

2. **Use consistent naming**
   - `VALIDATION.*` for class-validator errors
   - `CUSTOM.*` for custom errors
   - `HTTP.*` for standard HTTP errors

3. **Maintain all languages**
   - Add translations to all language files simultaneously
   - Use same key structure across all languages

4. **Document changes**
   - Update translation files in version control
   - Track new language additions

5. **Test with different languages**
   - Always test with `Accept-Language: tr`, `ar`, `en`
   - Verify fallback to English works

---

## 📖 References

- [nestjs-i18n Documentation](https://github.com/tfarras/nestjs-i18n)
- [NestJS Validation Pipe](https://docs.nestjs.com/techniques/validation)
- [RFC 7231 Accept-Language Header](https://tools.ietf.org/html/rfc7231#section-5.3.5)
- [class-validator Documentation](https://github.com/typestack/class-validator)

---

## ✅ Verification Checklist

- ✅ Dependencies installed (`npm install nestjs-i18n`)
- ✅ `nest-cli.json` updated with assets configuration
- ✅ Translation files created in `src/i18n/{en,tr,ar}/errors.json`
- ✅ `I18nModule` imported in `AppModule`
- ✅ `AcceptLanguageResolver` configured
- ✅ `I18nValidationPipe` used in `main.ts`
- ✅ `RegisterDto` updated with `i18nValidationMessage()`
- ✅ Tests pass with i18n enabled
- ✅ Build successful (`npm run build`)
