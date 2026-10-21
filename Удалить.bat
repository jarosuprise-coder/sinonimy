@echo off
chcp 65001 >nul
title Удаление надстройки «Синонимы» для Word
set "DIR=C:\Sinonimy"
set "KEY=HKCU\Software\Microsoft\Office\16.0\WEF\Developer"

echo.
reg delete "%KEY%" /v "%DIR%\manifest.xml" /f >nul 2>&1
set "SIN_KEEP="
powershell -NoProfile -ExecutionPolicy Bypass -Command "$k='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer';$keep=$env:SIN_KEEP;$c=0;if(Test-Path $k){$p=Get-ItemProperty $k;foreach($n in $p.PSObject.Properties.Name){if($n -like 'PS*'){continue};$v=[string]$p.$n;if($keep -and $v -eq $keep){continue};$d=$false;if($v -match 'sinonim'){$d=$true}elseif($v -like '*.xml' -and (Test-Path -LiteralPath $v)){try{if((Get-Content -LiteralPath $v -Raw) -match '47dd82ec-96c6-4899-89d8-ef6fe1fcd0a8'){$d=$true}}catch{}};if($d){Remove-ItemProperty -Path $k -Name $n -ErrorAction SilentlyContinue;$c++}}};exit $c" >nul 2>&1
echo  [OK] Надстройка отключена от Word.
if exist "%DIR%\manifest.xml" del /Q "%DIR%\manifest.xml"
rmdir "%DIR%" 2>nul
echo  [OK] Папка %DIR% удалена.
echo.
echo  Перезапустите Word, чтобы кнопка «Синонимы» исчезла.
echo.
pause
