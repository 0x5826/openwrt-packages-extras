#!/bin/sh
# FlowProxy shared runtime helpers (iptables/ipset backend)

if ! command -v config_load >/dev/null 2>&1 && [ -r /lib/functions.sh ]; then
	. /lib/functions.sh
fi

umask 077

UCI_CONFIG="flowproxy"
LOG_FILE="/var/log/flowproxy.log"
IPTABLES_RULES="/tmp/flowproxy/iptables.rules"
GENERATE_SCRIPT="/usr/share/flowproxy/generate_iptables.sh"
STATE_FILE="/var/run/flowproxy.running"
DEGRADED_FILE="/var/run/flowproxy.degraded"
GEN_FILE="/var/run/flowproxy.gen"
MARK_FILE="/var/run/flowproxy.mark"
TARGET_FILE="/var/run/flowproxy.target"
WD_CFG_FILE="/var/run/flowproxy.wd_cfg"
WD_PID_FILE="/var/run/flowproxy.wd_pid"
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
	local max_wait="${1:-30}"
	[ "${FLOWPROXY_LOCKED:-0}" = "1" ] && return 0
	mkdir -p "$(dirname "$LOCK_FILE")"
	if command -v flock >/dev/null 2>&1; then
		exec 9>"$LOCK_FILE"
		local wait_cnt=0
		while ! flock -x -n 9 2>/dev/null; do
			if [ "$wait_cnt" -ge "$max_wait" ]; then
				exec 9>&- 2>/dev/null
				return 1
			fi
			wait_cnt=$((wait_cnt + 1))
			sleep 1
		done
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
			if [ "$wait_cnt" -ge "$max_wait" ]; then
				log_msg error "Timed out waiting for lock ${LOCK_FILE}.d"
				return 1
			fi
			wait_cnt=$((wait_cnt + 1))
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
	if ! command -v iptables >/dev/null 2>&1; then
		log_msg error "iptables binary not found"
		return 1
	fi
	if ! command -v ipset >/dev/null 2>&1; then
		log_msg error "ipset binary not found"
		return 1
	fi
	return 0
}

check_config() {
	local proxy_server_ip_addr=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	[ -z "$proxy_server_ip_addr" ] && { log_msg error "proxy_server_ip_addr not configured"; return 1; }
	local tcp_enabled=$(uci -q get "$UCI_CONFIG.global.tcp_enabled"); tcp_enabled="${tcp_enabled:-1}"
	local udp_enabled=$(uci -q get "$UCI_CONFIG.global.udp_enabled"); udp_enabled="${udp_enabled:-1}"
	if [ "$tcp_enabled" != "1" ] && [ "$udp_enabled" != "1" ]; then
		log_msg error "Both TCP and UDP diversion are disabled"
		return 1
	fi
	return 0
}

destroy_single_ipset() {
	ipset destroy "$1" 2>/dev/null
	ipset destroy "${1}_temp" 2>/dev/null
}

create_single_ipset() {
	local section="$1"
	local enabled type auto_gen file_path elems ipset_type extra_opts el

	config_get_bool enabled "$section" enabled 1
	[ "$enabled" = "0" ] && return

	config_get type "$section" type "ipv4_addr"

	case "$type" in
		ether_addr)   ipset_type="hash:mac" ; extra_opts="hashsize 1024 maxelem 65536" ;;
		inet_service) ipset_type="bitmap:port" ; extra_opts="range 0-65535" ;;
		ipv4_addr|*)  ipset_type="hash:net" ; extra_opts="hashsize 1024 maxelem 65536" ;;
	esac

	ipset create "${section}_temp" "$ipset_type" $extra_opts 2>/dev/null
	ipset flush "${section}_temp" 2>/dev/null

	if [ "$section" = "private_dst_ip_v4" ]; then
		config_get_bool auto_gen "$section" auto_generate 1
		if [ "$auto_gen" = "1" ]; then
			for el in 10.0.0.0/8 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.168.0.0/16; do
				ipset add "${section}_temp" "$el" 2>/dev/null
			done
		fi
	fi

	local elements
	config_get elements "$section" elements
	for el in $elements; do
		ipset add "${section}_temp" "$el" 2>/dev/null
	done

	config_get file_path "$section" file_path
	if [ -n "$file_path" ] && [ -f "$file_path" ]; then
		awk -v sec="${section}_temp" '!/^($|#)/ {print "add " sec " " $0}' "$file_path" | ipset restore 2>/dev/null
	fi

	if ipset list "$section" >/dev/null 2>&1; then
		ipset swap "${section}_temp" "$section"
		ipset destroy "${section}_temp" 2>/dev/null
	else
		ipset rename "${section}_temp" "$section"
	fi
}

