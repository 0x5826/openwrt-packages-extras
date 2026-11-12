#!/bin/sh
# FlowProxy shared runtime helpers

UCI_CONFIG="flowproxy"
LOG_FILE="/var/log/flowproxy.log"
NFT_CONF="/tmp/flowproxy/nft.conf"
GENERATE_SCRIPT="/usr/share/flowproxy/generate_nft.sh"
STATE_FILE="/var/run/flowproxy.running"
DEGRADED_FILE="/var/run/flowproxy.degraded"
GEN_FILE="/var/run/flowproxy.gen"
MARK_FILE="/var/run/flowproxy.mark"
LOCK_FILE="/var/lock/flowproxy.lock"

get_level_weight() {
	case "$1" in
		debug) echo 0 ;;
		info)  echo 1 ;;
		warn)  echo 2 ;;
		error) echo 3 ;;
		*)     echo 1 ;;
	esac
}

log_msg() {
	local level="$1"; shift
	local msg="$*"
	local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

	# 等级过滤
	local conf_level=$(uci -q get "$UCI_CONFIG.global.log_level")
	conf_level="${conf_level:-info}"
	local conf_weight=$(get_level_weight "$conf_level")
	local msg_weight=$(get_level_weight "$level")
	[ "$msg_weight" -lt "$conf_weight" ] && return

	# 简单的日志截断逻辑，防止日志无限增长
	# 读取配置的大小限制，默认 1024KB
	local max_size=$(uci -q get "$UCI_CONFIG.global.log_size")
	case "$max_size" in
		''|*[!0-9]*) max_size=1024 ;;
	esac
	local current_size=$(du -k "$LOG_FILE" 2>/dev/null | cut -f1)
	if [ "${current_size:-0}" -gt "$max_size" ]; then
		mv "$LOG_FILE" "$LOG_FILE.old"
		touch "$LOG_FILE"
	fi

	echo "[$timestamp] [$level] $msg" >> "$LOG_FILE"
}

acquire_lock() {
	[ "${FLOWPROXY_LOCKED:-0}" = "1" ] && return 0
	mkdir -p "$(dirname "$LOCK_FILE")"
	if command -v flock >/dev/null 2>&1; then
		exec 9>"$LOCK_FILE"
		flock -x 9 || { exec 9>&- 2>/dev/null; return 1; }
		FLOWPROXY_LOCK_METHOD="flock"
		FLOWPROXY_LOCKED=1
		return 0
	else
		local wait_cnt=0
		while ! mkdir "${LOCK_FILE}.d" 2>/dev/null; do
			local lock_pid=$(cat "${LOCK_FILE}.d/pid" 2>/dev/null)
			if [ -n "$lock_pid" ] && [ "$lock_pid" != "$$" ] && ! kill -0 "$lock_pid" 2>/dev/null; then
				log_msg warn "Removing stale lock held by dead PID $lock_pid"
				rm -rf "${LOCK_FILE}.d"
				continue
			fi
			wait_cnt=$((wait_cnt + 1))
			if [ "$wait_cnt" -ge 50 ]; then
				log_msg error "Timed out waiting for lock ${LOCK_FILE}.d"
				return 1
			fi
			sleep 1
		done
		echo "$$" > "${LOCK_FILE}.d/pid"
		FLOWPROXY_LOCK_METHOD="mkdir"
		FLOWPROXY_LOCKED=1
		return 0
	fi
}

release_lock() {
	[ "${FLOWPROXY_LOCKED:-0}" != "1" ] && return 0
	if [ "${FLOWPROXY_LOCK_METHOD:-}" = "flock" ]; then
		flock -u 9 2>/dev/null
		exec 9>&- 2>/dev/null
	elif [ "${FLOWPROXY_LOCK_METHOD:-}" = "mkdir" ]; then
		rm -f "${LOCK_FILE}.d/pid" 2>/dev/null
		rmdir "${LOCK_FILE}.d" 2>/dev/null
	fi
	FLOWPROXY_LOCK_METHOD=""
	FLOWPROXY_LOCKED=0
	return 0
}

check_env() {
	# 检测核心二进制工具是否存在
	if ! command -v nft >/dev/null 2>&1; then
		log_msg error "nftables binary not found"
		return 1
	fi
	return 0
}

check_config() {
	local proxy_server_ip_addr=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	[ -z "$proxy_server_ip_addr" ] && { log_msg error "proxy_server_ip_addr not configured"; return 1; }
	return 0
}

