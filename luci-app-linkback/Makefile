# SPDX-License-Identifier: Apache-2.0
#
# Copyright (C) 2026 Dante <dante@seckv.com>
#
# This is free software, licensed under the Apache License, Version 2.0 .
#

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-linkback
PKG_VERSION:=1.0.0
PKG_RELEASE:=1
PKG_MAINTAINER:=Dante

PKG_BUILD_DIR:=$(BUILD_DIR)/$(PKG_NAME)

include $(INCLUDE_DIR)/package.mk

define Package/$(PKG_NAME)
  SECTION:=luci
  CATEGORY:=LuCI
  SUBMENU:=3. Applications
  TITLE:=LuCI support for Multi-WAN LinkBack Failover/Failback
  DEPENDS:=+luci-base +ucode +ucode-mod-fs +ucode-mod-uci +ucode-mod-ubus +libuci +libubus +libubox +libblobmsg-json +ip-full
  MAINTAINER:=Dante
  PKGARCH:=all
endef

define Package/$(PKG_NAME)/description
  LuCI Support for LinkBack: A lightweight C-based Multi-WAN link fault detection and seamless route failover/failback daemon.
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/linkback
endef

define Build/Prepare
	mkdir -p $(PKG_BUILD_DIR)
	$(CP) ./src/* $(PKG_BUILD_DIR)/
endef

define Build/Compile
	$(MAKE) -C $(PKG_BUILD_DIR) \
		CC="$(TARGET_CC)" \
		CFLAGS="$(TARGET_CFLAGS)" \
		LDFLAGS="$(TARGET_LDFLAGS)"
endef

define Package/$(PKG_NAME)/install
	# Install LuCI static resource files (JS)
	$(INSTALL_DIR) $(1)/www/luci-static/resources/view/linkback
	$(INSTALL_DATA) ./htdocs/luci-static/resources/view/linkback/* $(1)/www/luci-static/resources/view/linkback/

	# Install routing menus and ACLs
	$(INSTALL_DIR) $(1)/usr/share/luci/menu.d
	$(INSTALL_DATA) ./root/usr/share/luci/menu.d/* $(1)/usr/share/luci/menu.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/acl.d
	$(INSTALL_DATA) ./root/usr/share/rpcd/acl.d/* $(1)/usr/share/rpcd/acl.d/
	$(INSTALL_DIR) $(1)/usr/share/rpcd/ucode
	$(INSTALL_DATA) ./root/usr/share/rpcd/ucode/* $(1)/usr/share/rpcd/ucode/

	# Install config and init files
	$(INSTALL_DIR) $(1)/etc/config
	$(INSTALL_CONF) ./files/linkback.config $(1)/etc/config/linkback
	$(INSTALL_DIR) $(1)/etc/init.d
	$(INSTALL_BIN) ./files/linkback.init $(1)/etc/init.d/linkback

	# Install C daemon binary
	$(INSTALL_DIR) $(1)/usr/sbin
	$(INSTALL_BIN) $(PKG_BUILD_DIR)/linkbackd $(1)/usr/sbin/linkbackd
endef

define Package/$(PKG_NAME)/postinst
#!/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	/etc/init.d/rpcd restart
	/etc/init.d/linkback enable
	/etc/init.d/linkback restart
}
exit 0
endef

$(eval $(call BuildPackage,$(PKG_NAME)))
