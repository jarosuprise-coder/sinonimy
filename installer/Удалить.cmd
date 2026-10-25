@echo off
chcp 65001 >nul
title Удаление надстройки «Синонимы» для Word
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "try{$k='HKCU:\Software\Microsoft\Office\16.0\WEF\Developer';$id='47dd82ec-96c6-4899-89d8-ef6fe1fcd0a8';$c=0;if(Test-Path $k){$p=Get-ItemProperty $k;foreach($n in $p.PSObject.Properties.Name){if($n -like 'PS*' -or $n -eq $id){continue};$v=[string]$p.$n;$d=$false;if($v -like '*.xml'){if(Test-Path -LiteralPath $v){try{if((Get-Content -LiteralPath $v -Raw) -match $id){$d=$true}}catch{}}elseif($v -match 'sinonim'){$d=$true}};if($d){Remove-ItemProperty -Path $k -Name $n -ErrorAction SilentlyContinue;$c++}}};if(Test-Path $k){Remove-ItemProperty -Path $k -Name $id -ErrorAction SilentlyContinue};$t='HKCU:\Software\Microsoft\Office\16.0\WEF\TrustedCatalogs';if(Test-Path $t){Get-ChildItem $t|ForEach-Object{$u=[string](Get-ItemProperty $_.PSPath).Url;if($u -match 'sinonim'){Remove-Item $_.PSPath -Recurse -Force}}};exit 0}catch{exit 1}"
del /q "C:\Sinonimy\manifest.xml" 2>nul
net share Sinonimy /delete /y >nul 2>&1
rmdir "C:\Sinonimy" 2>nul
del /q "%LOCALAPPDATA%\Sinonimy\manifest.xml" 2>nul
rmdir "%LOCALAPPDATA%\Sinonimy" 2>nul
echo  [OK] Надстройка «Синонимы» удалена.
echo.
echo  Перезапустите Word, чтобы кнопка исчезла.
echo.
pause
