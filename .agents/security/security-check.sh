#!/usr/bin/env bash
#
# security-check.sh — kontrola zabezpečení webu
#
# Použití:  ./security-check.sh example.com
#           ./security-check.sh https://example.com
#
# Potřebuje: curl, openssl. Volitelně dig (DNS testy) a jq.
# Na macOS:  brew install bind  (kvůli dig)
#
# Návratová hodnota: 0 = vše prošlo, 1 = nalezeny problémy

set -uo pipefail

# ---------------------------------------------------------------
# Vstup
# ---------------------------------------------------------------
RAW="${1:-}"
if [[ -z "$RAW" ]]; then
  echo "Použití: $0 <domena>"
  echo "Příklad: $0 example.com"
  exit 2
fi

DOMAIN="${RAW#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%%/*}"
URL="https://${DOMAIN}"

PASS=0
FAIL=0
WARN=0

G=$'\033[0;32m'; R=$'\033[0;31m'; Y=$'\033[0;33m'; B=$'\033[0;34m'; N=$'\033[0m'

ok()   { echo "  ${G}[OK]${N}   $1"; PASS=$((PASS+1)); }
bad()  { echo "  ${R}[CHYBA]${N} $1"; FAIL=$((FAIL+1)); }
warn() { echo "  ${Y}[POZOR]${N} $1"; WARN=$((WARN+1)); }
info() { echo "  ${B}[INFO]${N} $1"; }
head1() { echo; echo "${B}=== $1 ===${N}"; }

need() { command -v "$1" >/dev/null 2>&1; }

echo
echo "Kontrola zabezpečení: ${URL}"
echo "Datum: $(date '+%Y-%m-%d %H:%M')"

# ---------------------------------------------------------------
# Stáhnutí hlaviček
# ---------------------------------------------------------------
HDR_RAW="$(curl -sSIL --max-time 20 -A 'security-check/1.0' "$URL" 2>/dev/null)"
if [[ -z "$HDR_RAW" ]]; then
  echo "${R}Web neodpovídá na ${URL}. Konec.${N}"
  exit 2
fi
# jen poslední odpověď po případných přesměrováních, malými písmeny
HDR="$(printf '%s' "$HDR_RAW" | tr -d '\r' | tr '[:upper:]' '[:lower:]')"

get_header() {
  printf '%s\n' "$HDR" | grep -i "^$1:" | tail -n1 | cut -d: -f2- | sed 's/^ *//'
}

# ---------------------------------------------------------------
# 1. HTTPS a přesměrování
# ---------------------------------------------------------------
head1 "1. HTTPS a přesměrování"

HTTP_CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "http://${DOMAIN}" 2>/dev/null)"
HTTP_LOC="$(curl -sI --max-time 15 "http://${DOMAIN}" 2>/dev/null | tr -d '\r' | grep -i '^location:' | cut -d' ' -f2-)"

