## Адаптер MAX (long polling)

Подключение чат-бота ФитПилот к [MAX Bot API](https://dev.max.ru/docs-api).

### Получение токена

После модерации бота:

1. [business.max.ru](https://business.max.ru) → **Чат-боты** → ваш бот
2. **Расширенные настройки** → **Настроить**
3. Скопируйте **токен**

### Переменные окружения

```env
MAX_BOT_TOKEN=ваш-токен
# MAX_API_BASE_URL=https://platform-api.max.ru
```

### Запуск

```bash
npm run dev
```

Если задан `MAX_BOT_TOKEN`, бот слушает MAX через long polling (удобно для тестов с десктопа).

VK и MAX могут работать **одновременно** — у каждого свой токен.

### Production

Для продакшена MAX рекомендует **Webhook** (`POST /subscriptions`). Long polling и webhook нельзя использовать одновременно.

### Ссылка на бота

После модерации: `https://max.ru/idИНН_bot` — вставьте в `site/index.html`.
