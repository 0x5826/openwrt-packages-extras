'use strict';
'require view';
'require form';
'require uci';
'require rpc';
'require ui';
'require poll';
'require dom';

const callGetStatus = rpc.declare({
	object: 'easytier',
	method: 'get_status',
	expect: { }
});

const callGetPeers = rpc.declare({
	object: 'easytier',
	method: 'get_peers',
	expect: { }
});

const callGetTopology = rpc.declare({
	object: 'easytier',
	method: 'get_topology',
	expect: { }
});

const callGetLogs = rpc.declare({
	object: 'easytier',
	method: 'get_logs',
	expect: { }
});

const callClearLogs = rpc.declare({
	object: 'easytier',
	method: 'clear_logs'
});

const callGetSubroutes = rpc.declare({
	object: 'easytier',
	method: 'get_subroutes',
	expect: { routes: [] }
});

const callServiceAction = rpc.declare({
	object: 'easytier',
	method: 'service_action',
	params: ['action']
});

function createActionBtn(label, btnClass, onClick) {
	return E('button', {
		'class': 'btn cbi-button ' + btnClass,
		'style': 'margin-left: 10px; padding: 2px 10px; font-size: 12px; vertical-align: middle;',
		'click': onClick
	}, label);
}

function renderCoreStatus(stateObj) {
	const state = stateObj ? stateObj.state : 'stopped';
	const pid = stateObj ? stateObj.pid : null;
	const isRunning = (state === 'managed' || state === 'unmanaged');

	let text = _('Stopped');
	let color = 'red';
	if (state === 'managed') {
		text = _('Running (Managed)');
		color = 'green';
	} else if (state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	}
	if (pid) text += ' [PID: ' + pid + ']';

	const fields = [
		E('span', { 'style': 'font-weight: bold; color: ' + color + ';' }, text)
	];

	if (isRunning) {
		fields.push(
			createActionBtn(_('Restart'), 'cbi-button-action', function(ev) {
				ui.showModal(_('Action'), [ E('p', {}, _('Restarting service...')) ]);
				return callServiceAction('restart').then(function() {
					window.location.reload();
				});
			})
		);
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Core Service Status')),
		E('div', { 'class': 'cbi-value-field' }, fields)
	]);
}

function renderWebStatus(stateObj) {
	const state = stateObj ? stateObj.state : 'stopped';
	const pid = stateObj ? stateObj.pid : null;
	const isRunning = (state === 'managed' || state === 'unmanaged');

	let text = _('Stopped');
	let color = 'red';
	if (state === 'managed') {
		text = _('Running (Managed)');
		color = 'green';
	} else if (state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	}
	if (pid) text += ' [PID: ' + pid + ']';

	const fields = [
		E('span', { 'style': 'font-weight: bold; color: ' + color + ';' }, text)
	];

	if (isRunning) {
		const port = uci.get('easytier', 'settings', 'web_html_port') || '22020';
		const url = 'http://' + window.location.hostname + ':' + port;
		fields.push(
			createActionBtn(_('Restart'), 'cbi-button-action', function(ev) {
				ui.showModal(_('Action'), [ E('p', {}, _('Restarting service...')) ]);
				return callServiceAction('restart').then(function() {
					window.location.reload();
				});
			}),
			E('a', {
				'class': 'btn cbi-button cbi-button-action',
				'style': 'margin-left: 10px; padding: 2px 10px; font-size: 12px; vertical-align: middle;',
				'href': url,
				'target': '_blank'
			}, _('Open Console'))
		);
	}

	return E('div', { 'class': 'cbi-value' }, [
		E('label', { 'class': 'cbi-value-title' }, _('Web Console Status')),
		E('div', { 'class': 'cbi-value-field' }, fields)
	]);
}

function renderProxyCidrBadges(proxyStr) {
	if (!proxyStr || typeof proxyStr !== 'string' || proxyStr.trim() === '' || proxyStr === '-') {
		return '-';
	}
	const list = proxyStr.split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; });
	if (list.length === 0) return '-';

	return E('div', { 'style': 'display: flex; flex-direction: column; gap: 4px;' }, list.map(function(cidr) {
		return E('span', {
			'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-family: monospace; font-weight: 600; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px; white-space: nowrap; width: fit-content;'
		}, cidr);
	}));
}

function renderLocalNodeInfo(peerData) {
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	let local = null;
	for (let i = 0; i < peers.length; i++) {
		if (peers[i].cost && String(peers[i].cost).trim().toLowerCase() === 'local') {
			local = peers[i];
			break;
		}
	}

	if (!local) {
		return E('em', {}, _('Local service is not running.'));
	}

	const ipv4Val = local.ipv4 ? String(local.ipv4).trim() : '-';
	const hostnameVal = local.hostname ? String(local.hostname).trim() : '-';
	const natVal = local.nat ? String(local.nat).trim() : '-';
	const versionVal = local.version ? String(local.version).trim() : '-';
	const netNameVal = uci.get('easytier', 'settings', 'network_name') || 'easytier';
	const devNameVal = uci.get('easytier', 'settings', 'dev_name') || 'easytier0';

	let localProxy = local.proxy_cidrs ? String(local.proxy_cidrs).trim() : '';
	if (!localProxy) {
		let cfgProxy = uci.get('easytier', 'settings', 'proxy_networks');
		if (Array.isArray(cfgProxy) && cfgProxy.length > 0) localProxy = cfgProxy.join(', ');
		else if (typeof cfgProxy === 'string' && cfgProxy.trim() !== '') localProxy = cfgProxy.trim();
	}

	const proxyDisp = renderProxyCidrBadges(localProxy);

	const infoItems = [
		{ label: _('Virtual IP'), value: E('strong', { 'style': 'color: #007bff;' }, ipv4Val) },
		{ label: _('Hostname'), value: E('strong', {}, hostnameVal) },
		{ label: _('Network Name'), value: netNameVal },
		{ label: _('Proxy Networks'), value: proxyDisp },
		{ label: _('Virtual Interface'), value: devNameVal },
		{ label: _('NAT Type'), value: natVal },
		{ label: _('Client Version'), value: versionVal }
	];

	return E('div', { 'class': 'cbi-section-node' }, [
		E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, [
			E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, [
				E('tr', { 'class': 'cbi-table-header' }, infoItems.map(item => E('th', { 'class': 'cbi-table-cell', 'style': 'padding: 10px 14px; text-align: left; white-space: nowrap; font-weight: bold; min-width: 120px;' }, item.label))),
				E('tr', { 'class': 'cbi-row' }, infoItems.map(item => E('td', { 'class': 'cbi-value-field', 'style': 'padding: 8px 14px; text-align: left; white-space: nowrap;' }, item.value)))
			])
		])
	]);
}

