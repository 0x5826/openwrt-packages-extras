#!/bin/sh
# FlowProxy sidecar watchdog daemon (ARP + Ping health probe)

. /usr/share/flowproxy/common.sh

MY_GEN="$1"
[ -z "$MY_GEN" ] && exit 0

STOP_REQUESTED=0
SLEEP_PID=""

handle_signal() {
	STOP_REQUESTED=1
	[ -n "$SLEEP_PID" ] && kill "$SLEEP_PID" 2>/dev/null
}

trap 'handle_signal' TERM INT

interruptible_sleep() {
	local secs="$1"
	[ "$STOP_REQUESTED" -eq 1 ] && return 1
	sleep "$secs" &
	SLEEP_PID=$!
	wait "$SLEEP_PID" 2>/dev/null
	SLEEP_PID=""
	[ "$STOP_REQUESTED" -eq 1 ] && return 1
	return 0
}

get_uint_or_default() {
	local val="$1"
	local def="$2"
	local min="$3"
	case "$val" in
		''|*[!0-9]*) echo "$def"; return ;;
	esac
	[ "$val" -lt "$min" ] && echo "$min" || echo "$val"
}

is_context_valid() {
	[ "$STOP_REQUESTED" -eq 0 ] || return 1
	[ -f "$STATE_FILE" ] || return 1
	[ "$(cat "$GEN_FILE" 2>/dev/null)" = "$MY_GEN" ] || return 1
	[ "$(uci -q get "$UCI_CONFIG.global.enabled" || echo 0)" = "1" ] || return 1
	[ "$(uci -q get "$UCI_CONFIG.global.monitor_enabled" || echo 0)" = "1" ] || return 1
	return 0
}

check_proxy_alive() {
	local ip="$1"
	local iface="$2"

	# 1. ARP 优先探测：同网段旁路由正常及禁 Ping 场景均在毫秒级返回，-c 2 -w 2 保证第 2 帧回包窗口完整
	if command -v arping >/dev/null 2>&1; then
		if arping -f -q -c 2 -w 2 -I "$iface" "$ip" >/dev/null 2>&1; then
			return 0
		fi
		[ "$STOP_REQUESTED" -eq 1 ] && return 1
	fi

	# 2. ICMP Ping 回退探测（兼容非 ARP / 虚拟接口）
	if ping -c 1 -W 1 -I "$iface" "$ip" >/dev/null 2>&1; then
		return 0
	fi
	[ "$STOP_REQUESTED" -eq 1 ] && return 1

	# 3. 无 arping 时的内核邻居表兜底
	if ! command -v arping >/dev/null 2>&1; then
		ip neigh flush to "$ip" dev "$iface" >/dev/null 2>&1
		ping -c 1 -W 1 -I "$iface" "$ip" >/dev/null 2>&1
		[ "$STOP_REQUESTED" -eq 1 ] && return 1
		if ip neigh show to "$ip" dev "$iface" 2>/dev/null | grep -qE "REACHABLE|DELAY|PROBE"; then
			return 0
		fi
	fi

	return 1
}

proxy_ip=$(uci -q get "$UCI_CONFIG.global.proxy_server_ip_addr")
conf_iface=$(uci -q get "$UCI_CONFIG.global.interface")
conf_iface="${conf_iface:-br-lan}"
probe_iface=$(resolve_master_iface "$conf_iface")

interval=$(get_uint_or_default "$(uci -q get "$UCI_CONFIG.global.monitor_interval")" 5 2)
fail_threshold=$(get_uint_or_default "$(uci -q get "$UCI_CONFIG.global.monitor_fail_threshold")" 3 1)
recover_threshold=$(get_uint_or_default "$(uci -q get "$UCI_CONFIG.global.monitor_recover_threshold")" 2 1)

[ -z "$proxy_ip" ] && exit 0

log_msg info "Watchdog started (target=$proxy_ip, iface=$probe_iface, interval=${interval}s, fail=$fail_threshold, recover=$recover_threshold)"

# 启动后先等待一个探测周期，确保主服务完全进入稳定运行态
interruptible_sleep "$interval" || exit 0

[ -f "$DEGRADED_FILE" ] && state="degraded" || state="online"
fail_count=0
ok_count=0

while is_context_valid; do
	probe_start=$(date +%s)
	if check_proxy_alive "$proxy_ip" "$probe_iface"; then
		fail_count=0
		if [ "$state" = "degraded" ]; then
			ok_count=$((ok_count + 1))
			log_msg debug "Watchdog: probe succeeded ($ok_count/$recover_threshold)"
			if [ "$ok_count" -ge "$recover_threshold" ]; then
				if acquire_lock; then
					if ! is_context_valid; then
						release_lock
						break
					fi
					if [ -f "$DEGRADED_FILE" ]; then
						if do_recover; then
							state="online"
							ok_count=0
							fail_count=0
						else
							log_msg error "Watchdog: recovery failed, staying in degraded mode"
						fi
					else
						state="online"
						ok_count=0
					fi
					release_lock
				else
					log_msg warn "Watchdog: failed to acquire lock for recovery, retrying next cycle"
				fi
			fi
		else
			ok_count=0
		fi
	else
		[ "$STOP_REQUESTED" -eq 1 ] && break
		ok_count=0
		if [ "$state" = "online" ]; then
			fail_count=$((fail_count + 1))
			log_msg warn "Watchdog: probe failed ($fail_count/$fail_threshold) for $proxy_ip via $probe_iface"
			if [ "$fail_count" -ge "$fail_threshold" ]; then
				if acquire_lock; then
					if ! is_context_valid; then
						release_lock
						break
					fi
					if [ ! -f "$DEGRADED_FILE" ]; then
						do_degrade
						state="degraded"
						fail_count=0
						ok_count=0
					else
						state="degraded"
						fail_count=0
					fi
					release_lock
				else
					log_msg warn "Watchdog: failed to acquire lock for degrade, retrying next cycle"
				fi
			fi
		else
			fail_count=0
		fi
	fi

	probe_end=$(date +%s)
	elapsed=$((probe_end - probe_start))
	[ "$elapsed" -lt 0 ] && elapsed=0
	sleep_secs=$((interval - elapsed))
	[ "$sleep_secs" -lt 1 ] && sleep_secs=1
	interruptible_sleep "$sleep_secs" || break
done

log_msg info "Watchdog stopped"
exit 0
