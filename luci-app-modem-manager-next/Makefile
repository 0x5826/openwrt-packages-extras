include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-modem-manager-next
PKG_VERSION:=1.0.0
PKG_RELEASE:=1

PKG_LICENSE:=MIT
PKG_MAINTAINER:=Dante <dante@seckv.com>

LUCI_TITLE:=LuCI support for Cellular Modem Management (Next-Gen)
LUCI_DEPENDS:=+ucode +ucode-mod-fs +ucode-mod-ubus +ucode-mod-uci +kmod-usb-net +kmod-usb-serial +kmod-usb-serial-option
LUCI_PKGARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

define Package/$(PKG_NAME)
  $(call Package/luci/webtemplate)
  TITLE:=$(LUCI_TITLE)
  DEPENDS:=$(LUCI_DEPENDS)
  PROVIDES:=luci-app-modem-manager luci-app-modemmanager
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/modemmanager
endef

define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] || {
	chmod 0755 /etc/init.d/modemmanager 2>/dev/null || true
	chmod 0755 /etc/hotplug.d/usb/20-modem-hotplug 2>/dev/null || true
	chmod 0755 /usr/libexec/modem-at-executor /usr/libexec/modem-detect /usr/libexec/modem-collector 2>/dev/null || true
	/etc/init.d/rpcd restart
	/etc/init.d/modemmanager enable
	/etc/init.d/modemmanager restart
}
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
