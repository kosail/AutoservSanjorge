Add-Type -AssemblyName System.Drawing
Remove-Item Alias:r -Force -ErrorAction SilentlyContinue
$bmp=New-Object System.Drawing.Bitmap 2600,1400
$g=[System.Drawing.Graphics]::FromImage($bmp);$g.SmoothingMode='AntiAlias';$g.TextRenderingHint='AntiAliasGridFit';$g.Clear([System.Drawing.Color]::White)
$svg=[System.Collections.Generic.List[string]]::new()
$svg.Add('<svg xmlns="http://www.w3.org/2000/svg" width="2600" height="1400" viewBox="0 0 2600 1400"><defs><marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0 0L8 3L0 6" fill="none" stroke="#56616e" stroke-width="1.5"/></marker></defs><rect width="2600" height="1400" fill="white"/>')
function C($s){[System.Drawing.ColorTranslator]::FromHtml($s)}
function Esc($s){[System.Security.SecurityElement]::Escape($s)}
function R($x,$y,$w,$h,$fill='#FFFFFF',$stroke='#FFFFFF',$dash=$false){
 $b=[System.Drawing.SolidBrush]::new((C $fill));$p=[System.Drawing.Pen]::new((C $stroke),2)
 if($dash){$p.DashStyle='Dash'}
 $g.FillRectangle($b,$x,$y,$w,$h);$g.DrawRectangle($p,$x,$y,$w,$h);$b.Dispose();$p.Dispose()
 $d='';if($dash){$d='stroke-dasharray="10 8"'}
 $svg.Add("<rect x='$x' y='$y' width='$w' height='$h' fill='$fill' stroke='$stroke' stroke-width='2' $d/>")
}
function T($s,$x,$y,$size=24,$col='#242B36',$bold=$false,$w=2200,$h=160,$center=$false){
 $style=[System.Drawing.FontStyle]::Regular;if($bold){$style=[System.Drawing.FontStyle]::Bold}
 $f=[System.Drawing.Font]::new('Arial',$size,$style,[System.Drawing.GraphicsUnit]::Pixel);$b=[System.Drawing.SolidBrush]::new((C $col))
 $fmt=[System.Drawing.StringFormat]::new();if($center){$fmt.Alignment='Center'}
 $g.DrawString($s,$f,$b,[System.Drawing.RectangleF]::new($x,$y,$w,$h),$fmt)
 $weight='400';if($bold){$weight='700'}
 $tx=$x;$anchor='start';if($center){$tx=$x+$w/2;$anchor='middle'}
 $svg.Add("<text x='$tx' y='$($y+$size)' font-family='Arial, sans-serif' font-size='$size' font-weight='$weight' fill='$col' text-anchor='$anchor'>")
 $i=0;foreach($part in ($s -split "`n")){$dy=0;if($i -gt 0){$dy=$size*1.15};$svg.Add("<tspan x='$tx' dy='$dy'>$(Esc $part)</tspan>");$i++};$svg.Add('</text>')
 $f.Dispose();$b.Dispose();$fmt.Dispose()
}
function L($x1,$y1,$x2,$y2,$col='#56616E',$arrow=$false,$dash=$false,$width=3){
 $p=[System.Drawing.Pen]::new((C $col),$width);if($arrow){$p.CustomEndCap=[System.Drawing.Drawing2D.AdjustableArrowCap]::new(5,6)};if($dash){$p.DashStyle='Dash'}
 $g.DrawLine($p,$x1,$y1,$x2,$y2);$p.Dispose();$a='';$d='';if($arrow){$a='marker-end="url(#arrow)"'};if($dash){$d='stroke-dasharray="9 6"'}
 $svg.Add("<line x1='$x1' y1='$y1' x2='$x2' y2='$y2' stroke='$col' stroke-width='$width' $a $d/>")
}
function E($x,$y,$w,$h,$col='#D52178'){
 $p=[System.Drawing.Pen]::new((C $col),4);$g.DrawEllipse($p,$x,$y,$w,$h);$p.Dispose();$svg.Add("<ellipse cx='$($x+$w/2)' cy='$($y+$h/2)' rx='$($w/2)' ry='$($h/2)' fill='none' stroke='$col' stroke-width='4'/>")
}
function Icon($type,$x,$y,$col='#D52178'){
 switch($type){
 'user' { E ($x+32) ($y+2) 36 36 $col;E ($x+10) ($y+45) 80 50 $col;R ($x+10) ($y+72) 80 29 '#FFFFFF' '#FFFFFF';L ($x+10) ($y+72) ($x+90) ($y+72) $col $false $false 4 }
 'web' {R $x $y 100 78 '#FFFFFF' $col;L $x ($y+19) ($x+100) ($y+19) $col;T '• • •' ($x+6) ($y-5) 18 $col;T '</>' ($x+14) ($y+30) 32 $col $true 80}
 'db' {L $x ($y+15) $x ($y+76) $col;L ($x+100) ($y+15) ($x+100) ($y+76) $col;E $x $y 100 30 $col;E $x ($y+60) 100 30 $col;L ($x+15) ($y+46) ($x+85) ($y+46) $col}
 'lock' {E ($x+28) $y 44 55 $col;R ($x+12) ($y+30) 76 58 '#FFFFFF' $col;E ($x+44) ($y+47) 12 12 $col;L ($x+50) ($y+59) ($x+50) ($y+72) $col}
 'cloud' {E $x ($y+25) 50 48 $col;E ($x+27) ($y+4) 55 60 $col;E ($x+61) ($y+28) 42 45 $col;L ($x+18) ($y+75) ($x+89) ($y+75) $col}
 'pin' {E ($x+25) $y 50 58 $col;E ($x+41) ($y+17) 18 18 $col;L ($x+28) ($y+46) ($x+50) ($y+87) $col;L ($x+72) ($y+46) ($x+50) ($y+87) $col}
 'pipeline' {R $x ($y+28) 30 36 '#FFFFFF' $col;R ($x+70) ($y+28) 30 36 '#FFFFFF' $col;L ($x+30) ($y+46) ($x+70) ($y+46) $col;L ($x+50) $y ($x+50) ($y+90) $col;E ($x+39) ($y+3) 22 22 $col;E ($x+39) ($y+68) 22 22 $col}
 'health' {R $x $y 100 90 '#FFFFFF' $col;L ($x+5) ($y+48) ($x+26) ($y+48) $col;L ($x+26) ($y+48) ($x+39) ($y+23) $col;L ($x+39) ($y+23) ($x+55) ($y+71) $col;L ($x+55) ($y+71) ($x+69) ($y+43) $col;L ($x+69) ($y+43) ($x+95) ($y+43) $col}
 default {R ($x+10) $y 80 90 '#FFFFFF' $col;L ($x+25) ($y+26) ($x+75) ($y+26) $col;L ($x+25) ($y+45) ($x+75) ($y+45) $col;L ($x+25) ($y+64) ($x+75) ($y+64) $col}
 }
}
R 30 30 2540 130 '#FFFFFF' '#FFFFFF'
T 'Arquitectura de Software' 40 42 46 '#222936' $true 2520 65 $true
T 'Autoservicio San Jorge | React + Express + PostgreSQL' 40 105 25 '#657080' $false 2520 45 $true
R 40 205 710 880 '#FFFFFF' '#9CA4AF' $true
R 750 205 1015 880 '#FFFFFF' '#9CA4AF' $true
R 1765 205 795 880 '#FFFFFF' '#9CA4AF' $true
R 500 207 248 876 '#F2F2F5' '#F2F2F5'
R 1767 207 248 876 '#F2F2F5' '#F2F2F5'
T 'BACKEND' 505 232 25 '#242B36' $true 240 40 $true
T 'VERCEL' 785 232 26 '#242B36' $true 940 40 $true
T 'DATOS / SERVICIOS' 1769 232 22 '#242B36' $true 245 40 $true
Icon 'doc' 570 320
T 'Gestión del taller' 507 425 24 '#242B36' $true 240 65 $true
T "Clientes y vehículos`nCitas y cotizaciones`nServicios y mantenimiento`nInventario, compras y ventas`nReportes y dashboard" 68 320 25 '#242B36' $false 408 190
Icon 'lock' 570 575 '#C72B56'
T "Autenticación`ny sesión" 507 680 24 '#242B36' $true 240 70 $true
T "JWT de 24 horas`nContraseñas con bcrypt`nUsuarios y Roles`n/api/auth/me" 68 588 25 '#242B36' $false 408 160
Icon 'doc' 570 850 '#D52178'
T "Validaciones`ny transacciones" 507 955 24 '#242B36' $true 240 70 $true
T "Reglas del negocio`nSQL parametrizado`nCOMMIT / ROLLBACK`nConsistencia del inventario" 68 862 25 '#242B36' $false 408 165
Icon 'user' 850 340 '#C72B56'
T "Cliente / Personal" 790 447 25 '#242B36' $true 245 45 $true
T "Administrador y Técnico" 790 485 20 '#657080' $false 245 40 $true
Icon 'web' 1170 340
T 'Navegador web' 1080 447 26 '#242B36' $true 280 45 $true
T "SPA React 19 + Vite`nContenido servido por CDN" 1045 490 24 '#242B36' $false 350 80 $true
Icon 'cloud' 1510 340
T 'CDN / Edge' 1440 447 26 '#242B36' $true 250 45 $true
T "Assets de la SPA`nDistribución en Vercel" 1410 490 24 '#242B36' $false 320 80 $true
L 956 386 1150 386 '#56616E' $true
T 'HTTPS' 988 349 21 '#657080' $false 140
L 1490 386 1290 386 '#56616E' $true
Icon 'lock' 1170 625 '#C72B56'
T 'HTTP / HTTPS' 1045 730 26 '#242B36' $true 350 45 $true
T '/api · JSON · fetch' 1045 772 24 '#657080' $false 350 50 $true
L 1220 578 1220 609 '#56616E' $true
L 1220 827 1220 879 '#56616E' $true
Icon 'cloud' 1170 895
T 'API Express' 1040 992 27 '#242B36' $true 360 45 $true
T 'Node.js 22 · api/index.js · función serverless' 850 1030 23 '#657080' $false 850 45 $true
L 1115 940 800 940
L 800 940 800 400
L 800 400 736 400 '#56616E' $true
L 800 665 736 665 '#56616E' $true
L 800 940 736 940 '#56616E' $true
L 1300 940 1705 940
L 1705 940 1705 390
L 1705 390 1820 390 '#56616E' $true
T 'pg · TCP/SSL' 1440 901 21 '#657080' $false 260
Icon 'db' 1840 340
T "Supabase" 1780 447 26 '#242B36' $true 220 45 $true
T 'Pooler + PostgreSQL' 1777 490 20 '#657080' $false 235 45 $true
T 'Base de datos' 2050 305 30 '#242B36' $true 470 50
T "• 23 tablas relacionales`n• Usuarios y Roles`n• Vehículos y catálogos`n• Citas y cotizaciones`n• Mantenimiento y servicios`n• Productos, compras y ventas`n• Claves foráneas e índices" 2050 360 24 '#242B36' $false 470 235
Icon 'pin' 1840 635 '#B531A3'
T "Servicios externos" 1775 735 23 '#242B36' $true 240 60 $true
T 'Integraciones auxiliares' 2050 635 29 '#242B36' $true 470 50
T "Google Maps: iframe de ubicación.`nNHTSA vPIC: carga inicial`nde marcas y modelos (scripts).`nComunicación mediante HTTPS." 2050 688 24 '#242B36' $false 470 155
L 1290 550 1560 550 '#56616E' $false $true
L 1560 550 1560 680 '#56616E' $false $true
L 1560 680 1820 680 '#56616E' $true $true
Icon 'health' 1840 890 '#D52178'
T 'Health Check' 1775 992 24 '#242B36' $true 240 45 $true
T 'Monitoreo y CI/CD' 2050 870 30 '#242B36' $true 470 50
T "• Git y validaciones del pipeline`n• npm ci · build · Vitest`n• Vercel CLI: pull / build / deploy`n• GET /api/health: API y base" 2050 928 24 '#242B36' $false 470 150
L 1705 940 1820 940 '#56616E' $true
T 'PIPELINE DE DESPLIEGUE' 65 1125 23 '#242B36' $true 500 45
R 65 1180 470 90 '#F5F5F8' '#D1D4DB'
T 'Repositorio Git' 80 1190 25 '#242B36' $true 440 40 $true
T 'Ramas y merge requests hacia main' 80 1230 22 '#657080' $false 440 40 $true
R 585 1180 550 90 '#F5F5F8' '#D1D4DB'
T 'Validación' 600 1190 25 '#242B36' $true 520 40 $true
T 'npm ci · build · pruebas Vitest' 600 1230 22 '#657080' $false 520 40 $true
R 1185 1180 645 90 '#F5F5F8' '#D1D4DB'
T 'Vercel CLI' 1200 1190 25 '#242B36' $true 615 40 $true
T 'pull → build → deploy' 1200 1230 22 '#657080' $false 615 40 $true
R 1880 1180 655 90 '#F5F5F8' '#D1D4DB'
T 'Producción + Health Check' 1895 1190 25 '#242B36' $true 625 40 $true
T 'CDN / función serverless → GET /api/health' 1895 1230 22 '#657080' $false 625 40 $true
L 539 1225 580 1225 '#56616E' $true
L 1139 1225 1180 1225 '#56616E' $true
L 1834 1225 1875 1225 '#56616E' $true
T 'Línea continua: comunicación principal     |     Línea discontinua: integración auxiliar     |     Las respuestas vuelven al origen.' 65 1310 22 '#657080'
T 'Panel disponible para Administrador; Técnico existe en el modelo. Google Maps y NHTSA vPIC no son dependencias de la operación principal.' 65 1350 21 '#657080'
$svg.Add('</svg>')
[System.IO.File]::WriteAllLines((Join-Path $PSScriptRoot 'Arquitectura_San_Jorge_Miro.svg'),$svg,[System.Text.UTF8Encoding]::new($false))
$bmp.Save((Join-Path $PSScriptRoot 'Arquitectura_San_Jorge_Miro.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$pr=[System.Drawing.Bitmap]::new(1300,700);$pg=[System.Drawing.Graphics]::FromImage($pr);$pg.DrawImage($bmp,0,0,1300,700);$pr.Save((Join-Path $PSScriptRoot 'preview.png'),[System.Drawing.Imaging.ImageFormat]::Png);$pg.Dispose();$pr.Dispose();$g.Dispose();$bmp.Dispose()