apply_ipsets() {
	config_load "$UCI_CONFIG"
	config_foreach create_single_ipset "ipset"
}

_load_iptables_rules() {
	# 1. 先清理旧的引流规则和旧 IP 集合
	delete_rules

	# 2. 重新准备并批量导入新的 IP 集合
	apply_ipsets

	# 3. 通过安全管道应用 iptables-restore
	if iptables-restore -n < "$IPTABLES_RULES"; then
		# 4. 挂载自定义链至 PREROUTING (在规则成功加载后)
		local tcp_enabled=$(uci -q get "$UCI_CONFIG.global.tcp_enabled"); tcp_enabled="${tcp_enabled:-1}"
		local udp_enabled=$(uci -q get "$UCI_CONFIG.global.udp_enabled"); udp_enabled="${udp_enabled:-1}"
		[ "$tcp_enabled" = "1" ] && iptables -t mangle -A PREROUTING -p tcp -j FLOWPROXY_TCP 2>/dev/null
		[ "$udp_enabled" = "1" ] && iptables -t mangle -A PREROUTING -p udp -j FLOWPROXY_UDP 2>/dev/null
		return 0
	else
		log_msg error "iptables-restore rules application failed"
		delete_rules
		return 1
	fi
}

generate_iptables_cache() {
	log_msg info "Generating iptables configuration..."
	local conf_level=$(uci -q get "$UCI_CONFIG.global.log_level"); conf_level="${conf_level:-info}"
	local rules_dir="$(dirname "$IPTABLES_RULES")"

	mkdir -p "$rules_dir"
	chmod 700 "$rules_dir"

	if [ -x "$GENERATE_SCRIPT" ]; then
		local err_file="$rules_dir/gen_err.tmp"
		FLOWPROXY_LOG_LEVEL="$conf_level" "$GENERATE_SCRIPT" >/dev/null 2> "$err_file"
		local ret=$?

		if [ -s "$err_file" ]; then
			while read -r line; do
				log_msg debug "Script: $line"
			done < "$err_file"
		fi
		rm -f "$err_file"

		if [ $ret -eq 0 ] && [ -s "$IPTABLES_RULES" ]; then
			return 0
		else
			rm -f "$IPTABLES_RULES"
			log_msg error "Failed to generate iptables config"
			return 1
		fi
	else
		log_msg error "Generator script $GENERATE_SCRIPT not found or not executable"
		return 1
	fi
}

apply_rules() {
	generate_iptables_cache || return 1
	log_msg info "Applying iptables rules from $IPTABLES_RULES"
	_load_iptables_rules
	return $?
}

restore_iptables_rules() {
	if [ -s "$IPTABLES_RULES" ]; then
		log_msg info "Restoring iptables rules from cached $IPTABLES_RULES"
		if _load_iptables_rules; then
			return 0
		fi
		log_msg warn "Cached iptables config failed, regenerating..."
	fi
	apply_rules
}