function renderPeersTable(peerData) {
	let peers = [];
	if (Array.isArray(peerData)) {
		peers = peerData;
	} else if (peerData && Array.isArray(peerData.peers)) {
		peers = peerData.peers;
	}

	const remotePeers = peers.filter(p => !p.cost || String(p.cost).trim().toLowerCase() !== 'local');

	if (!remotePeers || remotePeers.length === 0) {
		if (peerData && peerData.raw && peerData.raw.length > 0 && peers.length === 0) {
			return E('pre', { 'style': 'padding: 10px; border-radius: 4px; overflow-x: auto; max-height: 350px; font-family: monospace;' }, peerData.raw);
		}
		return E('em', {}, _('No connected remote peers found.'));
	}

	const headers = [
		{ title: _('Virtual IP'), minWidth: '140px' },
		{ title: _('Hostname'), minWidth: '150px' },
		{ title: _('Proxy Networks'), minWidth: '130px' },
		{ title: _('Cost'), minWidth: '70px' },
		{ title: _('Latency'), minWidth: '85px' },
		{ title: _('Loss Rate'), minWidth: '80px' },
		{ title: _('RX'), minWidth: '85px' },
		{ title: _('TX'), minWidth: '85px' },
		{ title: _('Tunnel'), minWidth: '75px' },
		{ title: _('NAT Type'), minWidth: '120px' },
		{ title: _('Version'), minWidth: '120px' }
	];

	const thStyle = 'padding: 10px 14px; text-align: left; white-space: nowrap; font-weight: bold; vertical-align: middle;';
	const tdStyle = 'padding: 8px 14px; text-align: left; white-space: nowrap; vertical-align: middle;';

	const rows = [
		E('tr', { 'class': 'cbi-table-header' }, headers.map(function(h) {
			return E('th', { 'class': 'cbi-table-cell', 'style': thStyle + (h.minWidth ? (' min-width: ' + h.minWidth + ';') : '') }, h.title);
		}))
	];

	for (let i = 0; i < remotePeers.length; i++) {
		const p = remotePeers[i];
		const costStr = p.cost ? String(p.cost).trim() : '-';
		const latencyVal = p.latency ? String(p.latency).trim() : '-';
		const latencyColor = (latencyVal !== '-' && !isNaN(parseFloat(latencyVal))) ? '#28a745' : '#6c757d';
		const proxyNode = renderProxyCidrBadges(p.proxy_cidrs);

		rows.push(E('tr', { 'class': 'cbi-row' }, [
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, E('strong', {}, p.ipv4 ? String(p.ipv4).trim() : '-')),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.hostname ? String(p.hostname).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, proxyNode),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, costStr),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, (latencyVal !== '-') ? E('span', { 'style': 'color: ' + latencyColor + '; font-weight: bold;' }, latencyVal + ' ms') : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.loss_rate ? String(p.loss_rate).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.rx ? String(p.rx).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.tx ? String(p.tx).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.tunnel ? String(p.tunnel).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.nat ? String(p.nat).trim() : '-'),
			E('td', { 'class': 'cbi-value-field', 'style': tdStyle }, p.version ? String(p.version).trim() : '-')
		]));
	}

	const tableNode = E('table', { 'class': 'cbi-table', 'style': 'width: 100%; border-collapse: separate; border-spacing: 0;' }, rows);
	return E('div', { 'style': 'overflow-x: auto; -webkit-overflow-scrolling: touch; margin-bottom: 10px; border: 1px solid #e5e5e5; border-radius: 4px;' }, tableNode);
}

