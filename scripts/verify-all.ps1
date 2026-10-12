$ErrorActionPreference = 'Stop'
$base = 'http://localhost:3001/api/v1'

function Post($path, $body, $headers = @{}) {
  $json = $body | ConvertTo-Json -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Uri "$base$path" -Method Post -ContentType 'application/json; charset=utf-8' -Headers $headers -Body $bytes
}

function Get($path, $headers = @{}) {
  Invoke-RestMethod -Uri "$base$path" -Method Get -Headers $headers
}

function Patch($path, $body, $headers = @{}) {
  $json = $body | ConvertTo-Json -Depth 12
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  Invoke-RestMethod -Uri "$base$path" -Method Patch -ContentType 'application/json; charset=utf-8' -Headers $headers -Body $bytes
}

$suffix = [guid]::NewGuid().ToString('N').Substring(0, 8)
Write-Output "=== 1. Registering test parties ($suffix) ==="
$buyer = Post '/auth/register' @{ email = "buyer-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'ТОО Заказчик Тест'; role = 'customer'; organizationName = "Заказчик $suffix" }
$supplier = Post '/auth/register' @{ email = "supplier-$suffix@example.test"; password = 'LocalTestPass2026!'; displayName = 'ТОО Поставщик Тест'; role = 'supplier'; organizationName = "Поставщик $suffix" }
$admin = Post '/auth/login' @{ login = 'admin@tendermarket.test'; password = 'LocalTestPass2026!' }

$buyerH = @{ Authorization = "Bearer $($buyer.accessToken)" }
$supplierH = @{ Authorization = "Bearer $($supplier.accessToken)" }
$adminH = @{ Authorization = "Bearer $($admin.accessToken)" }

Write-Output "=== 2. Creating SERVICE Request ==="
$cats = Get '/categories'
$catId = $cats[0].id
$req = Post '/requests' @{
  title = "Монтаж и пусконаладка сети $suffix"
  type = "SERVICE"
  categoryId = $catId
  region = "Алматы"
  deliveryAddress = "пр. Достык 45"
  deliveryDays = 5
  items = @(
    @{ name = "Монтажные работы"; type = "SERVICE"; quantity = 20; unit = "час"; targetPrice = 12000 }
  )
} $buyerH
Write-Output "Request created: ID = $($req.id), Type = $($req.type)"

Write-Output "=== 3. Submitting and Accepting Offer ==="
$offer = Post "/requests/$($req.id)/offers" @{
  price = 240000
  deliveryDays = 4
  comment = "Специалисты сертифицированы"
  items = @(
    @{ name = "Монтажные работы"; quantity = 20; price = 12000; unit = "час" }
  )
} $supplierH
Write-Output "Offer created: ID = $($offer.id)"

$deal = Post "/requests/$($req.id)/offers/$($offer.id)/accept" @{} $buyerH
Write-Output "Deal created: ID = $($deal.id), Number = TM-$($deal.number)"

Write-Output "=== 4. Fetching Kazakhstan Official Documents ==="
$docs = Get "/deals/$($deal.id)/documents" $buyerH
Write-Output "Generated documents count: $($docs.Length)"
foreach ($d in $docs) {
  Write-Output "  - [$($d.type)] $($d.title) | Status: $($d.signStatus) | Stage: $($d.stageCondition)"
}

Write-Output "=== 5. Supplier E-Signing Contract ==="
$signedSupplier = Post "/deals/$($deal.id)/documents/CONTRACT/sign" @{} $supplierH
Write-Output "Supplier signed: Status = $($signedSupplier.signStatus), Hash = $($signedSupplier.legalSignHash.Substring(0, 16))..., Supplier = $($signedSupplier.supplierSignerName)"

Write-Output "=== 6. Buyer E-Signing Contract ==="
$signedBoth = Post "/deals/$($deal.id)/documents/CONTRACT/sign" @{} $buyerH
Write-Output "Buyer signed: Status = $($signedBoth.signStatus), Hash = $($signedBoth.legalSignHash.Substring(0, 16))..., Buyer = $($signedBoth.buyerSignerName)"

Write-Output "=== 7. Creating Subcontract (Өскемен локальный субподряд) ==="
$sub = Post "/deals/$($deal.id)/subcontracts" @{
  title = "Локальный электромонтаж Өскемен"
  targetRegion = "Өскемен"
  agreedAmount = 80000
  details = "Требуется бригада в г. Өскемен для прокладки лотков"
} $supplierH
Write-Output "Subcontract created: ID = $($sub.id), Number = SP-$($sub.number), Status = $($sub.status)"

Write-Output "=== 8. Admin Oversight & Moderation ==="
$adminOverview = Get '/admin/overview' $adminH
Write-Output "Admin Overview activeSubcontracts: $($adminOverview.activeSubcontracts)"

$adminSubs = Get '/admin/subcontracts' $adminH
Write-Output "Admin Subcontracts total count: $($adminSubs.Length)"
$found = $adminSubs | Where-Object { $_.id -eq $sub.id }
Write-Output "Found subcontract in Admin list: $($found.title) | Region: $($found.targetRegion)"

$mod = Patch "/admin/subcontracts/$($sub.id)" @{ action = "complete" } $adminH
Write-Output "Admin completed subcontract: Status = $($mod.status)"

Write-Output "=== ALL VERIFICATIONS PASSED SUCCESSFULLY! ==="