delete_rules() {
	log_msg info "Removing iptables rules and ipsets..."
	# 1. 拆除挂载点
	iptables -t mangle -D PREROUTING -p tcp -j FLOWPROXY_TCP 2>/dev/null
	iptables -t mangle -D PREROUTING -p udp -j FLOWPROXY_UDP 2>/dev/null

	# 2. 清空并删除自定义链
	iptables -t mangle -F FLOWPROXY_TCP 2>/dev/null
	iptables -t mangle -X FLOWPROXY_TCP 2>/dev/null
	iptables -t mangle -F FLOWPROXY_UDP 2>/dev/null
	iptables -t mangle -X FLOWPROXY_UDP 2>/dev/null

	# 3. 清理自定义 ipset
	config_load "$UCI_CONFIG"
	config_foreach destroy_single_ipset "ipset"
	log_msg info "Removed iptables rules and ipsets"
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

detect_iface_by_ip() {
	local target_ip="$1"
	[ -z "$target_ip" ] && return 1

	# 1. 优先通过本地接口 IPv4 子网掩码最长前缀匹配（不受策略路由 ip rule 干扰）
	local matched_dev
	matched_dev=$(ip -o -4 addr show 2>/dev/null | awk -v tip="$target_ip" '
		function ip2int(ip,   a, n) {
			n = split(ip, a, ".")
			if (n != 4) return -1
			return ((a[1] * 256 + a[2]) * 256 + a[3]) * 256 + a[4]
		}
		BEGIN {
			t = ip2int(tip)
			best_plen = -1
			best_dev = ""
		}
		t >= 0 {
			dev = $2
			sub(/@.*/, "", dev)
			if (dev == "lo") next
			for (i = 3; i <= NF; i++) {
				if ($i == "inet" && (i + 1) <= NF) {
					split($(i + 1), cidr, "/")
					addr = ip2int(cidr[1])
					plen = (cidr[2] != "") ? int(cidr[2]) : 32
					if (addr < 0 || plen < 0 || plen > 32) continue
					if (plen == 0) {
						if (plen > best_plen) {
							best_plen = plen
							best_dev = dev
						}
					} else {
						factor = 2 ^ (32 - plen)
						if (int(t / factor) == int(addr / factor)) {
							if (plen > best_plen) {
								best_plen = plen
								best_dev = dev
							}
						}
					}
				}
			}
		}
		END {
			if (best_dev != "") print best_dev
		}
	')
	if [ -n "$matched_dev" ]; then
		echo "$matched_dev"
		return 0
	fi

	# 2. 兜底：通过内核路由查询直连出接口
	local route_line route_dev
	route_line=$(ip -4 route get "$target_ip" 2>/dev/null | head -n 1)
	case "$route_line" in
		*" via "*) ;;
		*)
			route_dev=$(echo "$route_line" | awk '{for(i=1;i<=NF;i++) if($i=="dev") {print $(i+1); exit}}')
			if [ -n "$route_dev" ] && [ "$route_dev" != "lo" ]; then
				echo "$route_dev"
				return 0
			fi
			;;
	esac
	return 1
}

resolve_proxy_iface() {
	local conf_iface="$1"
	local proxy_ip="$2"
	[ -z "$conf_iface" ] && conf_iface=$(uci -q get "$UCI_CONFIG.global.interface")
	[ -z "$proxy_ip" ] && proxy_ip=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	conf_iface="${conf_iface:-auto}"

	local resolved=""
	if [ "$conf_iface" = "auto" ]; then
		resolved=$(detect_iface_by_ip "$proxy_ip")
		if [ -z "$resolved" ]; then
			log_msg warn "Unable to auto-detect interface for ${proxy_ip:-empty}, falling back to br-lan"
			resolved="br-lan"
		fi
	else
		resolved="$conf_iface"
	fi

	resolve_master_iface "$resolved"
}

_run_probe_cmd() {
	if [ -n "${MY_GEN:-}" ]; then
		[ "${STOP_REQUESTED:-0}" -eq 1 ] && return 1
		"$@" >/dev/null 2>&1 &
		SLEEP_PID=$!
		wait "$SLEEP_PID" 2>/dev/null
		local ret=$?
		SLEEP_PID=""
		[ "${STOP_REQUESTED:-0}" -eq 1 ] && return 1
		return $ret
	else
		"$@" >/dev/null 2>&1
		return $?
	fi
}