if [[ "$HTTP_CODE" =~ ^30[178]$ ]] && [[ "$HTTP_LOC" == https://* ]]; then
  ok "http přesměrováno na https (${HTTP_CODE})"
elif [[ "$HTTP_CODE" =~ ^30 ]]; then
  warn "http přesměrovává, ale ne na https: ${HTTP_LOC:-?}"
else
  bad "http nepřesměrovává na https (kód ${HTTP_CODE})"
fi

FINAL_CODE="$(curl -s -o /dev/null -w '%{http_code}' -L --max-time 20 "$URL")"
if [[ "$FINAL_CODE" == "200" ]]; then
  ok "https odpovídá 200"
else
  warn "https vrací kód ${FINAL_CODE}"
fi

# ---------------------------------------------------------------
# 2. Bezpečnostní hlavičky
# ---------------------------------------------------------------
head1 "2. Bezpečnostní hlavičky"

# HSTS
HSTS="$(get_header 'strict-transport-security')"
if [[ -n "$HSTS" ]]; then
  MAXAGE="$(printf '%s' "$HSTS" | grep -o 'max-age=[0-9]*' | cut -d= -f2)"
  if [[ -n "$MAXAGE" ]] && (( MAXAGE >= 31536000 )); then
    ok "Strict-Transport-Security: max-age=${MAXAGE}"
  else
    warn "HSTS max-age je jen ${MAXAGE:-0} s, doporučeno 31536000+"
  fi
  [[ "$HSTS" == *includesubdomains* ]] && ok "HSTS includeSubDomains" \
    || warn "HSTS bez includeSubDomains"
  [[ "$HSTS" == *preload* ]] && info "HSTS preload nastaven (ověř zápis na hstspreload.org)"
else
  bad "Chybí Strict-Transport-Security"
fi

# CSP
CSP="$(get_header 'content-security-policy')"
CSP_RO="$(get_header 'content-security-policy-report-only')"
if [[ -n "$CSP" ]]; then
  ok "Content-Security-Policy přítomna"
  [[ "$CSP" == *"default-src"* ]] && ok "CSP má default-src" || warn "CSP nemá default-src"
  [[ "$CSP" == *"frame-ancestors"* ]] && ok "CSP má frame-ancestors" || warn "CSP nemá frame-ancestors"
  [[ "$CSP" == *"base-uri"* ]] && ok "CSP má base-uri" || warn "CSP nemá base-uri (riziko <base> injektáže)"
  [[ "$CSP" == *"form-action"* ]] && ok "CSP má form-action" || warn "CSP nemá form-action"
  [[ "$CSP" == *"object-src 'none'"* ]] && ok "CSP má object-src 'none'" || warn "CSP nemá object-src 'none'"

  SCRIPT_DIR="$(printf '%s' "$CSP" | tr ';' '\n' | grep -E "script-src" | head -n1)"
  if [[ -z "$SCRIPT_DIR" ]]; then
    SCRIPT_DIR="$(printf '%s' "$CSP" | tr ';' '\n' | grep -E "default-src" | head -n1)"
  fi
  if [[ "$SCRIPT_DIR" == *"unsafe-inline"* && "$SCRIPT_DIR" != *"nonce-"* && "$SCRIPT_DIR" != *"strict-dynamic"* ]]; then
    bad "script-src obsahuje 'unsafe-inline' bez nonce — CSP proti XSS prakticky nechrání"
  else
    ok "script-src bez holého 'unsafe-inline'"
  fi
  if [[ "$SCRIPT_DIR" == *"unsafe-eval"* ]]; then
    bad "script-src obsahuje 'unsafe-eval'"
  else
    ok "script-src bez 'unsafe-eval'"
  fi
  if [[ "$SCRIPT_DIR" == *" *"* || "$SCRIPT_DIR" == *"src *"* ]]; then
    bad "script-src obsahuje wildcard *"
  fi
elif [[ -n "$CSP_RO" ]]; then
  warn "CSP je zatím jen v Report-Only režimu, nevynucuje se"
else
  bad "Chybí Content-Security-Policy"
fi

# Ostatní hlavičky
check_exact() {
  local name="$1" want="$2" val
  val="$(get_header "$name")"
  if [[ -z "$val" ]]; then
    bad "Chybí ${name}"
  elif [[ "$val" == *"$want"* ]]; then
    ok "${name}: ${val}"
  else
    warn "${name}: ${val} (doporučeno ${want})"
  fi
}

check_exact "x-content-type-options" "nosniff"
check_exact "x-frame-options" "deny"
check_exact "cross-origin-opener-policy" "same-origin"
check_exact "cross-origin-resource-policy" "same-origin"

REF="$(get_header 'referrer-policy')"
if [[ -z "$REF" ]]; then
  bad "Chybí Referrer-Policy"
elif [[ "$REF" == *"unsafe-url"* || "$REF" == *"no-referrer-when-downgrade"* ]]; then
  warn "Referrer-Policy: ${REF} je slabá, použij strict-origin-when-cross-origin"
else
  ok "Referrer-Policy: ${REF}"
fi

PP="$(get_header 'permissions-policy')"
[[ -n "$PP" ]] && ok "Permissions-Policy nastavena" || warn "Chybí Permissions-Policy"

XSSP="$(get_header 'x-xss-protection')"
if [[ -z "$XSSP" ]]; then
  info "X-XSS-Protection nenastavena (v pořádku, hlavička je zastaralá)"
elif [[ "$XSSP" == "0" ]]; then
  ok "X-XSS-Protection: 0"
else
  warn "X-XSS-Protection: ${XSSP} — nastav na 0, starý filtr sám tvořil zranitelnosti"
fi

# ---------------------------------------------------------------
# 3. Únik informací
# ---------------------------------------------------------------
head1 "3. Únik informací o technologiích"

for h in x-powered-by x-aspnet-version x-aspnetmvc-version x-generator x-drupal-cache; do
  V="$(get_header "$h")"
  if [[ -n "$V" ]]; then
    warn "Hlavička ${h}: ${V} — odstraň ji"
  fi
done
[[ -z "$(get_header 'x-powered-by')" ]] && ok "X-Powered-By není odesílána"

SRV="$(get_header 'server')"
if [[ "$SRV" =~ [0-9]+\.[0-9]+ ]]; then
  warn "Server hlavička prozrazuje verzi: ${SRV}"
elif [[ -n "$SRV" ]]; then
  ok "Server: ${SRV} (bez čísla verze)"
fi

# ---------------------------------------------------------------
# 4. Odhalené citlivé soubory
# ---------------------------------------------------------------
head1 "4. Citlivé soubory"

FOUND_FILES=0
for p in ".env" ".env.local" ".env.production" ".git/config" ".git/HEAD" \
         "backup.sql" "db.sql" "dump.sql" "wp-config.php.bak" "config.json" \
         "package.json" "composer.json" ".DS_Store" "phpinfo.php" "server-status"; do
  RESP="$(curl -s -o /dev/null --max-time 8 -w '%{http_code}|%{content_type}' "${URL}/${p}")"
  CODE="${RESP%%|*}"
  CTYPE="${RESP#*|}"
  if [[ "$CODE" == "200" ]]; then
    FOUND_FILES=$((FOUND_FILES+1))
    if [[ "$CTYPE" == text/html* ]]; then
      # Nejspíš SPA fallback nebo vlastní 404 stránka, ne skutečný soubor
      warn "Vrací 200 jako HTML, ověř ručně: ${URL}/${p}"
    else
      bad "Veřejně dostupný citlivý soubor: ${URL}/${p} (${CTYPE})"
    fi
  fi
done
(( FOUND_FILES == 0 )) && ok "Žádná z 15 typických citlivých cest není dostupná"

# Výpis adresářů
DIRCODE="$(curl -s --max-time 8 "${URL}/assets/" | head -c 400 | tr '[:upper:]' '[:lower:]')"
if [[ "$DIRCODE" == *"index of /"* ]]; then
  bad "Zapnutý výpis adresářů (/assets/)"
else
  ok "Výpis adresářů se nezobrazuje"
fi

# security.txt
STCODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "${URL}/.well-known/security.txt")"
if [[ "$STCODE" == "200" ]]; then
  ok "security.txt je k dispozici"
else
  warn "Chybí /.well-known/security.txt"
fi

# ---------------------------------------------------------------
# 5. TLS certifikát
# ---------------------------------------------------------------
head1 "5. TLS"

if need openssl; then
  CERT="$(echo | timeout 15 openssl s_client -servername "$DOMAIN" -connect "${DOMAIN}:443" 2>/dev/null | openssl x509 -noout -dates -issuer -subject 2>/dev/null)"
  if [[ -n "$CERT" ]]; then
    NOT_AFTER="$(printf '%s' "$CERT" | grep 'notAfter=' | cut -d= -f2-)"
    ISSUER="$(printf '%s' "$CERT" | grep 'issuer=' | sed 's/.*CN *= *//')"
    if END_EPOCH="$(date -d "$NOT_AFTER" +%s 2>/dev/null)"; then :;
    else END_EPOCH="$(date -j -f '%b %d %T %Y %Z' "$NOT_AFTER" +%s 2>/dev/null || echo 0)"; fi
    NOW="$(date +%s)"
    if [[ "$END_EPOCH" != "0" ]]; then
      DAYS=$(( (END_EPOCH - NOW) / 86400 ))
      if (( DAYS > 20 )); then
        ok "Certifikát platí ještě ${DAYS} dní (vydal ${ISSUER})"
      elif (( DAYS > 0 )); then
        warn "Certifikát vyprší za ${DAYS} dní"
      else
        bad "Certifikát je prošlý"
      fi
    else
      info "Platnost do: ${NOT_AFTER}"
    fi
  else
    bad "Nepodařilo se načíst certifikát"
  fi

  # Staré protokoly
  for proto in tls1 tls1_1; do
    if echo | timeout 10 openssl s_client -"$proto" -connect "${DOMAIN}:443" >/dev/null 2>&1; then
      bad "Server přijímá zastaralý protokol ${proto}"
    else
      ok "${proto} je odmítnut"
    fi
  done

  if echo | timeout 10 openssl s_client -tls1_3 -connect "${DOMAIN}:443" >/dev/null 2>&1; then
    ok "TLS 1.3 podporováno"
  else
    warn "TLS 1.3 nepodporováno"
  fi
else
  info "openssl není nainstalováno, TLS testy přeskočeny"
fi

# ---------------------------------------------------------------
# 6. DNS
# ---------------------------------------------------------------
head1 "6. DNS a e-mail"

if need dig; then
  CAA="$(dig +short CAA "$DOMAIN" 2>/dev/null)"
  [[ -n "$CAA" ]] && ok "CAA záznam nastaven" || warn "Chybí CAA záznam"

  DS="$(dig +short DS "$DOMAIN" 2>/dev/null)"
  [[ -n "$DS" ]] && ok "DNSSEC (DS záznam) nalezen" || warn "DNSSEC není zapnuté"

  SPF="$(dig +short TXT "$DOMAIN" 2>/dev/null | grep -i 'v=spf1')"
  if [[ -n "$SPF" ]]; then
    if [[ "$SPF" == *"-all"* ]]; then
      ok "SPF s tvrdým -all"
    elif [[ "$SPF" == *"~all"* ]]; then
      warn "SPF má měkké ~all, zvaž -all"
    else
      warn "SPF bez all mechanismu: ${SPF}"
    fi
  else
    warn "Chybí SPF záznam (kdokoliv může spoofovat e-maily z domény)"
  fi

  DMARC="$(dig +short TXT "_dmarc.${DOMAIN}" 2>/dev/null | grep -i 'v=DMARC1')"
  if [[ -n "$DMARC" ]]; then
    if [[ "$DMARC" == *"p=reject"* ]]; then
      ok "DMARC p=reject"
    elif [[ "$DMARC" == *"p=quarantine"* ]]; then
      warn "DMARC p=quarantine, cílem je p=reject"
    else
      warn "DMARC p=none, jen monitoruje"
    fi
  else
    warn "Chybí DMARC záznam"
  fi
else
  info "dig není nainstalováno, DNS testy přeskočeny"
fi

# ---------------------------------------------------------------
# 7. Cookies
# ---------------------------------------------------------------
head1 "7. Cookies"

COOKIES="$(printf '%s\n' "$HDR" | grep -i '^set-cookie:')"
if [[ -z "$COOKIES" ]]; then
  ok "Web nenastavuje žádné cookies"
else
  while IFS= read -r c; do
    NAME="$(printf '%s' "$c" | sed 's/^set-cookie: *//' | cut -d= -f1)"
    [[ "$c" == *"secure"* ]]   && ok "cookie ${NAME}: Secure"   || bad "cookie ${NAME}: chybí Secure"
    [[ "$c" == *"httponly"* ]] && ok "cookie ${NAME}: HttpOnly" || warn "cookie ${NAME}: chybí HttpOnly"
    [[ "$c" == *"samesite"* ]] && ok "cookie ${NAME}: SameSite" || warn "cookie ${NAME}: chybí SameSite"
  done <<< "$COOKIES"
fi

# ---------------------------------------------------------------
# Shrnutí
# ---------------------------------------------------------------
head1 "Shrnutí"
echo "  ${G}Prošlo:${N}  ${PASS}"
echo "  ${Y}Varování:${N} ${WARN}"
echo "  ${R}Chyby:${N}   ${FAIL}"
echo
echo "Doplň ještě ruční testy:"
echo "  https://securityheaders.com/?q=${DOMAIN}"
echo "  https://www.ssllabs.com/ssltest/analyze.html?d=${DOMAIN}"
echo "  https://developer.mozilla.org/en-US/observatory/analyze?host=${DOMAIN}"
echo "  https://csp-evaluator.withgoogle.com/"
echo

if (( FAIL > 0 )); then
  exit 1
fi
exit 0
