@echo off
chcp 65001 >nul
title Запасная установка надстройки «Синонимы» для Word
setlocal
echo.
echo  Запасная установка «Синонимов» через «Каталоги доверенных веб-надстроек»
echo  ------------------------------------------------------------------------
echo  Используйте, если после обычной установки кнопки «Синонимы» нет.
echo.
tasklist /FI "IMAGENAME eq WINWORD.EXE" 2>nul | find /I "WINWORD.EXE" >nul
if not errorlevel 1 (
  echo  Word сейчас открыт. Сохраните документы, закройте ВСЕ окна Word
  echo  и запустите этот файл ещё раз.
  echo.
  pause
  exit /b 0
)
set "SIN_SELF=%~f0"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$t=[IO.File]::ReadAllText($env:SIN_SELF,[Text.Encoding]::UTF8);$a=$t.LastIndexOf('::SCRI'+'PT::');$b=$t.LastIndexOf('::MANI'+'FEST::');& ([ScriptBlock]::Create($t.Substring($a+10,$b-$a-10)));exit $LASTEXITCODE"
if errorlevel 1 (
  echo.
  echo  Установка не закончена, см. сообщения выше.
  echo.
  pause
  exit /b 1
)
if exist "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" rd /s /q "%LOCALAPPDATA%\Microsoft\Office\16.0\Wef" 2>nul
echo  [OK] Кэш надстроек Word очищен
echo.
echo  Готово. Теперь откройте Word и сделайте один раз:
echo    «Вставка» - «Мои надстройки» ^(или «Главная» - «Надстройки» - «Другие надстройки»^)
echo    - вкладка «ОБЩАЯ ПАПКА» - «Синонимы» - «Добавить».
echo  Кнопка «Синонимы» появится на вкладке «Главная».
echo.
pause
exit /b 0

::SCRIPT::
$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}
$id  = '47dd82ec-96c6-4899-89d8-ef6fe1fcd0a8'
$cat = '{5b0d3c1e-7a2f-4f8e-9c61-2d4e8a9b7c35}'
$wef = 'HKCU:\Software\Microsoft\Office\16.0\WEF'
$dir = 'C:\Sinonimy'
function Ok($s)   { Write-Host (' [OK] ' + $s) }
function Warn($s) { Write-Host (' [!] ' + $s) -ForegroundColor Yellow }
function Fail($s) { Write-Host (' [Ошибка] ' + $s) -ForegroundColor Red }
function Reach($p) { try { return (Test-Path -LiteralPath (Join-Path $p 'manifest.xml')) } catch { return $false } }

$ver = $null
try {
  $c = Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Office\ClickToRun\Configuration' -ErrorAction Stop
  $ver = ('' + $c.ProductReleaseIds + ', версия ' + $c.VersionToReport)
} catch {}
if ($ver) { Ok ('Office: ' + $ver) }
else { Warn 'Не удалось определить версию Office. Если это Office 2016 или старше, надстройка в нём может не работать.' }

try {
  $t = [IO.File]::ReadAllText($env:SIN_SELF, [Text.Encoding]::UTF8)
  $i = $t.LastIndexOf('::MANIFEST::')
  $x = $t.Substring($i + 12).Trim()
  [IO.Directory]::CreateDirectory($dir) | Out-Null
  $m = Join-Path $dir 'manifest.xml'
  [IO.File]::WriteAllText($m, $x, (New-Object Text.UTF8Encoding $false))
} catch { Fail 'Не удалось создать папку C:\Sinonimy. Запустите этот файл от имени администратора.'; exit 1 }
Ok ('Манифест сохранён: ' + $m)

$dev = "$wef\Developer"
if (Test-Path $dev) {
  $p = Get-ItemProperty $dev
  foreach ($n in $p.PSObject.Properties.Name) {
    if ($n -like 'PS*') { continue }
    $v = [string]$p.$n
    if ($n -eq $id -or $v -match 'sinonim') { Remove-ItemProperty -Path $dev -Name $n -ErrorAction SilentlyContinue }
  }
}

$tc = "$wef\TrustedCatalogs"
if (-not (Test-Path $tc)) { New-Item -Path $tc -Force | Out-Null }
$tp = Get-ItemProperty $tc -ErrorAction SilentlyContinue
foreach ($n in 'DisableAllCatalogs', 'DisableOmexCatalogs') {
  if ($tp -and $tp.$n) { Set-ItemProperty -Path $tc -Name $n -Value 0; Ok ('Снят запрет в центре управления безопасностью: ' + $n) }
}

