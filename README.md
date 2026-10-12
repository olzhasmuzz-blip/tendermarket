# TenderMarket

Универсальная площадка закупок: веб-клиент и общий API для будущего Flutter-клиента.

## Локальный запуск

Требуется Node.js 20+ и Docker Compose.

```powershell
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

На Windows без Docker можно использовать локальный PostgreSQL 17. Установите PostgreSQL, затем запустите `npm run db:local:start`; команда создаст пользовательский кластер в `%LOCALAPPDATA%\TenderMarket`, выделит API порт `5433` и сохранит подключение в `apps/api/.env`. Дальше выполните команды миграции, seed и запуска из примера выше. Остановить базу можно через `npm run db:local:stop`.

Для HTTP smoke-проверки основного сценария запустите API и выполните `npm run test:e2e:local`. Скрипт создаёт тестовые аккаунты и две тестовые заявки в локальной базе.

Веб-клиент: `http://localhost:5173`  
API: `http://localhost:3001/api/v1`  
OpenAPI: `http://localhost:3001/api/docs`  
Health check: `http://localhost:3001/api/v1/health`

Переменные API находятся в `apps/api/.env.example`. Для локальной разработки используется `apps/api/.env`, который не коммитится. В production обязательно задайте длинный случайный `JWT_SECRET`, разрешённый список `WEB_ORIGIN`, managed PostgreSQL, Redis и приватное S3-совместимое хранилище.

## Архитектура

- `web/` — React, TypeScript, Vite, responsive UI.
- `apps/api/` — NestJS, Prisma, PostgreSQL, REST API с OpenAPI.
- `docker-compose.yml` — локальные PostgreSQL, Redis и MinIO.
- `CONTEXT.md` — доменные определения и инварианты.
- `.scratch/universal-marketplace/` — утверждённая спецификация, карта готовности и локальные задачи.

## Готовность

Текущая карта проекта: `.scratch/universal-marketplace/map.md`. Production-сборки и Prisma-схема проходят локальные проверки. Перед выпуском нужно выполнить миграции и сценарии на работающих сервисах, завершить оставшиеся клиентские потоки и настроить внешние каналы уведомлений и оплаты.
