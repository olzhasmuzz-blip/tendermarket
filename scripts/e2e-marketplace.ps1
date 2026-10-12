$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001/api/v1'
function Post($path, $body, $headers) {
  $json = $body | ConvertTo-Json -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Uri "$base$path" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body $bytes
}
function Assert($condition, $message) { if (-not $condition) { throw $message } }
function Upload-File($path, $filePath, $headers) {
  Add-Type -AssemblyName System.Net.Http
  $client = New-Object System.Net.Http.HttpClient
  $content = New-Object System.Net.Http.MultipartFormDataContent
  $bytes = [System.IO.File]::ReadAllBytes($filePath)
  $fileContent = New-Object System.Net.Http.ByteArrayContent -ArgumentList (,$bytes)
  $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse('application/pdf')
  $content.Add($fileContent, 'file', [System.IO.Path]::GetFileName($filePath))
  $client.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $headers.Authorization.Substring(7))
  $response = $client.PostAsync("$base$path", $content).GetAwaiter().GetResult()
  $body = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
  $client.Dispose()
  if (-not $response.IsSuccessStatusCode) { throw "File upload failed: $($response.StatusCode) $body" }
  return ($body | ConvertFrom-Json)
}

$health = Invoke-RestMethod -Uri "$base/health"
Assert ($health.database -eq 'ok') 'API or PostgreSQL is unavailable.'
$suffix = [guid]::NewGuid().ToString('N').Substring(0, 12)
$buyer = Post '/auth/register' @{ email = "buyer-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Проверка покупателя'; role = 'customer'; organizationName = "Покупатель $suffix" } @{}
$supplier = Post '/auth/register' @{ email = "supplier-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Проверка поставщика'; role = 'supplier'; organizationName = "Поставщик $suffix" } @{}
$buyerHeaders = @{ Authorization = "Bearer $($buyer.accessToken)" }
$supplierHeaders = @{ Authorization = "Bearer $($supplier.accessToken)" }
$categories = Invoke-RestMethod -Uri "$base/categories"
$electronics = $categories | Where-Object slug -eq 'electronics' | Select-Object -First 1
$furniture = $categories | Where-Object slug -eq 'furniture' | Select-Object -First 1
Assert ($electronics -and $furniture) 'Seeded categories are missing.'
$sampleFile = Join-Path $env:TEMP "tm-$suffix.pdf"
Set-Content -Path $sampleFile -Value '%PDF-1.4 local smoke test' -NoNewline -Encoding ascii
$requestAttachment = Upload-File '/uploads' $sampleFile $buyerHeaders
Assert ($requestAttachment.id) 'Private file upload failed.'
$localProfile = Post '/supplier/profile' @{ publicName = "Локальный поставщик $suffix"; about = 'Тестовый поставщик Өскемен'; regions = @('Өскемен'); categoryIds = @($electronics.id, $furniture.id) } $supplierHeaders
$product = Post '/supplier/products' @{ name = "Ноутбук smoke $suffix"; description = 'Каталожная проверка'; categoryId = $electronics.id; price = 12345; unit = 'шт.'; region = 'Өскемен'; isPublished = $true } $supplierHeaders
Assert ($product.id) 'Supplier product was not created.'
$cityQuery = [uri]::EscapeDataString('Өскемен')
$catalogProducts = Invoke-RestMethod -Uri "$base/products?category=electronics&region=$cityQuery"
Assert ($catalogProducts.id -contains $product.id) 'Published supplier product is missing from the public catalog.'
$request1 = Post '/requests' @{ title = "Смешанная тестовая заявка $suffix"; description = 'Проверка нескольких товарных категорий'; region = 'Өскемен'; coverageMode = 'full'; attachments = @($requestAttachment.id); items = @(@{ name = 'Ноутбук 14'; category = 'electronics'; quantity = 2; unit = 'шт.' }, @{ name = 'Кресло офисное'; category = 'furniture'; quantity = 3; unit = 'шт.' }) } $buyerHeaders
$inbox = Invoke-RestMethod -Uri "$base/supplier/requests" -Headers $supplierHeaders
Assert ($inbox.id -contains $request1.id) 'Matching city request was not delivered to the local supplier inbox.'
Assert ($inbox.attachments.id -contains $requestAttachment.id) 'Request attachment was not shown to a matching supplier.'
$matchedFile = Invoke-RestMethod -Uri "$base/uploads/$($requestAttachment.id)" -Headers $supplierHeaders
Assert ($matchedFile) 'Matching supplier could not download the request attachment.'
$rogue = Post '/auth/register' @{ email = "rogue-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Несовпадающий поставщик'; role = 'supplier'; organizationName = "Другой поставщик $suffix" } @{}
$rogueHeaders = @{ Authorization = "Bearer $($rogue.accessToken)" }
Post '/supplier/profile' @{ publicName = "Без совпадений $suffix"; regions = @('Актау'); categoryIds = @($furniture.id) } $rogueHeaders | Out-Null
try { Invoke-RestMethod -Uri "$base/uploads/$($requestAttachment.id)" -Headers $rogueHeaders | Out-Null; throw 'Unmatched supplier unexpectedly downloaded a private request attachment.' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw } }
$buyerRequests = Invoke-RestMethod -Uri "$base/requests/mine" -Headers $buyerHeaders
Assert ($buyerRequests.id -contains $request1.id) 'Created request was not visible in the buyer request list.'
$citySuppliers = Invoke-RestMethod -Uri "$base/suppliers?category=electronics&region=$cityQuery"
Assert ($citySuppliers.id -contains $localProfile.id) 'Supplier city/category filters omitted the local supplier.'
$remoteRequest = Post '/requests' @{ title = "Другой город $suffix"; region = 'Актау'; coverageMode = 'full'; items = @(@{ name = 'Ноутбук'; category = 'electronics'; quantity = 1; unit = 'шт.' }) } $buyerHeaders
$localInbox = Invoke-RestMethod -Uri "$base/supplier/requests" -Headers $supplierHeaders
Assert ($localInbox.id -notcontains $remoteRequest.id) 'Local supplier received an unrelated city request.'
$nation = Post '/auth/register' @{ email = "nation-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Проверка по Казахстану'; role = 'supplier'; organizationName = "Поставщик по Казахстану $suffix" } @{}
$nationHeaders = @{ Authorization = "Bearer $($nation.accessToken)" }
$nationalProfile = Post '/supplier/profile' @{ publicName = "Весь Казахстан $suffix"; regions = @('Весь Казахстан'); categoryIds = @($electronics.id) } $nationHeaders
$nationalInbox = Invoke-RestMethod -Uri "$base/supplier/requests" -Headers $nationHeaders
Assert (($nationalInbox.id -contains $request1.id) -and ($nationalInbox.id -contains $remoteRequest.id)) 'Nationwide supplier did not receive requests from all cities.'
$rankedSuppliers = Invoke-RestMethod -Uri "$base/suppliers?category=electronics&region=$cityQuery"
$localIndex = [array]::IndexOf([string[]]$rankedSuppliers.id, [string]$localProfile.id)
$nationalIndex = [array]::IndexOf([string[]]$rankedSuppliers.id, [string]$nationalProfile.id)
Assert (($localIndex -ge 0) -and ($nationalIndex -gt $localIndex)) 'Local suppliers are not ranked ahead of nationwide suppliers.'
$offer = Post "/requests/$($request1.id)/offers" @{ items = @(@{ requestItemId = $request1.items[0].id; unitPrice = 250000; available = $true }, @{ requestItemId = $request1.items[1].id; unitPrice = 48000; available = $true }); deliveryPrice = 12000; note = 'Полное предложение' } $supplierHeaders
$compare = Invoke-RestMethod -Uri "$base/requests/$($request1.id)/offers" -Headers $buyerHeaders
Assert ($compare.offers.id -contains $offer.id) 'Offer was not visible to the buyer.'
$deal = Post "/offers/$($offer.id)/accept" @{} $buyerHeaders
Assert $deal.id 'Offer selection did not create a deal.'
$message = Post "/deals/$($deal.id)/messages" @{ body = 'Please confirm the delivery date.' } $buyerHeaders
Assert ($message.body -eq 'Please confirm the delivery date.') 'Deal chat message was not saved.'
try {
  Post "/deals/$($deal.id)/stage" @{ stage = 'CONFIRMED' } $buyerHeaders | Out-Null
  throw 'Buyer unexpectedly advanced a supplier-owned deal stage.'
} catch { if ($_.Exception.Response.StatusCode.value__ -ne 403) { throw } }
foreach ($stage in @('CONFIRMED', 'IN_PROGRESS', 'SHIPPED')) { Post "/deals/$($deal.id)/stage" @{ stage = $stage } $supplierHeaders | Out-Null }
foreach ($stage in @('RECEIVED', 'COMPLETED')) { Post "/deals/$($deal.id)/stage" @{ stage = $stage } $buyerHeaders | Out-Null }
$review = Post "/deals/$($deal.id)/reviews" @{ rating = 5; comment = 'Локальная проверка сценария' } $buyerHeaders
Assert ($review.rating -eq 5) 'Buyer review was not saved.'
$notifications = Invoke-RestMethod -Uri "$base/notifications" -Headers $supplierHeaders
Assert ($notifications.Count -ge 2) 'Supplier notifications were not created.'
$request2 = Post '/requests' @{ title = "Тест спора $suffix"; region = 'Өскемен'; coverageMode = 'full'; items = @(@{ name = 'Ноутбук 14'; category = 'electronics'; quantity = 1; unit = 'шт.' }) } $buyerHeaders
$offer2 = Post "/requests/$($request2.id)/offers" @{ items = @(@{ requestItemId = $request2.items[0].id; unitPrice = 230000; available = $true }) } $supplierHeaders
$deal2 = Post "/offers/$($offer2.id)/accept" @{} $buyerHeaders
$dispute = Post "/deals/$($deal2.id)/disputes" @{ reason = 'Проверка спора'; details = 'Локальный end-to-end тест открытия спора.' } $buyerHeaders
Assert $dispute.id 'Dispute was not created.'
$ad = Post '/supplier/advertisements' @{ title = "Реклама smoke $suffix"; placement = 'CATEGORY_TOP'; budget = 10000; startsAt = (Get-Date).AddDays(1).ToString('o'); endsAt = (Get-Date).AddDays(5).ToString('o'); region = 'Өскемен'; categoryId = $electronics.id } $supplierHeaders
Assert ($ad.id -and $ad.status -eq 'PENDING_REVIEW') 'Supplier campaign was not saved for moderation.'
$admin = Post '/auth/register' @{ email = "admin-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Локальный администратор'; role = 'customer'; organizationName = "Операции $suffix" } @{}
$arbiter = Post '/auth/register' @{ email = "arbiter-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'Локальный арбитр'; role = 'customer'; organizationName = "Арбитраж $suffix" } @{}
$env:TM_ADMIN_ID = $admin.user.id
$env:TM_ARBITER_ID = $arbiter.user.id
Push-Location apps/api
node ..\..\scripts\e2e-promote-users.cjs
Pop-Location
$adminHeaders = @{ Authorization = "Bearer $($admin.accessToken)" }
$arbiterHeaders = @{ Authorization = "Bearer $($arbiter.accessToken)" }
$overview = Invoke-RestMethod -Uri "$base/admin/overview" -Headers $adminHeaders
Assert ($overview.users -gt 0) 'Admin overview did not return real platform data.'
try { Invoke-RestMethod -Uri "$base/admin/overview" -Headers $rogueHeaders | Out-Null; throw 'Supplier unexpectedly accessed the admin console.' } catch { if ($_.Exception.Response.StatusCode.value__ -ne 404 -and $_.Exception.Response.StatusCode.value__ -ne 403) { throw } }
$newCategory = Post '/admin/categories' @{ name = "Категория smoke $suffix"; slug = "smoke-$suffix"; icon = 'package'; sortOrder = 1000; isActive = $true } $adminHeaders
Assert ($newCategory.id) 'Admin category creation failed.'
$categoryUpdate = @{ name = "Категория smoke $suffix"; slug = "smoke-$suffix"; icon = 'package'; sortOrder = 1000; isActive = $false } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/admin/categories/$($newCategory.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body $categoryUpdate | Out-Null
$categoryUpdate = @{ name = "Категория smoke $suffix"; slug = "smoke-$suffix"; icon = 'package'; sortOrder = 1000; isActive = $true } | ConvertTo-Json
Invoke-RestMethod -Uri "$base/admin/categories/$($newCategory.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body $categoryUpdate | Out-Null
Post '/admin/settings' @{ key = 'arbitration'; value = @{ enabled = $false; feeKzt = 5000; freeUntil = $null } } $adminHeaders | Out-Null
$adminSettings = Invoke-RestMethod -Uri "$base/admin/settings/all" -Headers $adminHeaders
Assert ($adminSettings.arbitration.feeKzt -eq 5000) 'Admin tariff setting was not persisted.'
$adminProducts = Invoke-RestMethod -Uri "$base/admin/products" -Headers $adminHeaders
Assert ($adminProducts.id -contains $product.id) 'Admin product console omitted the published test product.'
Invoke-RestMethod -Uri "$base/admin/products/$($product.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isPublished":false}' | Out-Null
Invoke-RestMethod -Uri "$base/admin/products/$($product.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isPublished":true}' | Out-Null
Invoke-RestMethod -Uri "$base/admin/advertisements/$($ad.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"action":"approve"}' | Out-Null
$activeAd = Invoke-RestMethod -Uri "$base/admin/advertisements/$($ad.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"action":"paid"}'
Assert ($activeAd.status -eq 'ACTIVE' -and $activeAd.paymentStatus -eq 'PAID') 'Ad approval/payment state transition failed.'
$disputeAdmin = Invoke-RestMethod -Uri "$base/admin/disputes" -Headers $adminHeaders
Assert ($disputeAdmin.id -contains $dispute.id) 'Admin dispute console omitted the test dispute.'
Invoke-RestMethod -Uri "$base/admin/disputes/$($dispute.id)/assign" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body (@{ arbiterId = $arbiter.user.id } | ConvertTo-Json) | Out-Null
$assigned = Invoke-RestMethod -Uri "$base/arbiter/disputes" -Headers $arbiterHeaders
Assert ($assigned.id -contains $dispute.id) 'Assigned dispute did not appear in the arbiter workspace.'
Invoke-RestMethod -Uri "$base/arbiter/disputes/$($dispute.id)/decision" -Method Post -ContentType 'application/json' -Headers $arbiterHeaders -Body '{"decision":"Поставщик и заказчик договорились в ходе проверки.","status":"RESOLVED"}' | Out-Null
$reviews = Invoke-RestMethod -Uri "$base/admin/reviews" -Headers $adminHeaders
Assert ($reviews.id -contains $review.id) 'Admin review console omitted the published test review.'
Invoke-RestMethod -Uri "$base/admin/reviews/$($review.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isPublished":false}' | Out-Null
Invoke-RestMethod -Uri "$base/admin/reviews/$($review.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isPublished":true}' | Out-Null
Invoke-RestMethod -Uri "$base/admin/users/$($rogue.user.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isActive":false}' | Out-Null
Invoke-RestMethod -Uri "$base/admin/users/$($rogue.user.id)" -Method Patch -ContentType 'application/json' -Headers $adminHeaders -Body '{"isActive":true}' | Out-Null
$audit = Invoke-RestMethod -Uri "$base/admin/audit" -Headers $adminHeaders
Assert ($audit.Count -gt 0) 'Admin audit log is empty after administrative actions.'
Remove-Item -LiteralPath $sampleFile -Force
Write-Output 'PASS: city/category filters, mixed requests, supplier catalog products, private file upload/access control, offers/chat/stages/reviews, ad moderation, admin settings/categories/users/products/reviews/audit, and assigned arbiter dispute resolution.'
Write-Output 'The smoke test adds local users, requests, product, file metadata, category, and an ad campaign to PostgreSQL.'
