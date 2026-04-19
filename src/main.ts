import * as Sentry from '@sentry/node';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import * as jwt from 'jsonwebtoken';

// BigInt → Number lors de la sérialisation JSON (ex: fileSize Prisma BigInt)
(BigInt.prototype as any).toJSON = function () { return Number(this); };

// ─── Swagger JWT protection ───────────────────────────────────────────────────

function parseCookies(header: string = ''): Record<string, string> {
  return header.split(';').reduce(
    (acc, pair) => {
      const [k, ...rest] = pair.trim().split('=');
      if (k) acc[k.trim()] = decodeURIComponent(rest.join('=').trim());
      return acc;
    },
    {} as Record<string, string>,
  );
}

const SWAGGER_LOGIN_PAGE = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Cockpit API — Documentation</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:system-ui,sans-serif;background:#0f172a;display:flex;align-items:center;justify-content:center;min-height:100vh}
    .card{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:40px;width:100%;max-width:420px}
    .logo{font-size:22px;font-weight:700;color:#f8fafc;margin-bottom:4px}
    .sub{font-size:13px;color:#64748b;margin-bottom:28px}
    .field{margin-bottom:16px}
    label{display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em}
    input{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#f8fafc;padding:11px 14px;font-size:14px}
    input:focus{outline:none;border-color:#6366f1;box-shadow:0 0 0 3px rgba(99,102,241,.15)}
    input::placeholder{color:#475569}
    button{width:100%;margin-top:8px;padding:12px;background:#6366f1;color:#fff;border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer;transition:background .15s}
    button:hover:not(:disabled){background:#4f46e5}
    button:disabled{opacity:.6;cursor:not-allowed}
    .err{color:#f87171;font-size:13px;margin-top:14px;padding:10px 14px;background:rgba(248,113,113,.1);border-radius:6px;display:none}
    .sep{display:flex;align-items:center;gap:12px;margin:20px 0;color:#334155;font-size:12px}
    .sep::before,.sep::after{content:'';flex:1;height:1px;background:#1e3a5f}
    .token-area textarea{width:100%;background:#0f172a;border:1px solid #334155;border-radius:8px;color:#94a3b8;padding:10px 14px;font-size:12px;font-family:monospace;resize:vertical;min-height:72px}
    .token-area textarea:focus{outline:none;border-color:#6366f1}
    .token-btn{background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:13px;font-weight:500;margin-top:8px}
    .token-btn:hover:not(:disabled){background:#334155;color:#f8fafc}
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Cockpit API</div>
    <div class="sub">Documentation réservée aux membres de l'équipe</div>

    <form id="login-form">
      <div class="field">
        <label for="email">Email</label>
        <input id="email" type="email" placeholder="vous@organisation.com" autocomplete="email" required />
      </div>
      <div class="field">
        <label for="pass">Mot de passe</label>
        <input id="pass" type="password" placeholder="••••••••" autocomplete="current-password" required />
      </div>
      <button id="btn" type="submit">Se connecter →</button>
      <div class="err" id="err"></div>
    </form>

    <div class="sep">ou</div>

    <form id="token-form" class="token-area">
      <label style="display:block;font-size:12px;font-weight:600;color:#94a3b8;margin-bottom:6px;text-transform:uppercase;letter-spacing:.05em">Access token existant</label>
      <textarea id="tok" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." required></textarea>
      <button type="submit" class="token-btn">Utiliser ce token</button>
    </form>
  </div>
  <script>
    function setToken(tok) {
      document.cookie = 'swagger_token=' + encodeURIComponent(tok) + '; path=/; SameSite=Strict';
      window.location.href = '/docs';
    }

    function showErr(msg) {
      const el = document.getElementById('err');
      el.textContent = msg;
      el.style.display = 'block';
    }

    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const pass  = document.getElementById('pass').value;
      const btn   = document.getElementById('btn');
      const err   = document.getElementById('err');
      
      err.style.display = 'none';
      if (!email || !pass) { showErr('Email et mot de passe requis.'); return; }
      
      btn.disabled = true;
      btn.textContent = 'Connexion…';
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password: pass }),
        });
        
        const data = await res.json().catch(() => null);
        
        if (!res.ok) { 
          showErr(data?.message ? String(data.message) : 'Identifiants invalides.'); 
          return; 
        }
        if (!data || !data.accessToken) {
          showErr('Erreur inattendue du serveur.');
          return;
        }
        
        setToken(data.accessToken);
      } catch (err) {
        showErr('Impossible de joindre le serveur: ' + err.message);
      } finally {
        btn.disabled = false;
        btn.textContent = 'Se connecter →';
      }
    });

    document.getElementById('token-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const tok = document.getElementById('tok').value.trim();
      if (tok) setToken(tok);
    });
  </script>
</body>
</html>`;

// ─────────────────────────────────────────────────────────────────────────────

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
  });

  // Augmenter la limite pour les payloads d'ingest agent (batches jusqu'à 5000 lignes)
  app.use(require('express').json({ limit: '50mb' }));
  app.use(require('express').urlencoded({ extended: true, limit: '50mb' }));
  const configService = app.get(ConfigService);

  // Sentry — Error monitoring (initialiser dès que configService est disponible)
  const sentryDsn = configService.get<string>('SENTRY_DSN');
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      environment: configService.get<string>('NODE_ENV') || 'development',
    });
  }

  // Security headers — doit être placé AVANT enableCors
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'", "'unsafe-inline'"], // Swagger UI en a besoin
          imgSrc: ["'self'", 'data:', '*', 'http:', 'https:'],
        },
      },
    }),
  );

  app.setGlobalPrefix('api');

  // Enable CORS for frontend integration
  const allowedOrigins = [
    configService.get<string>('FRONTEND_URL') || 'http://localhost:3001',
    configService.get<string>('ADMIN_URL') || 'http://localhost:5173',
    // Production URLs (toujours autorisées même si les vars d'env sont absentes)
    'https://cockpit.nafakatech.com',
    'https://admin.cockpit.nafakatech.com',
    // Dev localhost
    'http://localhost:3001',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:3000',
  ];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl) or in allowed list
      if (
        !origin ||
        allowedOrigins.includes(origin) ||
        allowedOrigins.includes(String(origin))
      ) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  });

  // Global exception filter — sanitize error responses, no stack trace leak in production
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global validation (DTOs)
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // ─── Swagger API docs — protégée par JWT ──────────────────────────────────
  const jwtSecret = configService.get<string>('JWT_SECRET') ?? '';

  // Middleware de protection : vérifie le JWT depuis le header ou un cookie
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(
    ['/docs', '/docs-json', '/docs-yaml'],
    (req: any, res: any, next: any) => {
      const authHeader: string = req.headers['authorization'] ?? '';
      const cookies = parseCookies(req.headers['cookie']);
      const token =
        (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '') ||
        cookies['swagger_token'] ||
        '';

      if (token && jwtSecret) {
        try {
          jwt.verify(token, jwtSecret);
          next();
          return;
        } catch {
          // Token invalide → afficher la page de connexion
        }
      }

      res.status(401).type('html').send(SWAGGER_LOGIN_PAGE);
    },
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cockpit API')
    .setDescription('MVP Back-end DAF - SaaS BI Platform')
    .setVersion('1.0')
    .addBearerAuth()
    .addTag('Auth', 'Authentication & Authorization')
    .addTag('Users', 'User management')
    .addTag('Roles', 'RBAC role management')
    .addTag('Admin', 'Platform administration')
    .addTag('Agents', 'On-premise agent management')
    .addTag('Dashboards', 'Dashboard management')
    .addTag('Widget Store', 'Catalogue des KPIs et templates de widgets')
    .addTag('Widget Management', 'Gestion des widgets au sein des dashboards (Ajout, Edition, Suppression)')
    .addTag('NLQ', 'Natural Language Query')
    .addTag('Onboarding', 'Client onboarding wizard')
    .addTag('Logs', 'Audit logs')
    .addTag('Health', 'Health checks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { persistAuthorization: true },
  });
  // ──────────────────────────────────────────────────────────────────────────

  const port = configService.get<number>('PORT') || 3000;
  await app.listen(port);
  console.log(`🚀 Cockpit API: http://localhost:${port}/api`);
  console.log(`📖 Swagger docs: http://localhost:${port}/docs`);
}
bootstrap();