function renderLogsView(logData) {
	let lines = [];
	if (Array.isArray(logData)) {
		lines = logData;
	} else if (logData && Array.isArray(logData.logs)) {
		lines = logData.logs;
	} else if (typeof logData === 'string') {
		lines = logData.split('\n');
	} else if (logData && typeof logData.logs === 'string') {
		lines = logData.logs.split('\n');
	}

	lines = lines.filter(function(l) {
		return l && String(l).trim().length > 0;
	});

	const logText = (lines.length > 0) ? lines.join('\n') : _('No logs available.');

	const textarea = E('textarea', {
		'class': 'cbi-input-textarea',
		'style': 'width: 100%; height: 450px; font-family: monospace; font-size: 12px; line-height: 1.5; resize: vertical; box-sizing: border-box; padding: 10px; border-radius: 4px;',
		'readonly': 'readonly',
		'wrap': 'off'
	}, logText);

	return E('div', { 'style': 'width: 100%; margin-top: 5px;' }, textarea);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function createSvg(tag, attrs, children) {
	const el = document.createElementNS(SVG_NS, tag);
	if (attrs) {
		const keys = Object.keys(attrs);
		for (let i = 0; i < keys.length; i++) {
			const k = keys[i];
			el.setAttribute(k, attrs[k]);
		}
	}
	if (children) {
		if (Array.isArray(children)) {
			for (let i = 0; i < children.length; i++) {
				if (typeof children[i] === 'string') {
					el.appendChild(document.createTextNode(children[i]));
				} else if (children[i] instanceof Node) {
					el.appendChild(children[i]);
				}
			}
		} else if (typeof children === 'string') {
			el.appendChild(document.createTextNode(children));
		} else if (children instanceof Node) {
			el.appendChild(children);
		}
	}
	return el;
}

// 持久化拓扑图视口平移与缩放状态（即使数据定时刷新也能完全保持当前缩放与视野位置）
const topologyViewState = {
	scale: 1.0,
	panX: 0,
	panY: 0
};

function renderTopologySvg(topoData, peerData) {
	let rawNodes = [];
	if (Array.isArray(topoData)) {
		rawNodes = topoData;
	} else if (topoData && Array.isArray(topoData.nodes)) {
		rawNodes = topoData.nodes;
	}

	// 过滤重启产生的残留/未刷新的 Unknown 幽灵节点及无效 IP 节点
	rawNodes = (rawNodes || []).filter(function(n) {
		if (!n) return false;
		const host = n.hostname ? String(n.hostname).trim().toLowerCase() : '';
		const ip = n.ipv4 ? String(n.ipv4).trim() : '';
		if (!host || host === 'unknown') return false;
		if (!ip || ip === '-' || ip === 'null') return false;
		return true;
	});

	if (!rawNodes || rawNodes.length === 0) {
		return E('em', {}, _('No topology data available.'));
	}

	const validNodeIdMap = {};
	for (let i = 0; i < rawNodes.length; i++) {
		if (rawNodes[i].node_id) {
			validNodeIdMap[String(rawNodes[i].node_id)] = true;
		}
	}

	let localIpv4 = '';
	let peers = [];
	if (Array.isArray(peerData)) peers = peerData;
	else if (peerData && Array.isArray(peerData.peers)) peers = peerData.peers;
	for (let i = 0; i < peers.length; i++) {
		if (peers[i].cost && String(peers[i].cost).trim().toLowerCase() === 'local') {
			if (peers[i].ipv4) localIpv4 = String(peers[i].ipv4).trim().split('/')[0];
			break;
		}
	}

	let nodes = [];
	let localNode = null;
	for (let i = 0; i < rawNodes.length; i++) {
		const n = rawNodes[i];
		const nIp = n.ipv4 ? String(n.ipv4).trim().split('/')[0] : '';
		if (localIpv4 && nIp === localIpv4) {
			localNode = n;
		} else {
			nodes.push(n);
		}
	}
	if (localNode) {
		nodes.unshift(localNode);
	}

	const localPeerLatencyMap = {};
	for (let i = 0; i < peers.length; i++) {
		const p = peers[i];
		if (!p.cost || String(p.cost).trim().toLowerCase() === 'local') continue;
		const latVal = parseFloat(p.latency);
		if (!isNaN(latVal) && latVal > 0) {
			const pIp = p.ipv4 ? String(p.ipv4).trim().split('/')[0] : '';
			const pHost = p.hostname ? String(p.hostname).trim() : '';
			if (pIp) localPeerLatencyMap[pIp] = Math.round(latVal);
			if (pHost) localPeerLatencyMap[pHost] = Math.round(latVal);
		}
	}

	const nodeCount = nodes.length;
	const linkMap = {};
	for (let i = 0; i < nodeCount; i++) {
		const src = nodes[i];
		const dPeers = src.direct_peers || [];
		for (let j = 0; j < dPeers.length; j++) {
			const dst = dPeers[j];
			if (!dst.node_id) continue;
			if (!validNodeIdMap[String(dst.node_id)]) continue;
			const dstHost = dst.hostname ? String(dst.hostname).trim().toLowerCase() : '';
			if (dstHost === 'unknown') continue;

			const pairKey = [src.node_id, dst.node_id].sort().join('---');
			if (!linkMap[pairKey]) {
				linkMap[pairKey] = {
					srcId: src.node_id,
					dstId: dst.node_id,
					latencies: []
				};
			}
			if (dst.latency_ms !== undefined && dst.latency_ms !== null && !isNaN(dst.latency_ms)) {
				linkMap[pairKey].latencies.push(Number(dst.latency_ms));
			}
		}
	}

	// 智能仲裁链路真实延迟：优先本地实测 RTT，剔除 peer-center 初始 1ms 占位脏数据
	const linkKeys = Object.keys(linkMap);
	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const isLocalLink = (localNode && (link.srcId === localNode.node_id || link.dstId === localNode.node_id));
		const otherNodeId = (localNode && link.srcId === localNode.node_id) ? link.dstId : link.srcId;
		const otherNode = nodes.find(function(n) { return n.node_id === otherNodeId; });

		let resolvedLat = null;

		// 1. 若包含本端节点，优先采用本地实测 RTT (peerData)
		if (isLocalLink && otherNode) {
			const otherIp = otherNode.ipv4 ? String(otherNode.ipv4).trim().split('/')[0] : '';
			const otherHost = otherNode.hostname ? String(otherNode.hostname).trim() : '';
			if (otherIp && localPeerLatencyMap[otherIp] !== undefined) {
				resolvedLat = localPeerLatencyMap[otherIp];
			} else if (otherHost && localPeerLatencyMap[otherHost] !== undefined) {
				resolvedLat = localPeerLatencyMap[otherHost];
			}
		}

		if (resolvedLat === null && link.latencies && link.latencies.length > 0) {
			const validLats = link.latencies.filter(function(v) { return v > 0; });
			if (validLats.length === 1) {
				resolvedLat = validLats[0];
			} else if (validLats.length > 1) {
				const realLats = validLats.filter(function(v) { return v > 2; });
				if (realLats.length > 0) {
					resolvedLat = Math.round(realLats.reduce(function(a, b) { return a + b; }, 0) / realLats.length);
				} else {
					resolvedLat = Math.round(validLats.reduce(function(a, b) { return a + b; }, 0) / validLats.length);
				}
			}
		}

		link.latency = resolvedLat;
	}

	// 优雅星型/环形舒展排版算法：本端节点居中，对等节点宽阔环绕
	const otherNodes = nodes.filter(function(n) {
		return String(n.node_id) !== String(localNode.node_id);
	});
	const otherCount = otherNodes.length;

	// 宽阔舒适的安全间距（确保任何规模下节点之间与连线徽标均有充足舒展空间）
	let R = 260;
	if (otherCount <= 2) {
		R = 260;
	} else if (otherCount <= 4) {
		R = 280;
	} else {
		R = Math.max(280, Math.round((otherCount * 260) / (2 * Math.PI)));
	}

	const padding = 150;
	const size = Math.max(900, Math.round(2 * R + 2 * padding));
	const width = size;
	const height = size;
	const cx = Math.round(size / 2);
	const cy = Math.round(size / 2);

	const posMap = {};
	posMap[localNode.node_id] = { x: cx, y: cy };

	if (otherCount === 1) {
		posMap[otherNodes[0].node_id] = { x: cx + R, y: cy };
	} else if (otherCount === 2) {
		posMap[otherNodes[0].node_id] = { x: cx - R, y: cy };
		posMap[otherNodes[1].node_id] = { x: cx + R, y: cy };
	} else if (otherCount > 2) {
		for (let i = 0; i < otherCount; i++) {
			const angle = -Math.PI / 2 + (2 * Math.PI * i) / otherCount;
			posMap[otherNodes[i].node_id] = {
				x: Math.round(cx + R * Math.cos(angle)),
				y: Math.round(cy + R * Math.sin(angle))
			};
		}
	}

	function getLatencyColor(lat) {
		if (lat === undefined || lat === null || isNaN(Number(lat))) {
			return {
				line: '#94a3b8',
				text: '#64748b',
				dash: '5,5',
				width: '2',
				opacity: '0.6'
			};
		}
		const val = Number(lat);
		if (val > 150) {
			return {
				line: '#f59e0b',
				text: '#d97706',
				dash: '6,4',
				width: '2.5',
				opacity: '0.85'
			};
		} else if (val >= 50) {
			return {
				line: '#3b82f6',
				text: '#2563eb',
				dash: '6,4',
				width: '2.5',
				opacity: '0.85'
			};
		} else {
			return {
				line: '#22c55e',
				text: '#16a34a',
				dash: '6,4',
				width: '2.5',
				opacity: '0.9'
			};
		}
	}

	const linesLayer = [];
	const nodesLayer = [];
	const badgesLayer = [];

	// 1. 底层：绘制链路连线（色彩与延迟区间语义完全联动）
	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const p1 = posMap[link.srcId];
		const p2 = posMap[link.dstId];
		if (!p1 || !p2) continue;

		const colorCfg = getLatencyColor(link.latency);

		linesLayer.push(createSvg('line', {
			'x1': p1.x, 'y1': p1.y,
			'x2': p2.x, 'y2': p2.y,
			'stroke': colorCfg.line,
			'stroke-width': colorCfg.width,
			'stroke-dasharray': colorCfg.dash,
			'opacity': colorCfg.opacity
		}));
	}

	// 2. 中层：绘制节点卡片（紧凑尺寸，支持多子网逐行排版）
	for (let i = 0; i < nodeCount; i++) {
		const n = nodes[i];
		const pos = posMap[n.node_id];
		if (!pos) continue;

		const proxyList = (n.proxy_cidrs && String(n.proxy_cidrs).trim() !== '') ?
			String(n.proxy_cidrs).split(',').map(function(s) { return s.trim(); }).filter(function(s) { return s !== ''; }) : [];
		const proxyCount = proxyList.length;

		const cardW = 146;
		const baseHeaderH = 46;
		const itemH = 18;
		const cardH = (proxyCount > 0) ? (baseHeaderH + proxyCount * itemH + 2) : baseHeaderH;
		const isSelf = (i === 0 && localNode);
		const hostname = n.hostname ? String(n.hostname).trim() : 'Unknown';
		const ipv4 = n.ipv4 ? String(n.ipv4).trim() : '-';
		const titleStr = isSelf ? (hostname + ' (Local)') : hostname;

		const cardBg = isSelf ? '#eff6ff' : '#f8fafc';
		const cardBorder = isSelf ? '#2563eb' : '#cbd5e1';
		const borderWidth = isSelf ? '2' : '1';
		const titleColor = isSelf ? '#1e3a8a' : '#334155';
		const ipColor = isSelf ? '#2563eb' : '#64748b';

		const topY = pos.y - cardH / 2;

		const gChildren = [
			createSvg('rect', {
				'x': pos.x - cardW / 2,
				'y': topY,
				'width': cardW,
				'height': cardH,
				'rx': '6',
				'fill': cardBg,
				'stroke': cardBorder,
				'stroke-width': borderWidth
			}),
			createSvg('text', {
				'x': pos.x,
				'y': topY + 18,
				'text-anchor': 'middle',
				'font-family': 'sans-serif',
				'font-size': '12',
				'font-weight': isSelf ? 'bold' : '600',
				'fill': titleColor
			}, titleStr),
			createSvg('text', {
				'x': pos.x,
				'y': topY + 34,
				'text-anchor': 'middle',
				'font-family': 'monospace, sans-serif',
				'font-size': '10.5',
				'font-weight': isSelf ? 'bold' : 'normal',
				'fill': ipColor
			}, ipv4)
		];

		if (proxyCount > 0) {
			const badgeW = 132;
			const badgeH = 15;
			for (let pIdx = 0; pIdx < proxyCount; pIdx++) {
				const badgeY = topY + baseHeaderH + pIdx * itemH;
				const labelText = proxyList[pIdx];
				gChildren.push(
					createSvg('rect', {
						'x': pos.x - badgeW / 2,
						'y': badgeY,
						'width': badgeW,
						'height': badgeH,
						'rx': '3',
						'fill': '#ecfdf5',
						'stroke': '#a7f3d0',
						'stroke-width': '1'
					}),
					createSvg('text', {
						'x': pos.x,
						'y': badgeY + 11,
						'text-anchor': 'middle',
						'font-family': 'monospace, sans-serif',
						'font-size': '9.5',
						'font-weight': '600',
						'fill': '#047857'
					}, labelText)
				);
			}
		}

		nodesLayer.push(createSvg('g', {}, gChildren));
	}

	// 3. 顶层：绘制延迟数据（与连线色彩同频）
	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const p1 = posMap[link.srcId];
		const p2 = posMap[link.dstId];
		if (!p1 || !p2) continue;

		const lat = link.latency;
		if (lat !== undefined && lat !== null) {
			const isSrcLocal = (String(link.srcId) === String(localNode.node_id));
			const isDstLocal = (String(link.dstId) === String(localNode.node_id));

			let mx, my;

			if (isSrcLocal && !isDstLocal) {
				// p1 为中心本端，p2 为外围节点：紧密锚定在 p2 前方，根据连线角度精准避让卡片外沿 (+24px 安全缓冲)
				const dx = p2.x - p1.x;
				const dy = p2.y - p1.y;
				const lineLen = Math.sqrt(dx * dx + dy * dy);
				const angle = Math.atan2(dy, dx);
				const cardBorderDist = Math.sqrt(Math.pow(74 * Math.cos(angle), 2) + Math.pow(42 * Math.sin(angle), 2));
				const safeBackDist = Math.max(90, Math.round(cardBorderDist + 24));
				const targetDist = Math.max(60, lineLen - safeBackDist);
				const ratio = (lineLen > 0) ? (targetDist / lineLen) : 0.70;
				mx = Math.round(p1.x + ratio * dx);
				my = Math.round(p1.y + ratio * dy);
			} else if (isDstLocal && !isSrcLocal) {
				// p2 为中心本端，p1 为外围节点：紧密锚定在 p1 前方
				const dx = p1.x - p2.x;
				const dy = p1.y - p2.y;
				const lineLen = Math.sqrt(dx * dx + dy * dy);
				const angle = Math.atan2(dy, dx);
				const cardBorderDist = Math.sqrt(Math.pow(74 * Math.cos(angle), 2) + Math.pow(42 * Math.sin(angle), 2));
				const safeBackDist = Math.max(90, Math.round(cardBorderDist + 24));
				const targetDist = Math.max(60, lineLen - safeBackDist);
				const ratio = (lineLen > 0) ? (targetDist / lineLen) : 0.70;
				mx = Math.round(p2.x + ratio * dx);
				my = Math.round(p2.y + ratio * dy);
			} else {
				// 外围对等节点之间的互联边（Mesh 底边/外围边）：取中点并沿中心向外法线微推 20px，绝不内缩到中心
				const midX = (p1.x + p2.x) / 2;
				const midY = (p1.y + p2.y) / 2;
				const outVecX = midX - cx;
				const outVecY = midY - cy;
				const outLen = Math.sqrt(outVecX * outVecX + outVecY * outVecY);
				const pushDist = 20;
				if (outLen > 0) {
					mx = Math.round(midX + (outVecX / outLen) * pushDist);
					my = Math.round(midY + (outVecY / outLen) * pushDist);
				} else {
					mx = Math.round(midX);
					my = Math.round(midY);
				}
			}

			// 全局卡片碰撞二次兜底校验：确保与网络中任意节点卡片保持安全间距
			for (let ni = 0; ni < nodeCount; ni++) {
				const npos = posMap[nodes[ni].node_id];
				if (!npos) continue;
				if (Math.abs(mx - npos.x) < 78 && Math.abs(my - npos.y) < 42) {
					// 若触碰卡片包围盒，沿中心向外法线方向微调避让
					const pushDirX = mx >= npos.x ? 1 : -1;
					const pushDirY = my >= npos.y ? 1 : -1;
					mx += pushDirX * 16;
					my += pushDirY * 12;
				}
			}

			const colorCfg = getLatencyColor(lat);
			const labelStr = lat + ' ms';

			// 极简纯净排版：直接在线上渲染同色文字，通过背景白色描边实现自然的连线阻断
			badgesLayer.push(createSvg('text', {
				'x': mx,
				'y': my + 4,
				'text-anchor': 'middle',
				'font-family': 'monospace, sans-serif',
				'font-size': '11.5',
				'font-weight': '700',
				'fill': colorCfg.text,
				'stroke': '#fafafa',
				'stroke-width': '4.5',
				'paint-order': 'stroke fill',
				'stroke-linejoin': 'round'
			}, labelStr));
		}
	}

	const allElements = linesLayer.concat(nodesLayer, badgesLayer);

	const svgNode = createSvg('svg', {
		'viewBox': '0 0 ' + width + ' ' + height,
		'style': 'width: 100%; height: 100%; display: block; margin: 0 auto; user-select: none; background: transparent; cursor: grab;'
	}, allElements);

	let currentScale = topologyViewState.scale || 1.0;
	let panX = topologyViewState.panX || 0;
	let panY = topologyViewState.panY || 0;
	let isDragging = false;
	let dragStartX = 0;
	let dragStartY = 0;

	function applyViewBox() {
		topologyViewState.scale = currentScale;
		topologyViewState.panX = panX;
		topologyViewState.panY = panY;
		const vbW = width / currentScale;
		const vbH = height / currentScale;
		const vbX = (width - vbW) / 2 - (panX / currentScale);
		const vbY = (height - vbH) / 2 - (panY / currentScale);
		svgNode.setAttribute('viewBox', Math.round(vbX) + ' ' + Math.round(vbY) + ' ' + Math.round(vbW) + ' ' + Math.round(vbH));
	}

	applyViewBox();

	svgNode.addEventListener('wheel', function(ev) {
		ev.preventDefault();
		const zoomFactor = ev.deltaY < 0 ? 1.15 : 0.85;
		currentScale = Math.min(3.5, Math.max(0.35, currentScale * zoomFactor));
		applyViewBox();
	}, { passive: false });

	svgNode.addEventListener('mousedown', function(ev) {
		if (ev.button !== 0) return;
		isDragging = true;
		dragStartX = ev.clientX - panX;
		dragStartY = ev.clientY - panY;
		svgNode.style.cursor = 'grabbing';
	});

	window.addEventListener('mousemove', function(ev) {
		if (!isDragging) return;
		panX = ev.clientX - dragStartX;
		panY = ev.clientY - dragStartY;
		applyViewBox();
	});

	window.addEventListener('mouseup', function() {
		if (isDragging) {
			isDragging = false;
			svgNode.style.cursor = 'grab';
		}
	});

	const btnStyle = 'display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; font-size: 14px; font-weight: bold; color: #475569; background: rgba(255, 255, 255, 0.9); border: 1px solid #cbd5e1; border-radius: 4px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08); cursor: pointer; user-select: none; transition: all 0.15s;';
	
	const zoomInBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button',
		'style': btnStyle,
		'title': _('Zoom In'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = Math.min(3.5, currentScale * 1.25);
			applyViewBox();
		}
	}, '+');

	const zoomOutBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button',
		'style': btnStyle,
		'title': _('Zoom Out'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = Math.max(0.35, currentScale * 0.8);
			applyViewBox();
		}
	}, '−');

	const resetBtn = E('button', {
		'type': 'button',
		'class': 'btn cbi-button',
		'style': btnStyle + ' width: auto; padding: 0 8px; font-size: 11px;',
		'title': _('Reset View'),
		'click': function(ev) {
			ev.preventDefault();
			currentScale = 1.0;
			panX = 0;
			panY = 0;
			applyViewBox();
		}
	}, '1:1');

	const toolbar = E('div', {
		'style': 'position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; z-index: 10;'
	}, [zoomInBtn, zoomOutBtn, resetBtn]);

	const graphContainer = E('div', {
		'style': 'position: relative; width: 100%; aspect-ratio: 1 / 1; max-height: 560px; overflow: hidden; background: #fafafa; border-radius: 4px;'
	}, [toolbar, svgNode]);

	const legend = E('div', {
		'style': 'text-align: center; margin-top: 10px; font-size: 12px; line-height: 1.6;'
	}, [
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #22c55e; border-radius: 2px; margin-right: 5px; vertical-align: middle;' }),
		_('< 50ms (Optimal)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #3b82f6; border-radius: 2px; margin-left: 14px; margin-right: 5px; vertical-align: middle;' }),
		_('50 ~ 150ms (Good)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 16px; height: 3px; background: #f59e0b; border-radius: 2px; margin-left: 14px; margin-right: 5px; vertical-align: middle;' }),
		_('> 150ms (Fair)'),
		'   ',
		E('span', { 'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-family: monospace; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px; margin-left: 14px; vertical-align: middle;' }, 'CIDR'),
		E('span', { 'style': 'margin-left: 4px; vertical-align: middle;' }, _('Proxy Network')),
		E('span', { 'style': 'margin-left: 16px; color: #94a3b8; font-size: 11px; vertical-align: middle;' }, _('(Drag to pan, scroll to zoom)'))
	]);

	return E('div', {
		'style': 'width: 100%; border: 1px solid #e5e5e5; border-radius: 6px; padding: 15px; box-sizing: border-box; margin-top: 5px;'
	}, [graphContainer, legend]);
}