apply_nft_rules() {
	log_msg info "Generating nftables configuration..."
	local conf_level=$(uci -q get "$UCI_CONFIG.global.log_level" || echo "info")

	mkdir -p "$(dirname "$NFT_CONF")"
	if [ -x "$GENERATE_SCRIPT" ]; then
		# 传递日志等级并捕获 stderr 到临时文件
		local err_file="/tmp/flowproxy/gen_err.tmp"
		FLOWPROXY_LOG_LEVEL="$conf_level" "$GENERATE_SCRIPT" >/dev/null 2> "$err_file"
		local ret=$?

		# 将脚本的输出记录到日志
		if [ -s "$err_file" ]; then
			while read -r line; do
				log_msg debug "Script: $line"
			done < "$err_file"
		fi
		rm -f "$err_file"

		if [ $ret -eq 0 ]; then
			log_msg info "Applying nftables rules from $NFT_CONF"
			# 确保内核支持 inet 表
			nft delete table inet flowproxy 2>/dev/null
			if nft -f "$NFT_CONF"; then
				return 0
			else
				log_msg error "nftables rules application failed (syntax error)"
				return 1
			fi
		else
			log_msg error "Failed to generate nftables config"
			return 1
		fi
	else
		log_msg error "Generator script $GENERATE_SCRIPT not found or not executable"
		return 1
	fi
}

restore_nft_rules() {
	if [ -s "$NFT_CONF" ]; then
		log_msg info "Restoring nftables rules from cached $NFT_CONF"
		nft delete table inet flowproxy 2>/dev/null
		if nft -f "$NFT_CONF"; then
			return 0
		fi
		log_msg warn "Cached nftables config failed, regenerating..."
	fi
	apply_nft_rules
}

resolve_master_iface() {
	local iface="$1"
	if [ -L "/sys/class/net/$iface/master" ]; then
		local master_path=$(readlink "/sys/class/net/$iface/master" 2>/dev/null)
		local master_name=$(basename "$master_path" 2>/dev/null)
		[ -n "$master_name" ] && { echo "$master_name"; return; }
	fi
	echo "$iface"
}

add_route() {
	local proxy_server_ip_addr=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	local conf_iface=$(uci -q get "$UCI_CONFIG.global.interface"); conf_iface="${conf_iface:-br-lan}"
	local interface=$(resolve_master_iface "$conf_iface")
	local traffic_mark=$(uci -q get "$UCI_CONFIG.global.traffic_mark"); traffic_mark="${traffic_mark:-0x666}"
	local routing_table=$(uci -q get "$UCI_CONFIG.global.routing_table"); routing_table="${routing_table:-888}"
	local rule_priority=$(uci -q get "$UCI_CONFIG.global.rule_priority"); rule_priority="${rule_priority:-1000}"

	# 1. 先尝试用旧记录清理一次，防止由于配置变更导致的残留
	delete_route "quiet"

	log_msg info "Setting up routing table $routing_table and rule for mark $traffic_mark with priority $rule_priority..."

	# 2. 确保新标记和表的规则是干净的
	while ip rule del fwmark "$traffic_mark" lookup "$routing_table" 2>/dev/null; do :; done
	ip route flush table "$routing_table" 2>/dev/null

	# 3. 添加路由和策略，成功后再记录状态文件
	local err
	if ! err=$(ip route add default via "$proxy_server_ip_addr" dev "$interface" table "$routing_table" 2>&1); then
		rm -f "$MARK_FILE"
		log_msg error "Failed to add default route: $err"
		return 1
	fi
	echo "$traffic_mark:$routing_table:$rule_priority" > "$MARK_FILE"
	err=$(ip rule add fwmark "$traffic_mark" lookup "$routing_table" priority "$rule_priority" 2>&1)
	if [ $? -eq 0 ]; then
		log_msg info "Route added: via $proxy_server_ip_addr dev $interface table $routing_table for mark $traffic_mark with priority $rule_priority"
		return 0
	else
		log_msg error "Failed to add ip rule: $err"
		delete_route
		return 1
	fi
}

