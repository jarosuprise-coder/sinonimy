@echo off
chcp 65001 >nul
title Установка надстройки «Синонимы» для Word
setlocal
set "DIR=C:\Sinonimy"
set "KEY=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"

echo.
echo  Установка надстройки «Синонимы» для Word
echo  ----------------------------------------
echo.

if not exist "%~dp0manifest.xml" (
  echo  [Ошибка] Рядом с этим файлом нет manifest.xml.
  echo  Сначала распакуйте архив целиком, потом запускайте установку.
  echo.
  pause
  exit /b 1
)

if not exist "%DIR%" mkdir "%DIR%" 2>nul
if not exist "%DIR%" (
  echo  [Ошибка] Не удалось создать папку %DIR%.
  echo  Нажмите на этот файл правой кнопкой и выберите «Запуск от имени администратора».
  echo.
  pause
  exit /b 1
)

copy /Y "%~dp0manifest.xml" "%DIR%\manifest.xml" >nul
if errorlevel 1 (
  echo  [Ошибка] Не удалось скопировать manifest.xml в %DIR%.
  echo.
  pause
  exit /b 1
)
echo  [OK] Манифест скопирован в %DIR%

reg add "%KEY%" /v "%DIR%\manifest.xml" /t REG_SZ /d "%DIR%\manifest.xml" /f >nul
if errorlevel 1 (
  echo  [Ошибка] Не удалось подключить надстройку к Word.
  echo.
  pause
  exit /b 1
)
echo  [OK] Надстройка подключена к Word

echo.
tasklist /FI "IMAGENAME eq WINWORD.EXE" 2>nul | find /I "WINWORD.EXE" >nul
if not errorlevel 1 (
  echo  Word сейчас открыт. Сохраните документы, закройте ВСЕ окна Word
  echo  и откройте Word заново, иначе кнопка не появится.
) else (
  echo  Готово. Откройте Word.
)
echo.
echo  Кнопка «Синонимы» появится на вкладке «Главная» справа.
echo  Если её нет: Главная - Надстройки - «Надстройки разработчика» - «Синонимы».
echo.
pause
