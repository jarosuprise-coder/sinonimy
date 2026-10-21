@echo off
chcp 65001 >nul
title Установка надстройки «Синонимы» для Word
setlocal
set "DIR=C:\Sinonimy"
set "KEY=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"
set "WEF=%LOCALAPPDATA%\Microsoft\Office\16.0\Wef"

echo.
echo  Установка надстройки «Синонимы» для Word, версия 1.2
echo  ---------------------------------------------------
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

rem Убираем старые подключения «Синонимов» из других папок, чтобы в Word не было дублей
set "SIN_KEEP=%DIR%\manifest.xml"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$k='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer';$keep=$env:SIN_KEEP;$c=0;if(Test-Path $k){$p=Get-ItemProperty $k;foreach($n in $p.PSObject.Properties.Name){if($n -like 'PS*'){continue};$v=[string]$p.$n;if($keep -and $v -eq $keep){continue};$d=$false;if($v -match 'sinonim'){$d=$true}elseif($v -like '*.xml' -and (Test-Path -LiteralPath $v)){try{if((Get-Content -LiteralPath $v -Raw) -match '47dd82ec-96c6-4899-89d8-ef6fe1fcd0a8'){$d=$true}}catch{}};if($d){Remove-ItemProperty -Path $k -Name $n -ErrorAction SilentlyContinue;$c++}}};exit $c" >nul 2>&1
set "REMOVED=%errorlevel%"
if not "%REMOVED%"=="0" echo  [OK] Убраны старые копии надстройки: %REMOVED%

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
  echo  и запустите эту установку ещё раз: тогда она очистит кэш надстроек
  echo  и в Word точно не останется старых копий.
) else (
  if exist "%WEF%" (
    rd /s /q "%WEF%" 2>nul
    echo  [OK] Кэш надстроек Word очищен
  )
  echo  Готово. Откройте Word.
)
echo.
echo  Кнопка «Синонимы» появится на вкладке «Главная» справа.
echo  Если её нет: Главная - Надстройки - «Надстройки разработчика» - «Синонимы».
echo.
pause
