#!/usr/bin/env bash
#
# End-to-end smoke test for the ERP + CRM API.
#
# Exercises all four roles, the RBAC matrix, validation, pagination and search, the
# full challan lifecycle, and — most importantly — the concurrency guarantee: eight
# simultaneous confirmations against three units of stock must yield exactly three
# successes and a final balance of zero, never a negative number.
#
# Usage:
#   1. Start the API (npm run dev, or node dist/server.js)
#   2. Seed the database (npm run seed)
#   3. bash scripts/smoke-test.sh
#
# Override the target with API=https://your-api.onrender.com/api/v1 bash scripts/smoke-test.sh
#
# Fixtures are randomised per run, so the suite is safe to run repeatedly against the
# same database. Exits non-zero if any check fails.

API=${API:-http://localhost:4000/api/v1}
PASS=0
FAIL=0

jqx() { node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8'))$1}catch(e){'PARSE_ERR'}"; }

check() { # check <label> <actual> <expected>
  if [ "$2" = "$3" ]; then
    echo "  PASS  $1  ->  $2"
    PASS=$((PASS+1))
  else
    echo "  FAIL  $1  ->  got '$2', expected '$3'"
    FAIL=$((FAIL+1))
  fi
}

login() { # login <email>  -> prints token
  curl -s -X POST "$API/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"Password@123\"}" | jqx '.data.token'
}

status() { # status <method> <url> <token> [body]
  if [ -n "$4" ]; then
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -H "Authorization: Bearer $3" \
      -H 'Content-Type: application/json' -d "$4"
  else
    curl -s -o /dev/null -w '%{http_code}' -X "$1" "$2" -H "Authorization: Bearer $3"
  fi
}

echo "== 1. Authentication =="
ADMIN=$(login admin@erpcrm.test)
SALES=$(login sales@erpcrm.test)
WH=$(login warehouse@erpcrm.test)
ACC=$(login accounts@erpcrm.test)
for pair in "ADMIN:$ADMIN" "SALES:$SALES" "WAREHOUSE:$WH" "ACCOUNTS:$ACC"; do
  name=${pair%%:*}; tok=${pair#*:}
  if [ ${#tok} -gt 20 ]; then check "$name login" "ok" "ok"; else check "$name login" "no-token" "ok"; fi
done
check "wrong password rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$API/auth/login" -H 'Content-Type: application/json' -d '{"email":"admin@erpcrm.test","password":"nope"}')" "401"
check "no token rejected" "$(curl -s -o /dev/null -w '%{http_code}' "$API/customers")" "401"
check "garbage token rejected" "$(status GET "$API/customers" 'not-a-real-token')" "401"
ROLE=$(curl -s "$API/auth/me" -H "Authorization: Bearer $WH" | jqx '.data.role')
check "/auth/me returns role" "$ROLE" "WAREHOUSE"

echo
echo "== 2. Role-based access control =="
check "ACCOUNTS cannot create customer" \
  "$(status POST "$API/customers" "$ACC" '{"name":"Blocked User","mobile":"9876500001"}')" "403"
check "ACCOUNTS cannot move stock" \
  "$(status POST "$API/stock/movements" "$ACC" '{"productId":"x","quantity":1,"type":"IN","reason":"no"}')" "403"
check "SALES cannot create product" \
  "$(status POST "$API/products" "$SALES" '{"name":"Nope","sku":"NOPE-1","category":"X","unitPrice":1}')" "403"
check "WAREHOUSE cannot create customer" \
  "$(status POST "$API/customers" "$WH" '{"name":"Blocked","mobile":"9876500002"}')" "403"
check "SALES cannot list users" "$(status GET "$API/users" "$SALES")" "403"
check "ADMIN can list users" "$(status GET "$API/users" "$ADMIN")" "200"
check "ACCOUNTS can read customers" "$(status GET "$API/customers" "$ACC")" "200"

echo
echo "== 3. Validation =="
check "invalid customer payload -> 400" \
  "$(status POST "$API/customers" "$SALES" '{"name":"X","mobile":"123","email":"bad","gstNumber":"NOPE"}')" "400"
FIELDS=$(curl -s -X POST "$API/customers" -H "Authorization: Bearer $SALES" -H 'Content-Type: application/json' \
  -d '{"name":"X","mobile":"123","email":"bad"}' | jqx '.error.details.length >= 3')
check "validation lists offending fields" "$FIELDS" "true"
check "bad uuid param -> 400" "$(status GET "$API/customers/not-a-uuid" "$SALES")" "400"
check "unknown route -> 404" "$(status GET "$API/nope" "$ADMIN")" "404"

echo
echo "== 4. Pagination, search, filters =="
META=$(curl -s "$API/customers?page=1&limit=2" -H "Authorization: Bearer $SALES" | jqx '.meta.limit')
check "pagination limit honoured" "$META" "2"
COUNT=$(curl -s "$API/customers?page=1&limit=2" -H "Authorization: Bearer $SALES" | jqx '.data.length')
check "returns 2 rows" "$COUNT" "2"
HASNEXT=$(curl -s "$API/customers?page=1&limit=2" -H "Authorization: Bearer $SALES" | jqx '.meta.hasNextPage')
check "hasNextPage true" "$HASNEXT" "true"
SEARCH=$(curl -s "$API/customers?search=kulkarni" -H "Authorization: Bearer $SALES" | jqx '.data[0].businessName')
check "search by business name" "$SEARCH" "Kulkarni Traders"
LOWSTOCK=$(curl -s "$API/products?lowStock=true" -H "Authorization: Bearer $WH" | jqx '.data.length >= 2')
check "low-stock filter works" "$LOWSTOCK" "true"

echo
echo "== 5. Customer CRM write flow =="
# Unique per run so the suite is re-runnable against the same database.
MOBILE="9$(shuf -i 100000000-999999999 -n 1)"
NEWCUST=$(curl -s -X POST "$API/customers" -H "Authorization: Bearer $SALES" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Smoke Test Buyer\",\"mobile\":\"$MOBILE\",\"email\":\"smoke@test.in\",\"businessName\":\"Smoke Traders\",\"type\":\"WHOLESALE\",\"status\":\"LEAD\"}")
CUSTID=$(echo "$NEWCUST" | jqx '.data.id')
check "customer created" "$(echo "$NEWCUST" | jqx '.data.name')" "Smoke Test Buyer"
check "duplicate mobile -> 409" \
  "$(status POST "$API/customers" "$SALES" "{\"name\":\"Dup\",\"mobile\":\"$MOBILE\"}")" "409"
check "follow-up added" \
  "$(status POST "$API/customers/$CUSTID/follow-ups" "$SALES" '{"note":"Smoke test call","status":"ACTIVE"}')" "201"
NEWSTATUS=$(curl -s "$API/customers/$CUSTID" -H "Authorization: Bearer $SALES" | jqx '.data.status')
check "follow-up advanced status to ACTIVE" "$NEWSTATUS" "ACTIVE"

echo
echo "== 6. Stock ledger integrity =="
PROD=$(curl -s "$API/products?search=DISH-BAR" -H "Authorization: Bearer $WH")
PRODID=$(echo "$PROD" | jqx '.data[0].id')
STOCK0=$(echo "$PROD" | jqx '.data[0].currentStock')
echo "  (Dish Wash Bar opening stock: $STOCK0)"
curl -s -X POST "$API/stock/movements" -H "Authorization: Bearer $WH" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODID\",\"quantity\":10,\"type\":\"IN\",\"reason\":\"Smoke test receipt\"}" > /dev/null
STOCK1=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "IN movement raised stock by 10" "$STOCK1" "$((STOCK0+10))"
LEDGER=$(curl -s "$API/stock/movements?productId=$PRODID&type=IN" -H "Authorization: Bearer $WH" | jqx '.data[0].stockAfter')
check "ledger records balance-after" "$LEDGER" "$STOCK1"
OVER=$(curl -s -X POST "$API/stock/movements" -H "Authorization: Bearer $WH" -H 'Content-Type: application/json' \
  -d "{\"productId\":\"$PRODID\",\"quantity\":999999,\"type\":\"OUT\",\"reason\":\"Over-issue test\"}")
check "over-issue blocked (422)" \
  "$(status POST "$API/stock/movements" "$WH" "{\"productId\":\"$PRODID\",\"quantity\":999999,\"type\":\"OUT\",\"reason\":\"Over-issue test\"}")" "422"
check "error code is INSUFFICIENT_STOCK" "$(echo "$OVER" | jqx '.error.code')" "INSUFFICIENT_STOCK"
check "error reports available qty" "$(echo "$OVER" | jqx '.error.details.available')" "$STOCK1"
STOCK2=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "stock unchanged after rejection" "$STOCK2" "$STOCK1"

echo
echo "== 7. Challan lifecycle and stock coupling =="
DRAFT=$(curl -s -X POST "$API/challans" -H "Authorization: Bearer $SALES" -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CUSTID\",\"status\":\"DRAFT\",\"items\":[{\"productId\":\"$PRODID\",\"quantity\":5}]}")
CHID=$(echo "$DRAFT" | jqx '.data.id')
CHNO=$(echo "$DRAFT" | jqx '.data.challanNumber')
check "draft created" "$(echo "$DRAFT" | jqx '.data.status')" "DRAFT"
check "challan auto-numbered" "$(echo "$CHNO" | grep -Eq '^CH-[0-9]{6}-[0-9]{4}$' && echo yes || echo no)" "yes"
check "line stores product SNAPSHOT (sku)" "$(echo "$DRAFT" | jqx '.data.items[0].productSku')" "DISH-BAR-300G"
check "line stores snapshot price" "$(echo "$DRAFT" | jqx '.data.items[0].unitPrice !== undefined')" "true"
check "header stores customer snapshot" "$(echo "$DRAFT" | jqx '.data.customerName')" "Smoke Test Buyer"
STOCK3=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "DRAFT did NOT touch stock" "$STOCK3" "$STOCK1"

curl -s -X POST "$API/challans/$CHID/confirm" -H "Authorization: Bearer $WH" > /dev/null
STOCK4=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "CONFIRM deducted 5 units" "$STOCK4" "$((STOCK1-5))"
check "double confirm -> 409" "$(status POST "$API/challans/$CHID/confirm" "$WH")" "409"
check "editing confirmed challan -> 409" \
  "$(status PUT "$API/challans/$CHID" "$SALES" '{"notes":"should fail"}')" "409"
OUTMV=$(curl -s "$API/stock/movements?productId=$PRODID&type=OUT" -H "Authorization: Bearer $WH" | jqx '.data[0].reason')
check "OUT movement references challan" "$(echo "$OUTMV" | grep -q "$CHNO" && echo yes || echo no)" "yes"

curl -s -X POST "$API/challans/$CHID/cancel" -H "Authorization: Bearer $WH" -H 'Content-Type: application/json' \
  -d '{"reason":"Smoke test rollback"}' > /dev/null
STOCK5=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "CANCEL restored stock" "$STOCK5" "$STOCK1"
check "cancel again -> 409" \
  "$(status POST "$API/challans/$CHID/cancel" "$WH" '{"reason":"again"}')" "409"

echo
echo "== 8. Insufficient stock on challan confirm =="
BIG=$(curl -s -X POST "$API/challans" -H "Authorization: Bearer $SALES" -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CUSTID\",\"status\":\"CONFIRMED\",\"items\":[{\"productId\":\"$PRODID\",\"quantity\":999999}]}")
check "confirm beyond stock -> INSUFFICIENT_STOCK" "$(echo "$BIG" | jqx '.error.code')" "INSUFFICIENT_STOCK"
check "message names the product" "$(echo "$BIG" | jqx '.error.message.includes("Dish Wash Bar")')" "true"
STOCK6=$(curl -s "$API/products/$PRODID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
check "failed challan rolled back stock" "$STOCK6" "$STOCK1"
check "duplicate product line -> 400" \
  "$(status POST "$API/challans" "$SALES" "{\"customerId\":\"$CUSTID\",\"items\":[{\"productId\":\"$PRODID\",\"quantity\":1},{\"productId\":\"$PRODID\",\"quantity\":2}]}")" "400"

echo
echo "== 9. Concurrency: 8 simultaneous confirms of limited stock =="
# Product with exactly enough for 3 of the 8 requests.
RACESKU="RACE-$(date +%H%M%S)"
RACE=$(curl -s -X POST "$API/products" -H "Authorization: Bearer $WH" -H 'Content-Type: application/json' \
  -d "{\"name\":\"Race Test Widget\",\"sku\":\"$RACESKU\",\"category\":\"Test\",\"unitPrice\":10,\"currentStock\":3,\"minStockAlert\":0}")
RACEID=$(echo "$RACE" | jqx '.data.id')
for i in 1 2 3 4 5 6 7 8; do
  curl -s -o "/tmp/race_$i.json" -X POST "$API/challans" -H "Authorization: Bearer $SALES" \
    -H 'Content-Type: application/json' \
    -d "{\"customerId\":\"$CUSTID\",\"status\":\"CONFIRMED\",\"items\":[{\"productId\":\"$RACEID\",\"quantity\":1}]}" &
done
wait
OKS=$(grep -l '"success":true' /tmp/race_*.json 2>/dev/null | wc -l | tr -d ' ')
RACESTOCK=$(curl -s "$API/products/$RACEID" -H "Authorization: Bearer $WH" | jqx '.data.currentStock')
echo "  (8 concurrent confirms of 1 unit each, only 3 in stock)"
check "exactly 3 succeeded" "$OKS" "3"
check "final stock is 0, never negative" "$RACESTOCK" "0"
rm -f /tmp/race_*.json

echo
echo "== 10. PDF export and dashboard =="
curl -s "$API/challans/$CHID/pdf" -H "Authorization: Bearer $ACC" -o /tmp/challan.pdf
check "PDF downloads" "$(head -c 4 /tmp/challan.pdf)" "%PDF"
PDFSIZE=$(wc -c < /tmp/challan.pdf | tr -d ' ')
check "PDF has content (>1KB)" "$([ "$PDFSIZE" -gt 1000 ] && echo yes || echo no)" "yes"
rm -f /tmp/challan.pdf
DASH=$(curl -s "$API/dashboard/summary" -H "Authorization: Bearer $ACC")
check "dashboard returns customer totals" "$(echo "$DASH" | jqx '.data.customers.total >= 6')" "true"
check "dashboard returns low-stock list" "$(echo "$DASH" | jqx '.data.lowStockList.length >= 1')" "true"
check "dashboard returns stock value" "$(echo "$DASH" | jqx '.data.products.stockValue > 0')" "true"

echo
echo "=================================================="
echo "  PASSED: $PASS      FAILED: $FAIL"
echo "=================================================="
[ "$FAIL" -eq 0 ] || exit 1