delete_route() {
	local quiet="$1"

	# 1. 获取两组清理目标：旧值(记录文件) 和 新值(当前UCI)
	local old_mark="" old_table="" old_prio=""
	if [ -f "$MARK_FILE" ]; then
		local saved_val=$(cat "$MARK_FILE")
		old_mark=$(echo "$saved_val" | cut -d':' -f1)
		old_table=$(echo "$saved_val" | cut -d':' -f2)
		old_prio=$(echo "$saved_val" | cut -d':' -f3)
		[ "$quiet" != "quiet" ] && rm -f "$MARK_FILE"
	fi

	local curr_mark=$(uci -q get "$UCI_CONFIG.global.traffic_mark"); curr_mark="${curr_mark:-0x666}"
	local curr_table=$(uci -q get "$UCI_CONFIG.global.routing_table"); curr_table="${curr_table:-888}"
	local curr_prio=$(uci -q get "$UCI_CONFIG.global.rule_priority"); curr_prio="${curr_prio:-1000}"

	[ "$quiet" != "quiet" ] && log_msg info "Cleaning up FlowProxy routes (Atomic Mode)..."

	# 2. 核心清理函数：只清理带 fwmark 且指向特定 table 的规则
	safe_del_rule() {
		local m="$1" t="$2" p="$3"
		[ -z "$m" ] || [ -z "$t" ] && return
		log_msg debug "Attempting cleanup: mark=$m, table=$t, priority=${p:-any}"
		# 精准清理 (带优先级)
		[ -n "$p" ] && while ip rule del fwmark "$m" lookup "$t" priority "$p" 2>/dev/null; do
			log_msg debug "Removed stale ip rule: mark $m lookup $t priority $p"
		done
		# 模糊清理 (不带优先级，防止配置中途被手动改动)
		while ip rule del fwmark "$m" lookup "$t" 2>/dev/null; do
			log_msg debug "Removed stale ip rule (fuzzy): mark $m lookup $t"
		done
		# 清空路由表
		ip route flush table "$t" 2>/dev/null
		log_msg debug "Flushed routing table $t"
	}

	# 执行清理：先清旧值，再清当前值 (防止残留)
	safe_del_rule "$old_mark" "$old_table" "$old_prio"
	[ "$old_mark" != "$curr_mark" ] || [ "$old_table" != "$curr_table" ] && \
		safe_del_rule "$curr_mark" "$curr_table" "$curr_prio"
}

delete_nft() {
	nft delete table inet flowproxy 2>/dev/null
	log_msg info "Removed nftables table 'flowproxy'"
}

_norm_server_list() {
	local raw="$1"
	local out="" s
	for s in $(echo "$raw" | tr ',' ' '); do
		[ -n "$s" ] && out="${out:+$out }$s"
	done
	echo "$out"
}

_restart_dnsmasq_unlocked() {
	if [ "${FLOWPROXY_LOCK_METHOD:-}" = "flock" ]; then
		/etc/init.d/dnsmasq restart 9>&-
	else
		/etc/init.d/dnsmasq restart
	fi
}

_backup_dns_if_needed() {
	if ! uci -q get "$UCI_CONFIG.dns_backup" >/dev/null; then
		local old_noresolv=$(uci -q get dhcp.@dnsmasq[0].noresolv)
		local old_dns_redirect=$(uci -q get dhcp.@dnsmasq[0].dns_redirect)
		local old_servers=$(uci -q get dhcp.@dnsmasq[0].server | tr '\n ' ',,' | sed 's/,,*/,/g; s/^,//; s/,$//')

		log_msg debug "Backing up DNS: noresolv=${old_noresolv:-empty}, redirect=${old_dns_redirect:-empty}, servers=${old_servers:-empty}"

		uci set "$UCI_CONFIG.dns_backup=dns_backup"
		[ -n "$old_noresolv" ] && uci set "$UCI_CONFIG.dns_backup.noresolv=$old_noresolv"
		[ -n "$old_dns_redirect" ] && uci set "$UCI_CONFIG.dns_backup.dns_redirect=$old_dns_redirect"
		[ -n "$old_servers" ] && uci set "$UCI_CONFIG.dns_backup.servers=$old_servers"
		uci commit "$UCI_CONFIG" || return 1
	fi
	return 0
}