iface_supports_arp() {
	local iface="$1"
	[ -d "/sys/class/net/$iface" ] || return 1
	local flags=$(cat "/sys/class/net/$iface/flags" 2>/dev/null)
	[ -z "$flags" ] && return 0
	# IFF_NOARP(0x80) | IFF_POINTOPOINT(0x10) | IFF_LOOPBACK(0x8) = 0x98
	if [ $((flags & 0x98)) -ne 0 ]; then
		return 1
	fi
	return 0
}

check_proxy_alive() {
	local ip="$1"
	local iface="$2"

	# 1. 支持 ARP 的二层接口优先使用 arping：同网段旁路由正常及禁 Ping 场景均在毫秒级返回
	# 若二层 ARP 明确超时无应答，不再执行冗余 ping（避免额外阻塞及污染邻居表）
	if iface_supports_arp "$iface"; then
		if command -v arping >/dev/null 2>&1; then
			if _run_probe_cmd arping -f -q -c 2 -w 2 -I "$iface" "$ip"; then
				return 0
			fi
			return 1
		fi

		# 无 arping 二进制时的内核邻居表探测兜底
		if _run_probe_cmd ping -c 1 -W 1 -I "$iface" "$ip"; then
			return 0
		fi
		ip neigh flush to "$ip" dev "$iface" >/dev/null 2>&1
		_run_probe_cmd ping -c 1 -W 1 -I "$iface" "$ip"
		if ip neigh show to "$ip" dev "$iface" 2>/dev/null | grep -qE "REACHABLE|DELAY|PROBE"; then
			return 0
		fi
		return 1
	fi

	# 2. 非 ARP / 三层点对点虚拟接口使用 ICMP Ping 探测
	if _run_probe_cmd ping -c 1 -W 1 -I "$iface" "$ip"; then
		return 0
	fi
	return 1
}

add_route() {
	local proxy_server_ip_addr=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	local interface=$(resolve_proxy_iface "" "$proxy_server_ip_addr")
	local traffic_mark=$(uci -q get "$UCI_CONFIG.global.traffic_mark"); traffic_mark="${traffic_mark:-0x666}"
	local routing_table=$(uci -q get "$UCI_CONFIG.global.routing_table"); routing_table="${routing_table:-888}"
	local rule_priority=$(uci -q get "$UCI_CONFIG.global.rule_priority"); rule_priority="${rule_priority:-10000}"

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
	local curr_prio=$(uci -q get "$UCI_CONFIG.global.rule_priority"); curr_prio="${curr_prio:-10000}"

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
	[ "$old_mark" != "$curr_mark" ] || [ "$old_table" != "$curr_table" ] || [ "$old_prio" != "$curr_prio" ] && \
		safe_del_rule "$curr_mark" "$curr_table" "$curr_prio"
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
	(
		umask 022
		if [ "${FLOWPROXY_LOCK_METHOD:-}" = "flock" ]; then
			/etc/init.d/dnsmasq restart 9>&-
		else
			/etc/init.d/dnsmasq restart
		fi
	)
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
	delete_rules
	# 热降级：仅从 flowproxy.dns_backup 读取并还原 dnsmasq，保留 UCI 备份不改写 flowproxy
	restore_dnsmasq_from_backup
	log_msg warn "FlowProxy hot-degraded to direct mode (monitoring remains active)"
}

do_recover() {
	local proxy_ip=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
	log_msg info "Proxy server ${proxy_ip:-unknown} is online, hot-recovering FlowProxy..."
	restore_iptables_rules || return 1
	add_route || { delete_rules; return 1; }
	setup_dns || { restore_dnsmasq_from_backup; delete_route; delete_rules; return 1; }
	rm -f "$DEGRADED_FILE"
	log_msg info "FlowProxy hot-recovered to active proxy mode"
	return 0
}