$pol = @()
foreach ($root in 'HKCU:', 'HKLM:') {
  foreach ($sub in 'WEF', 'WEF\TrustedCatalogs') {
    $k = "$root\Software\Policies\Microsoft\Office\16.0\$sub"
    if (Test-Path $k) {
      $p = Get-ItemProperty $k
      foreach ($n in $p.PSObject.Properties.Name) { if ($n -notlike 'PS*') { $pol += ($k + '\' + $n + ' = ' + $p.$n) } }
    }
  }
}
if ($pol.Count) {
  Warn 'Найдены политики Office, которые могут запрещать надстройки (их ставит администратор или программа-активатор):'
  foreach ($l in $pol) { Write-Host ('      ' + $l) }
}

$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$unc = '\\' + $env:COMPUTERNAME + '\Sinonimy'
if (-not (Reach $unc)) {
  Write-Host ''
  Write-Host ' Нужно открыть доступ к папке C:\Sinonimy по сети (только чтение и только для вас).'
  Write-Host ' Сейчас Windows спросит разрешение - нажмите «Да».'
  Write-Host ''
  $f = Join-Path $env:TEMP 'sinonimy-share.ps1'
  $code = @'
param($Dir, $User)
try {
  $s = Get-Service LanmanServer -ErrorAction SilentlyContinue
  if ($s -and $s.Status -ne 'Running') { Set-Service LanmanServer -StartupType Automatic; Start-Service LanmanServer }
  if (-not (Get-SmbShare -Name Sinonimy -ErrorAction SilentlyContinue)) {
    New-SmbShare -Name Sinonimy -Path $Dir -ReadAccess $User -ErrorAction Stop | Out-Null
  }
  exit 0
} catch { exit 1 }
'@
  [IO.File]::WriteAllText($f, $code, (New-Object Text.UTF8Encoding $true))
  try {
    $a = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"' + $f + '"'), '-Dir', ('"' + $dir + '"'), '-User', ('"' + $user + '"'))
    Start-Process powershell -Verb RunAs -Wait -WindowStyle Hidden -ArgumentList $a | Out-Null
  } catch { Warn 'Разрешение не получено.' }
  Remove-Item $f -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  if (-not (Reach $unc)) {
    if (Reach '\\localhost\C$\Sinonimy') { $unc = '\\localhost\C$\Sinonimy' }
    else {
      Fail 'Не удалось открыть доступ к папке C:\Sinonimy.'
      Write-Host '      Сделайте это вручную: правой кнопкой по папке C:\Sinonimy - Свойства - Доступ -'
      Write-Host '      Общий доступ - Поделиться. Затем запустите этот файл ещё раз.'
      exit 1
    }
  }
}
Ok ('Папка доступна по адресу ' + $unc)

Get-ChildItem $tc -ErrorAction SilentlyContinue | ForEach-Object {
  $u = (Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue).Url
  if ($_.PSChildName -ne $cat -and ([string]$u) -match 'sinonim') { Remove-Item $_.PSPath -Recurse -Force }
}
$ck = "$tc\$cat"
New-Item -Path $ck -Force | Out-Null
New-ItemProperty -Path $ck -Name Id -Value $cat -PropertyType String -Force | Out-Null
New-ItemProperty -Path $ck -Name Url -Value $unc -PropertyType String -Force | Out-Null
New-ItemProperty -Path $ck -Name Flags -Value 1 -PropertyType DWord -Force | Out-Null
Ok 'Папка добавлена в «Каталоги доверенных веб-надстроек» Word с галочкой «Показывать в меню»'
exit 0
::MANIFEST::
<?xml version="1.0" encoding="UTF-8"?>
<!-- Надстройка «Синонимы» для Word. Адрес сайта: https://jarosuprise-coder.github.io/sinonimy -->
<OfficeApp xmlns="http://schemas.microsoft.com/office/appforoffice/1.1"
           xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
           xmlns:bt="http://schemas.microsoft.com/office/officeappbasictypes/1.0"
           xmlns:ov="http://schemas.microsoft.com/office/taskpaneappversionoverrides"
           xsi:type="TaskPaneApp">
  <Id>47dd82ec-96c6-4899-89d8-ef6fe1fcd0a8</Id>
  <Version>1.4.0.0</Version>
  <ProviderName>Личная надстройка</ProviderName>
  <DefaultLocale>ru-RU</DefaultLocale>
  <DisplayName DefaultValue="Синонимы"/>
  <Description DefaultValue="Синонимы к выделенному слову из нескольких словарей (Абрамов, Викисловарь, RuWordNet, LibreOffice, YARN, РуТез и др.), в том числе к составным словам через дефис, и перефразирование фраз через бесплатные ИИ-сервисы; замена в один клик."/>
  <IconUrl DefaultValue="https://jarosuprise-coder.github.io/sinonimy/assets/icon-32.png"/>
  <HighResolutionIconUrl DefaultValue="https://jarosuprise-coder.github.io/sinonimy/assets/icon-64.png"/>
  <SupportUrl DefaultValue="https://jarosuprise-coder.github.io/sinonimy/taskpane.html"/>
  <Hosts>
    <Host Name="Document"/>
  </Hosts>
  <Requirements>
    <Sets DefaultMinVersion="1.3">
      <Set Name="WordApi" MinVersion="1.3"/>
    </Sets>
  </Requirements>
  <DefaultSettings>
    <SourceLocation DefaultValue="https://jarosuprise-coder.github.io/sinonimy/taskpane.html"/>
  </DefaultSettings>
  <Permissions>ReadWriteDocument</Permissions>

  <VersionOverrides xmlns="http://schemas.microsoft.com/office/taskpaneappversionoverrides" xsi:type="VersionOverridesV1_0">
    <Hosts>
      <Host xsi:type="Document">
        <DesktopFormFactor>
          <GetStarted>
            <Title resid="GetStarted.Title"/>
            <Description resid="GetStarted.Description"/>
            <LearnMoreUrl resid="Taskpane.Url"/>
          </GetStarted>
          <FunctionFile resid="Commands.Url"/>

          <!-- Кнопка на вкладке «Главная» -->
          <ExtensionPoint xsi:type="PrimaryCommandSurface">
            <OfficeTab id="TabHome">
              <Group id="Syn.Group">
                <Label resid="Group.Label"/>
                <Icon>
                  <bt:Image size="16" resid="Icon.16"/>
                  <bt:Image size="32" resid="Icon.32"/>
                  <bt:Image size="80" resid="Icon.80"/>
                </Icon>
                <Control xsi:type="Button" id="Syn.OpenPane">
                  <Label resid="Button.Label"/>
                  <Supertip>
                    <Title resid="Button.Label"/>
                    <Description resid="Button.Tooltip"/>
                  </Supertip>
                  <Icon>
                    <bt:Image size="16" resid="Icon.16"/>
                    <bt:Image size="32" resid="Icon.32"/>
                    <bt:Image size="80" resid="Icon.80"/>
                  </Icon>
                  <Action xsi:type="ShowTaskpane">
                    <TaskpaneId>SynPane</TaskpaneId>
                    <SourceLocation resid="Taskpane.Url"/>
                  </Action>
                </Control>
              </Group>
            </OfficeTab>
          </ExtensionPoint>

          <!-- Пункт в меню правой кнопки мыши -->
          <ExtensionPoint xsi:type="ContextMenu">
            <OfficeMenu id="ContextMenuText">
              <Control xsi:type="Button" id="Syn.ContextOpen">
                <Label resid="Button.Label"/>
                <Supertip>
                  <Title resid="Button.Label"/>
                  <Description resid="Button.Tooltip"/>
                </Supertip>
                <Icon>
                  <bt:Image size="16" resid="Icon.16"/>
                  <bt:Image size="32" resid="Icon.32"/>
                  <bt:Image size="80" resid="Icon.80"/>
                </Icon>
                <Action xsi:type="ShowTaskpane">
                  <TaskpaneId>SynPane</TaskpaneId>
                  <SourceLocation resid="Taskpane.Url"/>
                </Action>
              </Control>
            </OfficeMenu>
          </ExtensionPoint>
        </DesktopFormFactor>
      </Host>
    </Hosts>

    <Resources>
      <bt:Images>
        <bt:Image id="Icon.16" DefaultValue="https://jarosuprise-coder.github.io/sinonimy/assets/icon-16.png"/>
        <bt:Image id="Icon.32" DefaultValue="https://jarosuprise-coder.github.io/sinonimy/assets/icon-32.png"/>
        <bt:Image id="Icon.80" DefaultValue="https://jarosuprise-coder.github.io/sinonimy/assets/icon-80.png"/>
      </bt:Images>
      <bt:Urls>
        <bt:Url id="Taskpane.Url" DefaultValue="https://jarosuprise-coder.github.io/sinonimy/taskpane.html"/>
        <bt:Url id="Commands.Url" DefaultValue="https://jarosuprise-coder.github.io/sinonimy/commands.html"/>
      </bt:Urls>
      <bt:ShortStrings>
        <bt:String id="GetStarted.Title" DefaultValue="Синонимы готовы к работе"/>
        <bt:String id="Group.Label" DefaultValue="Синонимы"/>
        <bt:String id="Button.Label" DefaultValue="Синонимы"/>
      </bt:ShortStrings>
      <bt:LongStrings>
        <bt:String id="GetStarted.Description" DefaultValue="Нажмите «Синонимы» на вкладке «Главная» и выделите слово в тексте."/>
        <bt:String id="Button.Tooltip" DefaultValue="Открыть панель с синонимами к выделенному слову"/>
      </bt:LongStrings>
    </Resources>
  </VersionOverrides>
</OfficeApp>
