# Horse Club CRM: Android и PWA

Приложение персонала: `ru.horseclub68.staff`, имя `Horse Club CRM`. Роли и права
остаются серверными: администратор и тренер входят через обычный экран CRM.
Миграции Prisma не требуются. Перед использованием APK необходимо развернуть
изменения backend (CORS, проверка origin, cookie для native origin).

## Требования Windows

- Node.js 22+ и npm, Android Studio 2025.2.1+ с JDK 21.
- Android SDK Platform 36, Build Tools и Platform Tools через SDK Manager.
- Устройство/эмулятор Android 7+ (API 24+), актуальный Android System WebView.
- Для командной строки `JAVA_HOME` указывает на JDK 21 (например, `jbr` Android Studio),
  `ANDROID_HOME` — на SDK. Android Studio может записать путь SDK в
  `frontend/android/local.properties`; этот файл не коммитится.

Версии взяты из установленного Capacitor 8 и сгенерированного проекта:
compile/target SDK 36, Gradle 8.14.3, Android Gradle Plugin 8.13.0.
Документация: [окружение](https://capacitorjs.com/docs/getting-started/environment-setup),
[Android](https://capacitorjs.com/docs/android).

## Подготовка бандла

Из корня репозитория в PowerShell (используется `.cmd`, чтобы не зависеть от ExecutionPolicy):

```powershell
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run android:sync
npm.cmd --prefix frontend run android:open
```

`android:sync` выполняет `vite build --mode mobile` и `cap sync android`.
`.env.mobile` содержит публичный URL `VITE_API_URL=https://crm.horseclub68.ru/api`.
Vite встраивает его во время сборки. Секреты в `VITE_*` добавлять нельзя.
Перед каждым APK повторяйте `android:sync`: обычная веб-сборка перезаписывает `dist`
вариантом с `/api`, который не подходит для локального origin WebView.
`cap add android` уже выполнен; повторно генерировать проект не нужно.

Для другой среды временно задайте `$env:VITE_API_URL = 'https://host.example/api'`
перед `android:sync`, затем `Remove-Item Env:VITE_API_URL`. API должен быть HTTPS.
Не задавайте `server.url`: приложение загружает упакованный `dist`, а не удалённый сайт.

## Debug APK

В Android Studio откройте `frontend/android`, дождитесь Gradle Sync и выберите
Build → Generate App Bundles or APKs → Generate APKs либо запустите на устройстве.
Альтернатива из корня репозитория:

```powershell
Set-Location frontend/android
.\gradlew.bat assembleDebug
```

APK: `frontend/android/app/build/outputs/apk/debug/app-debug.apk`.
Установка: `adb install -r app/build/outputs/apk/debug/app-debug.apk` из `frontend/android`.
В Git остаются исходники Android и Gradle Wrapper; SDK, сборки и скопированный
web-бандл исключены. Интернет нужен для загрузки зависимостей Gradle и работы CRM.

## Release APK

1. Обновите `versionCode` и `versionName` в `android/app/build.gradle`.
2. Выполните `npm.cmd --prefix frontend run android:sync` из корня репозитория.
3. Android Studio → Build → Generate Signed App Bundle / APK → APK → release.
4. Создайте или выберите keystore вне репозитория, задайте alias и пароли в мастере.
   Сохраните резервную копию ключа: обновления приложения подписываются тем же ключом.
5. Выберите каталог результата и проверьте подписанный APK на устройстве.

`.\gradlew.bat assembleRelease` без настройки подписи создаёт **неподписанный**
`app/build/outputs/apk/release/app-release-unsigned.apk`; для установки требуется
подпись через мастер Android Studio либо Android SDK `zipalign`/`apksigner`.
Пароли, `.jks`, `.keystore` и `keystore.properties` не коммитятся.

## API, cookie и мобильный UX

- `src/apiUrl.ts` — общий владелец API root. Веб по умолчанию использует `/api`;
  REST/Refine, login/logout/refresh, SSE, upload и запросы Telegram используют этот root.
  `/uploads/...` разрешается от origin backend, без добавления `/api`.
  Внешние HTTP(S) фото сохраняют исходные URL. Экспорт веткарты создаёт локальный Blob
  из уже полученных API-данных; отдельного HTTP URL экспорта нет.
- Backend разрешает только основной домен и `https://localhost`, `http://localhost`,
  `capacitor://localhost`; CORS и проверка мутаций используют один список.
  Cookie native-сессий в production: HttpOnly, Secure, SameSite=None; веб — Strict.
  Проверка origin сохраняется для мутаций, включая запрет cookie-запроса без origin.
  Токены не переносятся в localStorage. Android WebView Capacitor разрешает third-party
  cookies; реальный login/refresh/SSE обязательно проверьте на целевом устройстве.
- Back сначала передаёт Escape существующему оверлею (сохраняются его проверки
  незавершённого ввода), затем использует историю BrowserRouter. В корне не закрывает приложение.
  Закрытие заблокированной шторки не форсируется. Подписка снимается при размонтировании.
- `viewport-fit=cover`, CSS safe-area для shell/шторок/диалогов и SystemBars native
  обрабатывают вырезы и системные панели, включая старые WebView. Ориентация адаптивная
  (`fullUser`): поворот разрешён в соответствии с настройкой устройства, планшеты поддерживаются.
- Нативные сохранение/шаринг Blob-файлов и печать через Android print framework
  не добавлялись: экспорт и печать сохраняют существующее браузерное поведение.

## PWA и проверки

`public/manifest.webmanifest` подключён в `index.html`; иконки 192/512 повторяют
существующий знак H в палитре Horse Club OS (`#241E1C`, `#E4DAD0`). Фон `#F7F4F0`.
Манифест задаёт standalone, theme-color и Apple meta. Откройте HTTPS-сайт в браузере
и используйте установку/«На главный экран». Service worker и офлайн-кэш API не
добавлены: CRM требует сети, финансовые и персональные данные не кэшируются новым слоем.

```powershell
npm.cmd --prefix backend run lint
npm.cmd --prefix backend run typecheck
npm.cmd --prefix backend run build
npm.cmd --prefix backend test
npm.cmd --prefix frontend run lint
npm.cmd --prefix frontend run typecheck
npm.cmd --prefix frontend run build
npm.cmd --prefix frontend run build:mobile
npm.cmd --prefix frontend test
Set-Location frontend
npx.cmd playwright test --config=playwright.mobile.config.ts
```

Браузерные mock-сценарии проверяют манифест, PNG, Back на корне, модалку, шторку,
историю маршрутов, загрузку фотографий и кабинеты персонала. На Android дополнительно
проверьте реальный вход/refresh/logout, SSE, Back с вложенными окнами, клавиатуру,
вырезы, поворот и восстановление сети. Mock-тесты не заменяют проверку APK на устройстве.

## Результат проверки подготовки (26.11.2026)

- Все девять запрошенных команд lint/typecheck/build/test выполнены успешно,
  включая отдельные web и mobile build. Backend lint содержит три прежних предупреждения.
- Backend: 970 passed, 27 skipped (PostgreSQL-сценарии без настроенной БД), 0 failed.
- Frontend: 33 файла, 257 unit-тестов passed.
- Playwright: 26/26 выбранных mock-сценариев passed. Дополнительно повторён mobile-shell
  после проверки вложенной шторки поверх модалки: 2/2 passed.
- В старых тестах публикации услуг дополнена фикстура обязательным `serviceDirection`
  и уточнён textbox-селектор названия, чтобы исключить совпадение с заголовком таблицы.
- `cap add android` и `cap sync android` выполнены; оба native-плагина обнаружены.
- Дополнительный strict UI-аудит возвращает прежние 280 замечаний (столько же в
  существующем `premium-audit.json`); он не считается пройденным. Отчёт текущего запуска:
  `test-results/android-ui-check.json`. Существующая классификация: `docs/ui-audit-cleanup.md`.
- Gradle не запущен: `JAVA_HOME` не задан, `java` отсутствует в PATH. Debug/release APK
  и поведение на физическом Android не проверены; требуется описанное выше окружение.
- Схема Prisma не менялась, миграция и генерация Prisma Client не требуются.