_apply_dnsmasq_config() {
	local target_noresolv="$1"
	local target_redirect="$2"
	local target_servers_norm="$3"
	local delete_redirect_if_empty="$4"

	local cur_noresolv=$(uci -q get dhcp.@dnsmasq[0].noresolv)
	local cur_redirect=$(uci -q get dhcp.@dnsmasq[0].dns_redirect)
	local cur_servers=$(_norm_server_list "$(uci -q get dhcp.@dnsmasq[0].server)")

	local redirect_match=0
	if [ "$delete_redirect_if_empty" = "1" ] && [ -z "$target_redirect" ]; then
		[ -z "$cur_redirect" ] && redirect_match=1
	else
		[ "$cur_redirect" = "$target_redirect" ] && redirect_match=1
	fi

	if [ "$cur_noresolv" = "$target_noresolv" ] && [ "$redirect_match" = "1" ] && [ "$cur_servers" = "$target_servers_norm" ]; then
		log_msg debug "DNS configuration already matches target, skipping commit and dnsmasq restart"
		return 0
	fi

	uci set dhcp.@dnsmasq[0].noresolv="$target_noresolv"
	if [ -n "$target_redirect" ]; then
		uci set dhcp.@dnsmasq[0].dns_redirect="$target_redirect"
	elif [ "$delete_redirect_if_empty" = "1" ]; then
		uci -q delete dhcp.@dnsmasq[0].dns_redirect
	fi

	uci -q delete dhcp.@dnsmasq[0].server
	if [ -n "$target_servers_norm" ]; then
		local s
		for s in $target_servers_norm; do
			[ -n "$s" ] && uci add_list dhcp.@dnsmasq[0].server="$s"
		done
	fi

	uci commit dhcp || return 1
	_restart_dnsmasq_unlocked
}

setup_dns() {
	local enabled=$(uci -q get "$UCI_CONFIG.global.enabled")
	local dns_proxy_enabled=$(uci -q get "$UCI_CONFIG.global.dns_proxy_enabled")
	local proxy_server_dns_port=$(uci -q get "$UCI_CONFIG.global.proxy_server_dns_port"); proxy_server_dns_port="${proxy_server_dns_port:-5353}"
	local proxy_server_ip_addr=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")

	# Only apply DNS proxy if BOTH main service and DNS proxy are enabled
	if [ "${enabled:-0}" != "1" ] || [ "${dns_proxy_enabled:-0}" != "1" ]; then
		cleanup_dns
		return $?
	fi

	[ -z "$proxy_server_ip_addr" ] && { log_msg error "proxy_server_ip_addr not configured, cannot setup DNS"; return 1; }

	log_msg info "Setting up DNS redirection to $proxy_server_ip_addr#$proxy_server_dns_port..."

	_backup_dns_if_needed || return 1

	log_msg debug "Applying DNS target: noresolv=1, redirect=0, server=$proxy_server_ip_addr#$proxy_server_dns_port"
	_apply_dnsmasq_config "1" "0" "${proxy_server_ip_addr}#${proxy_server_dns_port}" "0"
}

restore_dnsmasq_from_backup() {
	if uci -q get "$UCI_CONFIG.dns_backup" >/dev/null; then
		log_msg info "Restoring original DNS configuration to dnsmasq..."

		local noresolv=$(uci -q get "$UCI_CONFIG.dns_backup.noresolv")
		local dns_redirect=$(uci -q get "$UCI_CONFIG.dns_backup.dns_redirect")
		local servers=$(uci -q get "$UCI_CONFIG.dns_backup.servers")
		local servers_norm=$(_norm_server_list "$servers")

		noresolv="${noresolv:-0}"
		log_msg debug "Restoring DNS values: noresolv=$noresolv, redirect=${dns_redirect:-empty}, servers=${servers_norm:-empty}"

		_apply_dnsmasq_config "$noresolv" "$dns_redirect" "$servers_norm" "1" || return 1
	fi
	return 0
}

cleanup_dns() {
	if uci -q get "$UCI_CONFIG.dns_backup" >/dev/null; then
		restore_dnsmasq_from_backup || return 1
		uci delete "$UCI_CONFIG.dns_backup"
		uci commit "$UCI_CONFIG"
	fi
	return 0
}

do_degrade() {
	local proxy_ip=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	log_msg warn "Proxy server ${proxy_ip:-unknown} unreachable, hot-degrading FlowProxy to direct mode..."
	# 先写入降级标记，避免 RPCD 状态自愈误删 STATE_FILE
	touch "$DEGRADED_FILE"
	delete_route
	delete_nft
	# 热降级：仅从 flowproxy.dns_backup 读取并还原 dnsmasq，保留 UCI 备份不改写 flowproxy
	restore_dnsmasq_from_backup
	log_msg warn "FlowProxy hot-degraded to direct mode (monitoring remains active)"
}

do_recover() {
	local proxy_ip=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	log_msg info "Proxy server ${proxy_ip:-unknown} is online, hot-recovering FlowProxy..."
	restore_nft_rules || return 1
	add_route || { delete_nft; return 1; }
	setup_dns || { restore_dnsmasq_from_backup; delete_route; delete_nft; return 1; }
	rm -f "$DEGRADED_FILE"
	log_msg info "FlowProxy hot-recovered to active proxy mode"
	return 0
}
