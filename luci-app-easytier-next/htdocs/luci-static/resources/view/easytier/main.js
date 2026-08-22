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
		{ label: _('EasyTier IPv4'), value: E('strong', { 'style': 'color: #007bff;' }, ipv4Val) },
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
		{ title: _('IPv4'), minWidth: '140px' },
		{ title: _('Hostname'), minWidth: '150px' },
		{ title: _('Proxy CIDRs'), minWidth: '130px' },
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

		// 2. 远端节点互联链路仲裁计算
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

	const width = 840;
	const height = 500;
	const cx = 420;
	const cy = 250;
	const R = (nodeCount <= 2) ? 140 : ((nodeCount <= 4) ? 180 : 200);

	const posMap = {};
	if (nodeCount === 1) {
		posMap[nodes[0].node_id] = { x: cx, y: cy };
	} else {
		for (let i = 0; i < nodeCount; i++) {
			const angle = -Math.PI / 2 + (2 * Math.PI * i) / nodeCount;
			posMap[nodes[i].node_id] = {
				x: Math.round(cx + R * Math.cos(angle)),
				y: Math.round(cy + R * Math.sin(angle))
			};
		}
	}

	const linesLayer = [];
	const nodesLayer = [];
	const badgesLayer = [];

	// 1. 底层：绘制链路连线
	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const p1 = posMap[link.srcId];
		const p2 = posMap[link.dstId];
		if (!p1 || !p2) continue;

		linesLayer.push(createSvg('line', {
			'x1': p1.x, 'y1': p1.y,
			'x2': p2.x, 'y2': p2.y,
			'stroke': '#94a3b8',
			'stroke-width': '2',
			'stroke-dasharray': '5,5',
			'opacity': '0.75'
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
				const labelText = (proxyCount === 1) ? ('Subnet: ' + proxyList[pIdx]) : proxyList[pIdx];
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

	// 3. 顶层：绘制延迟胶囊徽标（防重叠避让算法）
	const placedBadges = [];

	for (let k = 0; k < linkKeys.length; k++) {
		const link = linkMap[linkKeys[k]];
		const p1 = posMap[link.srcId];
		const p2 = posMap[link.dstId];
		if (!p1 || !p2) continue;

		const lat = link.latency;
		if (lat !== undefined && lat !== null) {
			const candidateT = [0.5, 0.4, 0.6, 0.35, 0.65];
			let bestT = 0.5;
			let maxScore = -1;

			for (let ti = 0; ti < candidateT.length; ti++) {
				const t = candidateT[ti];
				const tx = Math.round(p1.x + t * (p2.x - p1.x));
				const ty = Math.round(p1.y + t * (p2.y - p1.y));

				const distP1 = Math.sqrt((tx - p1.x) * (tx - p1.x) + (ty - p1.y) * (ty - p1.y));
				const distP2 = Math.sqrt((tx - p2.x) * (tx - p2.x) + (ty - p2.y) * (ty - p2.y));
				const minNodeDist = Math.min(distP1, distP2);

				// 确保远离节点卡片边缘（至少 85px）
				if (minNodeDist < 85) continue;

				let minDist = Math.sqrt((tx - cx) * (tx - cx) + (ty - cy) * (ty - cy));
				if (candidateT.length > 1 && minDist < 28) minDist = 0;

				for (let bi = 0; bi < placedBadges.length; bi++) {
					const b = placedBadges[bi];
					const d = Math.sqrt((tx - b.x) * (tx - b.x) + (ty - b.y) * (ty - b.y));
					if (d < minDist) minDist = d;
				}

				if (minDist > maxScore) {
					maxScore = minDist;
					bestT = t;
				}
				if (minDist >= 55) {
					bestT = t;
					break;
				}
			}

			const mx = Math.round(p1.x + bestT * (p2.x - p1.x));
			const my = Math.round(p1.y + bestT * (p2.y - p1.y));
			placedBadges.push({ x: mx, y: my });

			let badgeBg = '#fef3c7';
			let badgeText = '#b45309';
			let badgeBorder = '#fcd34d';

			if (lat < 50) {
				badgeBg = '#dcfce7';
				badgeText = '#15803d';
				badgeBorder = '#86efac';
			} else if (lat <= 150) {
				badgeBg = '#dbeafe';
				badgeText = '#1d4ed8';
				badgeBorder = '#93c5fd';
			}

			const labelStr = lat + ' ms';
			const bw = 64;
			const bh = 22;

			badgesLayer.push(createSvg('g', {}, [
				createSvg('rect', {
					'x': mx - bw / 2,
					'y': my - bh / 2,
					'width': bw,
					'height': bh,
					'rx': '11',
					'fill': badgeBg,
					'stroke': badgeBorder,
					'stroke-width': '1.5'
				}),
				createSvg('text', {
					'x': mx,
					'y': my + 4,
					'text-anchor': 'middle',
					'font-family': 'monospace, sans-serif',
					'font-size': '11',
					'font-weight': 'bold',
					'fill': badgeText
				}, labelStr)
			]));
		}
	}

	const allElements = linesLayer.concat(nodesLayer, badgesLayer);

	const svgNode = createSvg('svg', {
		'viewBox': '0 0 ' + width + ' ' + height,
		'style': 'width: 100%; height: auto; min-height: 400px; max-height: 540px; display: block; margin: 0 auto; user-select: none; background: transparent;'
	}, allElements);

	const legend = E('div', {
		'style': 'text-align: center; margin-top: 10px; font-size: 12px; line-height: 1.6;'
	}, [
		E('span', { 'style': 'display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #22c55e; margin-right: 4px; vertical-align: middle;' }),
		_('< 50ms (Optimal)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #3b82f6; margin-left: 14px; margin-right: 4px; vertical-align: middle;' }),
		_('50 ~ 150ms (Good)'),
		'   ',
		E('span', { 'style': 'display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #f59e0b; margin-left: 14px; margin-right: 4px; vertical-align: middle;' }),
		_('> 150ms (Fair)'),
		'   ',
		E('span', { 'style': 'display: inline-block; padding: 1px 6px; font-size: 11px; font-family: monospace; color: #047857; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 3px; margin-left: 14px; vertical-align: middle;' }, 'Subnet: ...'),
		E('span', { 'style': 'margin-left: 4px; vertical-align: middle;' }, _('Proxy Network'))
	]);

	return E('div', {
		'style': 'width: 100%; border: 1px solid #e5e5e5; border-radius: 6px; padding: 15px; box-sizing: border-box; margin-top: 5px;'
	}, [svgNode, legend]);
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
		const subroutes = Array.isArray(data[3]?.routes) ? data[3].routes : (Array.isArray(data[3]) ? data[3] : []);

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
			_('The VPN network name to identify this virtual network.')
		);
		o.placeholder = 'easytier';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'network_secret', _('Network Secret'),
			_('The secret phrase used to authorize and encrypt traffic.')
		);
		o.password = true;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'ip_dhcp', _('Enable DHCP IP Allocation'),
			_('Automatically determine and assign an IP address.')
		);
		o.default = '1';
		o.rmempty = false;
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'ipaddr', _('Interface IPv4 Address'),
			_('The static IPv4 address of this node. Ignored when DHCP is enabled.')
		);
		o.datatype = 'or("ip4addr", "cidr4")';
		o.placeholder = '10.144.144.1/24';
		o.depends({ 'etcmd': 'etcmd', 'ip_dhcp': '0' });

		o = s.taboption('general', form.Value, 'ip6addr', _('Interface IPv6 Address'),
			_('The static IPv6 address of this node.')
		);
		o.datatype = 'or("ip6addr", "cidr6")';
		o.placeholder = 'fd00:144::1/64';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'peeradd', _('Peer Nodes'),
			_('Initial connection peer node URLs.')
		);
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Value, 'external_node', _('Public Discovery Node'),
			_('Public discovery node URL.')
		);
		o.placeholder = 'tcp://public.easytier.top:11010';
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.DynamicList, 'proxy_networks', _('Proxy Networks'),
			_('Subnet CIDRs to proxy and announce through this node. Select from the detected local subnets below or enter custom CIDRs.')
		);
		o.datatype = 'cidr4';
		if (subroutes && subroutes.length > 0) {
			subroutes.forEach(function(subnet) {
				o.value(subnet, subnet);
			});
		}
		o.depends('etcmd', 'etcmd');

		o = s.taboption('general', form.Flag, 'allow_wan', _('Allow WAN Access'),
			_('Automatically open and manage firewall traffic rules on WAN zone to allow incoming connections for external peers.')
		);
		o.default = '0';
		o.rmempty = false;
		o.depends('etcmd', 'etcmd');

		// Config File Path under 'config' mode
		o = s.taboption('general', form.Value, 'custom_config_file', _('Configuration File Path'),
			_('Absolute path to the TOML configuration file. Ensure the file exists with valid EasyTier configuration.')
		);
		o.default = '/etc/easytier/config.toml';
		o.placeholder = '/etc/easytier/config.toml';
		o.depends('etcmd', 'config');

		// Web Server URL under 'web' mode
		o = s.taboption('general', form.Value, 'web_config', _('Web Config Server URL'),
			_('Remote web configuration server address.')
		);
		o.depends('etcmd', 'web');

		// --- Advanced Options ---
		o = s.taboption('advanced', form.Value, 'rpc_port', _('RPC Management Port'),
			_('Port for local CLI and RPC management portal.')
		);
		o.datatype = 'port';
		o.default = '15888';
		o.placeholder = '15888';

		o = s.taboption('advanced', form.Value, 'dev_name', _('TUN Device Name'),
			_('Virtual TUN network interface name.')
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
			_('Enable multi-threaded packet processing for higher throughput.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Flag, 'tunnel_snat', _('Enable Tunnel Traffic SNAT'),
			_('Use OpenWrt system firewall to manage NAT for EasyTier tunnel and subnet traffic. Disabling this option disables source address masquerading to preserve real source IPs of remote peers and subnets in the local network.')
		);
		o.default = '0';

		o = s.taboption('advanced', form.Value, 'custom_params', _('Custom Command Parameters'),
			_('Additional command-line parameters appended to easytier-core.')
		);
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