return view.extend({
	load: function() {
		return Promise.all([
			L.resolveDefault(callGetStatus(), {}),
			L.resolveDefault(callGetPeers(), {}),
			uci.load('easytier'),
			L.resolveDefault(callGetSubroutes(), { routes: [] })
		]);
	},

	render: function(data) {
		const status = data[0] || {};
		const peerData = data[1] || {};
		const subroutesData = data[3] || {};
		const subroutes = (subroutesData && Array.isArray(subroutesData.routes)) ? subroutesData.routes : (Array.isArray(subroutesData) ? subroutesData : []);

		const map = new form.Map('easytier', _('EasyTier'),
			_('EasyTier is a simple, secure, decentralized mesh VPN for intranet penetration, implemented in Rust.')
		);

		// ==================== Tab 1: Overview & Peers ====================
		const s_overview = map.section(form.NamedSection, '_status', '_status');
		s_overview.anonymous = true;
		s_overview.render = function() {
			poll.add(function() {
				return Promise.all([
					L.resolveDefault(callGetStatus(), {}),
					L.resolveDefault(callGetPeers(), {}),
					L.resolveDefault(callGetTopology(), {})
				]).then(function(res) {
					const curStatus = res[0] || {};
					const curPeers = res[1] || {};
					const curTopo = res[2] || {};

					const statusContainer = document.getElementById('easytier_service_status_display');
					if (statusContainer) {
						statusContainer.replaceChildren(
							renderCoreStatus(curStatus.core),
							renderWebStatus(curStatus.web)
						);
					}

					const localNodeContainer = document.getElementById('easytier_local_node_display');
					if (localNodeContainer) {
						localNodeContainer.replaceChildren(renderLocalNodeInfo(curPeers));
					}

					const peersContainer = document.getElementById('easytier_peers_display');
					if (peersContainer) {
						peersContainer.replaceChildren(renderPeersTable(curPeers));
					}

					const topoContainer = document.getElementById('easytier_topology_display');
					if (topoContainer) {
						topoContainer.replaceChildren(renderTopologySvg(curTopo, curPeers));
					}
				});
			}, 5);

			return E('div', {}, [
				E('hr', { 'style': 'margin: 5px 0 15px 0; border: 0; border-top: 1px solid #e5e5e5;' }),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Service Status')),
					E('div', { 'id': 'easytier_service_status_display' }, [
						renderCoreStatus(status.core),
						renderWebStatus(status.web)
					])
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('h3', {}, _('Local Node Information')),
					E('div', { 'id': 'easytier_local_node_display' }, renderLocalNodeInfo(peerData))
				]),
				E('div', { 'class': 'cbi-section' }, [
					E('div', { 'style': 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;' }, [
						E('h3', { 'style': 'margin: 0;' }, _('Connected Peer Nodes')),
						E('button', {
							'class': 'btn cbi-button cbi-button-action',
							'click': function(ev) {
								const localContainer = document.getElementById('easytier_local_node_display');
								const peersContainer = document.getElementById('easytier_peers_display');
								if (peersContainer) {
									peersContainer.replaceChildren(E('em', {}, _('Collecting data ...')));
								}
								return callGetPeers().then(function(res) {
									if (localContainer) {
										localContainer.replaceChildren(renderLocalNodeInfo(res));
									}
									if (peersContainer) {
										peersContainer.replaceChildren(renderPeersTable(res));
									}
								}).catch(function(err) {
									ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load peers: %s').format(err.message || err)) ], 5000, 'error');
								});
							}
						}, _('Refresh'))
					]),
					E('div', { 'id': 'easytier_peers_display' }, renderPeersTable(peerData))
				])
			]);
		};

		// ==================== Tab 2: Settings ====================
		const s = map.section(form.NamedSection, 'settings', 'easytier', _('Settings'));
		s.tab('general', _('Core Settings'));
		s.tab('advanced', _('Advanced Options'));
		s.tab('web', _('Web Console'));
		s.tab('topology', _('Network Topology'));
		s.tab('logs', _('Logs'));

		// --- Core Settings ---
		let o;
		o = s.taboption('general', form.Flag, 'enabled', _('Enable Core Service'));
		o.rmempty = false;

		o = s.taboption('general', form.ListValue, 'etcmd', _('Startup Method'));
		o.value('etcmd', _('Command-line'));
		o.value('config', _('Configuration File'));
		o.value('web', _('Cloud Web Config'));
		o.default = 'etcmd';

		o = s.taboption('general', form.Value, 'network_name', _('Network Name'),
			_('The VPN network name to identify this virtual network (Corresponding flag: --network-name).')
		);
		o.placeholder = 'easytier';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'network_secret', _('Network Secret'),
			_('The secret phrase used to authorize and encrypt traffic (Corresponding flag: --network-secret).')
		);
		o.password = true;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'ip_dhcp', _('Enable DHCP IP Allocation'),
			_('Automatically determine and assign a virtual IP address (Corresponding flag: -d, --dhcp).')
		);
		o.default = '1';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'ipaddr', _('Interface IPv4 Address'),
			_('The static IPv4 address of this node (Corresponding flag: -i, --ipv4). Ignored when DHCP is enabled.')
		);
		o.datatype = 'or(ip4addr, cidr4)';
		o.placeholder = '10.144.144.1/24';
		o.retain = true;
		o.depends({ 'etcmd': 'etcmd', 'ip_dhcp': '0' });

		o = s.taboption('general', form.Value, 'ip6addr', _('Interface IPv6 Address'),
			_('The static IPv6 address of this node (Corresponding flag: --ipv6).')
		);
		o.datatype = 'or(ip6addr, cidr6)';
		o.placeholder = 'fd00:144::1/64';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'peeradd', _('Peer Nodes'),
			_('Initial connection peer node URLs (Corresponding flag: -p, --peers).')
		);
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'external_node', _('Public Discovery Node'),
			_('Public discovery node URL (Corresponding flag: -e, --external-node).')
		);
		o.placeholder = 'tcp://public.easytier.top:11010';
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'proxy_networks', _('Proxy Networks'),
			_('Subnet CIDRs to proxy and announce through this node (Corresponding flag: -n, --proxy-networks). Select from the detected local subnets below or enter custom CIDRs.')
		);
		if (subroutes && subroutes.length > 0) {
			subroutes.forEach(function(subnet) {
				o.value(subnet, subnet);
			});
		}
		o.rmempty = true;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'enable_exit_node', _('Enable Exit Node'),
			_('Allow other peers in the network to route their Internet traffic through this node (Corresponding flag: --enable-exit-node).')
		);
		o.default = '0';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'magic_dns', _('Enable Magic DNS'),
			_('Allow resolving peer node domain names (such as hostname.et.net) without memorizing virtual IP addresses (Corresponding flag: --accept-dns). Automatically forwards DNS queries via dnsmasq. Note: If third-party DNS tools (e.g. MosDNS, AdGuard Home, SmartDNS) are active, ensure this domain zone is excluded from hijacking.')
		);
		o.default = '0';
		o.rmempty = false;
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'tld_dns_zone', _('Magic DNS Domain Zone'),
			_('Specify the top-level domain zone for Magic DNS (Corresponding flag: --tld-dns-zone). Default is et.net. (FQDN ending with dot).')
		);
		o.placeholder = 'et.net.';
		o.default = 'et.net.';
		o.retain = true;
		o.depends('magic_dns', '1');

		// Config File Path under 'config' mode
		o = s.taboption('general', form.Value, 'custom_config_file', _('Configuration File Path'),
			_('Absolute path to the TOML configuration file (Corresponding flag: -c, --config-file). Ensure the file exists with valid EasyTier configuration.')
		);
		o.default = '/etc/easytier/config.toml';
		o.placeholder = '/etc/easytier/config.toml';
		o.retain = true;
		o.depends('etcmd', 'config');
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
			}
			return node;
		};

		// Web Server Options under 'web' mode
		o = s.taboption('general', form.Value, 'web_config', _('Web Config Server URL'),
			_('Remote web configuration server address (Corresponding flag: -w, --web-config).')
		);
		o.placeholder = 'udp://dashboard.example.com:22020/admin';
		o.retain = true;
		o.rmempty = false;
		o.depends('etcmd', 'web');
		o.validate = function(section_id, value) {
			const etcmd = uci.get('easytier', 'settings', 'etcmd');
			if (etcmd === 'web') {
				if (!value || value.trim() === '') {
					return _('Web Config Server URL cannot be empty.');
				}
				if (!/^(tcp|udp|ws|wss|wg|quic):\/\/.+/.test(value.trim())) {
					return _('Invalid URL format, must start with tcp://, udp://, ws://, wss://, wg://, or quic://');
				}
			}
			return true;
		};
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
			}
			return node;
		};

		o = s.taboption('general', form.Value, 'machine_id', _('Machine ID (UUID)'),
			_('Unique device identifier UUID in the cloud management console (Corresponding flag: --machine-id). Automatically generated on initial install. Changing UUID will automatically clear local cloud cache.')
		);
		o.placeholder = 'df33f4ba-c01b-4961-82f3-a424f39d5a9c';
		o.retain = true;
		o.depends('etcmd', 'web');
		o.validate = function(section_id, value) {
			if (!value || value.length === 0)
				return true;
			if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(value.trim()))
				return _('Invalid UUID format (e.g. %s)').format('df33f4ba-c01b-4961-82f3-a424f39d5a9c');
			return true;
		};
		o.renderWidget = function() {
			const node = form.Value.prototype.renderWidget.apply(this, arguments);
			const input = node.querySelector ? (node.querySelector('input') || node) : node;
			if (input && input.style) {
				input.style.width = '295px';
				input.style.maxWidth = '100%';
				input.style.fontFamily = 'monospace';
			}
			return node;
		};

		// --- Advanced Options ---
		o = s.taboption('advanced', form.Value, 'rpc_port', _('RPC Management Port'),
			_('Port for local CLI and RPC management portal (Corresponding flag: --rpc-portal).')
		);
		o.datatype = 'port';
		o.default = '15888';
		o.placeholder = '15888';

		o = s.taboption('advanced', form.Value, 'dev_name', _('TUN Device Name'),
			_('Virtual TUN network interface name (Corresponding flag: --dev-name).')
		);
		o.default = 'easytier0';
		o.placeholder = 'easytier0';

		o = s.taboption('advanced', form.ListValue, 'encryption_algorithm', _('Encryption Algorithm'));
		o.value('aes-gcm', 'AES-GCM');
		o.value('chacha20-poly1305', 'ChaCha20-Poly1305');
		o.value('none', _('None'));
		o.default = 'aes-gcm';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'multi_thread', _('Multi-threaded Mode'),
			_('Enable multi-threaded packet processing for higher throughput (Corresponding flag: --multi-thread).')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Flag, 'allow_wan', _('Allow WAN Access'),
			_('Automatically open and manage firewall traffic rules on WAN zone to allow incoming connections for external peers.')
		);
		o.default = '0';
		o.rmempty = false;

		o = s.taboption('advanced', form.Flag, 'tunnel_snat', _('Enable Tunnel Traffic SNAT'),
			_('Use OpenWrt system firewall to manage NAT for EasyTier tunnel and subnet traffic. Disabling this option disables source address masquerading to preserve real source IPs of remote peers and subnets in the local network.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Value, 'custom_params', _('Custom Command Parameters'),
			_('Additional command-line parameters appended to easytier-core.')
		);
		o.retain = true;
		o.depends('etcmd', 'etcmd');

		// --- Web Console ---
		o = s.taboption('web', form.Flag, 'web_enabled', _('Enable Web Console Service'),
			_('The web console may consume significant memory, please enable as needed.')
		);
		o.rmempty = false;

		o = s.taboption('web', form.Value, 'web_html_port', _('Web Console Port'),
			_('HTTP listen port for easytier-web embedded web dashboard.')
		);
		o.datatype = 'port';
		o.default = '22020';
		o.placeholder = '22020';

		o = s.taboption('web', form.Value, 'web_dir', _('Web Data Directory'),
			_('Directory to store SQLite database for easytier-web.')
		);
		o.default = '/etc/easytier';
		o.placeholder = '/etc/easytier';

		// --- Network Topology ---
		const topologyActions = s.taboption('topology', form.DummyValue, '_topology_actions');
		topologyActions.render = function() {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Topology Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							const display = document.getElementById('easytier_topology_display');
							if (display) {
								display.replaceChildren(E('em', {}, _('Collecting data ...')));
							}
							return Promise.all([
								callGetTopology(),
								callGetPeers()
							]).then(function(results) {
								if (display) {
									display.replaceChildren(renderTopologySvg(results[0], results[1]));
								}
							}).catch(function(err) {
								if (display) {
									display.replaceChildren(E('em', {}, _('No topology data available.')));
								}
								ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load topology: %s').format(err.message || err)) ], 5000, 'error');
							});
						}
					}, _('Refresh Topology'))
				])
			]);
		};

		const topologySection = s.taboption('topology', form.DummyValue, '_topology');
		topologySection.render = function() {
			window.setTimeout(function() {
				const display = document.getElementById('easytier_topology_display');
				if (display) {
					Promise.all([
						callGetTopology(),
						callGetPeers()
					]).then(function(results) {
						display.replaceChildren(renderTopologySvg(results[0], results[1]));
					}).catch(function(err) {
						display.replaceChildren(E('em', {}, _('No topology data available.')));
					});
				}
			}, 100);

			return E('div', { 'id': 'easytier_topology_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting data ...'))
			);
		};

		// --- Logs ---
		const logActions = s.taboption('logs', form.DummyValue, '_log_actions');
		logActions.render = function() {
			return E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Log Actions')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						'click': function(ev) {
							const display = document.getElementById('easytier_logs_display');
							if (display) {
								display.replaceChildren(E('em', {}, _('Collecting logs...')));
							}
							return callGetLogs().then(function(res) {
								if (display) {
									display.replaceChildren(renderLogsView(res));
								}
							}).catch(function(err) {
								if (display) {
									display.replaceChildren(E('em', {}, _('No logs available.')));
								}
								ui.addTimeLimitedNotification(null, [ E('p', {}, _('Failed to load logs: %s').format(err.message || err)) ], 5000, 'error');
							});
						}
					}, _('Refresh Logs')),
					' ',
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						'click': function(ev) {
							return callClearLogs().then(function() {
								const display = document.getElementById('easytier_logs_display');
								if (display) {
									display.replaceChildren(E('em', {}, _('Logs cleared.')));
								}
							});
						}
					}, _('Clear Logs'))
				])
			]);
		};

		const logsSection = s.taboption('logs', form.DummyValue, '_logs');
		logsSection.render = function() {
			window.setTimeout(function() {
				const display = document.getElementById('easytier_logs_display');
				if (display) {
					callGetLogs().then(function(res) {
						display.replaceChildren(renderLogsView(res));
					}).catch(function(err) {
						display.replaceChildren(E('em', {}, _('No logs available.')));
					});
				}
			}, 100);

			return E('div', { 'id': 'easytier_logs_display', 'class': 'cbi-value' },
				E('em', {}, _('Collecting logs...'))
			);
		};

		return map.render();
	},

	handleSaveApply: function(ev, mode) {
		return this.super('handleSaveApply', [ev, mode]).then(function() {
			return callServiceAction('restart');
		});
	}
});
