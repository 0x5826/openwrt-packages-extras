#!/bin/sh
# Generate iptables configuration for flowproxy

. /lib/functions.sh

[ -n "$UCI_CONFIG_DIR" ] && export UCI_CONFIG_DIR

umask 077
CONFIG="flowproxy"
OUTPUT_FILE="/tmp/flowproxy/iptables.rules"

# 安全防范：若目标规则文件为恶意软链，直接删除它，避免删掉被父进程以 700 锁定的父目录
rm -rf "$OUTPUT_FILE"
touch "$OUTPUT_FILE"
chmod 600 "$OUTPUT_FILE"

ENABLED_SETS=" "

log_debug() {
	[ "$FLOWPROXY_LOG_LEVEL" = "debug" ] && echo "DEBUG: $*" >&2
}

process_rule() {
	local section="$1"; local proto="$2"
	local enabled match_type match_value action counter
	
	enabled=$(uci -q get "$CONFIG.$section.enabled"); [ "$enabled" = "0" ] && { log_debug "Rule $section is disabled, skipping"; return; }
	match_type=$(uci -q get "$CONFIG.$section.match_type")
	match_value=$(uci -q get "$CONFIG.$section.match_value")
	
	log_debug "Processing $proto rule: $section ($match_type=$match_value)"
	action=$(uci -q get "$CONFIG.$section.action"); [ -z "$action" ] && action="return"
	counter=$(uci -q get "$CONFIG.$section.counter")
	[ -z "$match_value" ] && return

	local j_action="RETURN"
	case "$action" in
		accept) j_action="ACCEPT" ;;
		drop)   j_action="DROP" ;;
		return|*) j_action="RETURN" ;;
	esac

	match_value=$(echo "$match_value" | sed -E 's/ (return|accept|drop)$//g')
	
	local is_set=0
	case "$match_value" in
		@*)
			is_set=1
			local set_ref=$(echo "$match_value" | cut -c 2-)
			if ! echo "$ENABLED_SETS" | grep -q " @${set_ref} "; then
				log_debug "Skipping rule $section: set ${set_ref} is not defined or disabled"
				return
			fi
			match_value="$set_ref"
			;;
	esac

	local segment=""
	if [ "$is_set" = "1" ]; then
		case "$match_type" in
			src_mac)  segment="-m set --match-set $match_value src" ;;
			src_ip)   segment="-m set --match-set $match_value src" ;;
			dst_ip)   segment="-m set --match-set $match_value dst" ;;
			src_port) segment="-m set --match-set $match_value src" ;;
			dst_port) segment="-m set --match-set $match_value dst" ;;
			*)        segment="-m set --match-set $match_value dst" ;;
		esac
	else
		case "$match_type" in
			src_mac)  segment="-m mac --mac-source $match_value" ;;
			src_ip)   segment="-s $match_value" ;;
			dst_ip)   segment="-d $match_value" ;;
			src_port) segment="--sport $match_value" ;;
			dst_port) segment="--dport $match_value" ;;
			*)        segment="$match_value" ;;
		esac
	fi

	local chain_name="FLOWPROXY_TCP"
	[ "$proto" = "udp" ] && chain_name="FLOWPROXY_UDP"
	
	local proto_arg="-p $proto "
	
	echo "    -A $chain_name $proto_arg$segment -j $j_action"
}

SECTIONS_SET=$(uci -q show "$CONFIG" | grep "=nftset" | cut -d'.' -f2 | cut -d'=' -f1)
SECTIONS_TCP=$(uci -q show "$CONFIG" | grep "=tcp_rule" | cut -d'.' -f2 | cut -d'=' -f1)
SECTIONS_UDP=$(uci -q show "$CONFIG" | grep "=udp_rule" | cut -d'.' -f2 | cut -d'=' -f1)

# 获取被启用的 IP 集合列表进行匹配校准
for s in $SECTIONS_SET; do
	enabled=$(uci -q get "$CONFIG.$s.enabled")
	[ "$enabled" != "0" ] && ENABLED_SETS="${ENABLED_SETS}@${s} "
done

if [ "$1" = "runtime" ]; then
	TRAFFIC_MARK=$(uci -q get "$CONFIG.global.traffic_mark" || echo "0x666")
	ROUTING_TABLE=$(uci -q get "$CONFIG.global.routing_table" || echo "888")
	echo "--- [ iptables live rules ] ---"
	iptables -t mangle -S FLOWPROXY_TCP 2>/dev/null || echo "(chain FLOWPROXY_TCP not found)"
	iptables -t mangle -S FLOWPROXY_UDP 2>/dev/null || echo "(chain FLOWPROXY_UDP not found)"
	echo ""
	echo "--- [ ipsets list ] ---"
	for s in $SECTIONS_SET; do
		if ipset list "$s" >/dev/null 2>&1; then
			echo "Set: $s"
			ipset list "$s" 2>/dev/null | head -n 15
			echo "..."
		fi
	done
	echo ""
	echo "--- [ ip rule list ] ---"
	ip rule show 2>/dev/null
	echo ""
	echo "--- [ ip route table $ROUTING_TABLE ] ---"
	ip route show table "$ROUTING_TABLE" 2>/dev/null || echo "(table empty)"
	exit 0
fi

cat > "$OUTPUT_FILE" << EOF
*mangle
:FLOWPROXY_TCP - [0:0]
:FLOWPROXY_UDP - [0:0]
EOF

TCP_ENABLED=$(uci -q get "$CONFIG.global.tcp_enabled" || echo "1")
UDP_ENABLED=$(uci -q get "$CONFIG.global.udp_enabled" || echo "1")
TRAFFIC_MARK=$(uci -q get "$CONFIG.global.traffic_mark" || echo "0x666")
PROXY_SERVER_IP_ADDR=$(uci -q get "$CONFIG.global.proxy_server_ip_addr")

if [ "$TCP_ENABLED" = "1" ]; then
	cat >> "$OUTPUT_FILE" << EOF
-A FLOWPROXY_TCP -m addrtype --dst-type LOCAL,MULTICAST,BROADCAST -j RETURN
EOF
	if [ -n "$PROXY_SERVER_IP_ADDR" ]; then
		echo "-A FLOWPROXY_TCP -s $PROXY_SERVER_IP_ADDR -p tcp -j RETURN" >> "$OUTPUT_FILE"
	fi
	for s in $SECTIONS_TCP; do process_rule "$s" "tcp" >> "$OUTPUT_FILE"; done
	echo "-A FLOWPROXY_TCP -p tcp -j MARK --set-xmark $TRAFFIC_MARK/0xffffffff" >> "$OUTPUT_FILE"
fi

if [ "$UDP_ENABLED" = "1" ]; then
	cat >> "$OUTPUT_FILE" << EOF
-A FLOWPROXY_UDP -m addrtype --dst-type LOCAL,MULTICAST,BROADCAST -j RETURN
EOF
	if [ -n "$PROXY_SERVER_IP_ADDR" ]; then
		echo "-A FLOWPROXY_UDP -s $PROXY_SERVER_IP_ADDR -p udp -j RETURN" >> "$OUTPUT_FILE"
	fi
	for s in $SECTIONS_UDP; do process_rule "$s" "udp" >> "$OUTPUT_FILE"; done
	echo "-A FLOWPROXY_UDP -p udp -j MARK --set-xmark $TRAFFIC_MARK/0xffffffff" >> "$OUTPUT_FILE"
fi

echo "COMMIT" >> "$OUTPUT_FILE"
cat "$OUTPUT_FILE"
