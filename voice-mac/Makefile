# ZakazIQ Voice — sestavení aplikace na Macu. Postup, podpis a oprávnění: README.md.
#
#   make test      testy (Swift Testing)
#   make build     přeloží aplikaci
#   make app       složí a podepíše build/ZakazIQ Voice.app
#   make install   zkopíruje aplikaci do ~/Applications (běžící ukončí)
#   make run       install + spustí
#   make icon      znovu vykreslí Resources/AppIcon.icns
#   make clean
#
# Podpis: SIGN_ID je název certifikátu v Klíčence (nebo jeho otisk SHA-1).
# SIGN_ID=- = podpis „ad hoc" jen na zkoušku: macOS pak po každém sestavení zapomene oprávnění.

APP_NAME    := ZakazIQ Voice
EXEC        := ZakazIQVoice
BUNDLE_ID   := cz.zakaziq.voice
SIGN_ID     ?= ZakazIQ Voice vývoj
CONFIG      ?= release
BUILD_DIR   := build
APP         := $(BUILD_DIR)/$(APP_NAME).app
INSTALL_DIR ?= $(HOME)/Applications
ENTITLEMENTS := Resources/ZakazIQVoice.entitlements

.PHONY: all build test app sign install run icon clean

all: test app

build:
	swift build -c $(CONFIG) --product $(EXEC)

test:
	swift test

app: build
	@rm -rf "$(APP)"
	@mkdir -p "$(APP)/Contents/MacOS" "$(APP)/Contents/Resources/Fonts"
	@cp "$$(swift build -c $(CONFIG) --show-bin-path)/$(EXEC)" "$(APP)/Contents/MacOS/$(EXEC)"
	@cp Resources/Info.plist "$(APP)/Contents/Info.plist"
	@cp Resources/AppIcon.icns "$(APP)/Contents/Resources/AppIcon.icns"
	@cp Resources/Fonts/* "$(APP)/Contents/Resources/Fonts/"
	@plutil -lint -s "$(APP)/Contents/Info.plist"
	@$(MAKE) --no-print-directory sign

sign:
	@id="$(SIGN_ID)"; \
	if [ "$$id" = "-" ]; then \
	  echo "Pozor: podpis ad hoc. macOS po každém sestavení zapomene oprávnění."; \
	elif ! printf '%s' "$$id" | grep -Eq '^[0-9A-Fa-f]{40}$$'; then \
	  hash=$$(security find-identity -p codesigning | awk -v n="\"$$id\"" 'index($$0, n) { print $$2; exit }'); \
	  if [ -z "$$hash" ]; then \
	    echo "Chybí podpisová identita „$$id“ v Klíčence."; \
	    echo "Vytvořte ji podle voice-mac/README.md (Asistent certifikátů → Podepisování kódu),"; \
	    echo "nebo na zkoušku: make app SIGN_ID=-"; \
	    exit 1; \
	  fi; \
	  id="$$hash"; \
	fi; \
	codesign --remove-signature "$(APP)/Contents/MacOS/$(EXEC)" 2>/dev/null || true; \
	codesign --force --options runtime --timestamp=none \
	  --entitlements "$(ENTITLEMENTS)" --identifier "$(BUNDLE_ID)" \
	  --sign "$$id" "$(APP)" && \
	codesign --verify --strict "$(APP)" && \
	echo "Podepsáno: $(APP)" && \
	codesign --display --requirements - "$(APP)" 2>/dev/null | sed -n 's/^designated => /Poznávací znak pro macOS: /p'

install: app
	@pkill -x "$(EXEC)" 2>/dev/null && sleep 0.5 || true
	@mkdir -p "$(INSTALL_DIR)"
	@rm -rf "$(INSTALL_DIR)/$(APP_NAME).app"
	@ditto "$(APP)" "$(INSTALL_DIR)/$(APP_NAME).app"
	@echo "Nainstalováno: $(INSTALL_DIR)/$(APP_NAME).app"

run: install
	@open "$(INSTALL_DIR)/$(APP_NAME).app"

icon:
	@mkdir -p "$(BUILD_DIR)"
	swift Scripts/AppIcon.swift "$(BUILD_DIR)/AppIcon.iconset"
	iconutil -c icns "$(BUILD_DIR)/AppIcon.iconset" -o Resources/AppIcon.icns

clean:
	rm -rf .build "$(BUILD_DIR)"
