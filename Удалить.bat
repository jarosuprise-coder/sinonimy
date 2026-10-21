@echo off
chcp 65001 >nul
title Удаление надстройки «Синонимы» для Word
set "DIR=C:\Sinonimy"
set "KEY=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"

echo.
reg delete "%KEY%" /v "%DIR%\manifest.xml" /f >nul 2>&1
echo  [OK] Надстройка отключена от Word.
if exist "%DIR%\manifest.xml" del /Q "%DIR%\manifest.xml"
rmdir "%DIR%" 2>nul
echo  [OK] Папка %DIR% удалена.
echo.
echo  Перезапустите Word, чтобы кнопка «Синонимы» исчезла.
echo.
pause
