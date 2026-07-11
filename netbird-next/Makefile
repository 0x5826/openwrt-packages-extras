include $(TOPDIR)/rules.mk

PKG_NAME:=netbird-next
PKG_VERSION:=0.74.4
PKG_RELEASE:=1

PKG_SOURCE:=netbird-$(PKG_VERSION).tar.gz
PKG_SOURCE_URL:=https://codeload.github.com/netbirdio/netbird/tar.gz/v$(PKG_VERSION)?
PKG_HASH:=3b837aa6d1c6aa06bdf9bbcc0b67aa2a616a6d53b00eb1b3f58c9880307a7d0b

PKG_BUILD_DIR:=$(BUILD_DIR)/netbird-$(PKG_VERSION)

PKG_MAINTAINER:=Wesley Gimenes <wehagy@proton.me>
PKG_LICENSE:=BSD-3-Clause
PKG_LICENSE_FILES:=LICENSE

PKG_BUILD_DEPENDS:=golang/host
PKG_BUILD_PARALLEL:=1
PKG_BUILD_FLAGS:=no-mips16

GO_PKG:=github.com/netbirdio/netbird
GO_PKG_BUILD_PKG:=$(GO_PKG)/client
GO_PKG_LDFLAGS_X:=$(GO_PKG)/version.version=$(PKG_VERSION)

include $(INCLUDE_DIR)/package.mk
include $(TOPDIR)/feeds/packages/lang/golang/golang-package.mk

define Package/netbird-next
  SECTION:=net
  CATEGORY:=Network
  SUBMENU:=VPN
  TITLE:=Connect your devices into a single secure private WireGuard®-based mesh network (Next)
  URL:=https://netbird.io
  DEPENDS:=$(GO_ARCH_DEPENDS) +kmod-wireguard
  PROVIDES:=netbird
  CONFLICTS:=netbird
endef

define Package/netbird-next/description
  NetBird is an open-source VPN management platform built on top of WireGuard® making it easy to create
  secure private networks for your organization or home.

  This is the 'next' version which follows the latest upstream releases.
endef

define Package/netbird-next/conffiles
/root/.config/netbird/
/etc/config/netbird
endef

define Package/netbird-next/postinst
#!/bin/sh
if [ -z "$${IPKG_INSTROOT}" ]; then
	/etc/init.d/netbird disable
fi
exit 0
endef

define Package/netbird-next/install
	$(call GoPackage/Package/Install/Bin,$(1))
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_DIR) $(1)/etc/config
	mv $(1)/usr/bin/client $(1)/usr/bin/netbird
	$(INSTALL_BIN) $(CURDIR)/files/netbird.init $(1)/etc/init.d/netbird
	$(INSTALL_CONF) $(CURDIR)/files/netbird.config $(1)/etc/config/netbird
endef

$(eval $(call GoBinPackage,netbird-next))
$(eval $(call BuildPackage,netbird-next))
