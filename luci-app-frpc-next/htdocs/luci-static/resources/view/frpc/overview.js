'use strict';
'require view';
'require rpc';
'require poll';
'require ui';

const callFrpcStatus = rpc.declare({
	object: 'luci.frpc',
	method: 'get_status'
});

const callAdoptProcess = rpc.declare({
	object: 'luci.frpc',
	method: 'adopt_process'
});

const callServiceAction = rpc.declare({
	object: 'luci.frpc',
	method: 'service_action',
	params: [ 'action' ]
});

const callRuntimeInfo = rpc.declare({
	object: 'luci.frpc',
	method: 'get_runtime_info'
});

function renderState(status) {
	let text = _('Unknown');
	let color = '#999';

	if (status.state === 'managed') {
		text = _('Running (Managed)');
		color = 'green';
	} else if (status.state === 'unmanaged') {
		text = _('Running (Unmanaged)');
		color = 'orange';
	} else if (status.state === 'stopped') {
		text = _('Stopped');
		color = 'red';
	}

	if (status.pid)
		text += ' [PID: ' + status.pid + ']';

	return { text, color };
}

function flattenProxies(statusObj) {
	const rows = [];
	if (!statusObj || typeof statusObj !== 'object')
		return rows;

	Object.keys(statusObj).forEach((ptype) => {
		const arr = statusObj[ptype];
		if (!Array.isArray(arr))
			return;
		arr.forEach((p) => {
			if (!p || typeof p !== 'object')
				return;
			rows.push({
				name: p.name || '-',
				type: p.type || ptype || '-',
				status: p.status || '-',
				local: p.local_addr || '-',
				remote: p.remote_addr || '-',
				err: p.err || ''
			});
		});
	});

	return rows;
}

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return Promise.all([ callFrpcStatus(), callRuntimeInfo() ]);
	},

	render: function(data) {
		const status = data && data[0] ? data[0] : {};
		const runtime = data && data[1] ? data[1] : {};
		const stateInfo = renderState(status || {});

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Frp Client Overview')),
			E('div', { 'class': 'cbi-map-descr' }, _('Frp Client overview of runtime state, generated config, and proxy count.'))
		]);

		const statusSection = E('div', { 'class': 'cbi-section' }, [
			E('h3', { 'class': 'cbi-section-title' }, _('Service Status')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Current Status')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { id: 'frpc-status-text', 'style': 'font-weight:bold; color:' + stateInfo.color + '; margin-right:10px;' }, stateInfo.text),
						E('button', {
							id: 'frpc-restart-btn',
							'class': 'btn cbi-button cbi-button-apply',
							click: ui.createHandlerFn(this, function(ev) {
								if (!ev || !ev.currentTarget)
									return;
								const btn = ev.currentTarget;
								btn.disabled = true;
								return callAdoptProcess().then(function() {
									ui.addNotification(null, E('p', _('Force restarting service, please wait...')), 'info');
									window.setTimeout(function() { location.reload(); }, 1200);
								}).finally(function() {
									btn.disabled = false;
								});
							})
						}, _('Force Restart'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Generated Runtime Config')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { id: 'frpc-runtime-config' }, status.runtime_config || '-')
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Configured Proxies')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { id: 'frpc-proxy-count' }, String(status.proxy_count || 0))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('frpc Version')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { id: 'frpc-version' }, status.version || '-')
					])
				])
			])
		]);
		container.appendChild(statusSection);

		const proxyRows = flattenProxies(runtime.status);
		const runtimeSection = E('div', {
			'class': 'cbi-section',
			id: 'frpc-runtime-section',
			style: (status.state === 'managed') ? '' : 'display:none'
		}, [
			E('h3', { 'class': 'cbi-section-title' }, _('Runtime Details')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Web Panel')),
					E('div', { 'class': 'cbi-value-field' }, [
						(runtime.web_url ? E('a', {
							id: 'frpc-web-api',
							'class': 'btn cbi-button',
							href: runtime.web_url,
							target: '_blank',
							rel: 'noopener noreferrer'
						}, _('Open')) : E('span', { id: 'frpc-web-api' }, '-'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Connected Server')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('span', { id: 'frpc-connected-server' }, (runtime.server_addr && runtime.server_port) ? (runtime.server_addr + ':' + runtime.server_port) : '-'),
						E('div', { 'class': 'cbi-value-description' }, _('Connect to FRP server'))
					])
				]),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Proxy Runtime List')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('div', { 'class': 'cbi-value-description', style: 'margin-bottom:6px;' }, _('Running proxy list')),
						E('div', {
							id: 'frpc-proxy-list-wrap',
							style: 'max-height:220px; overflow:auto;'
						}, proxyRows.length > 0 ? E('table', { 'class': 'table cbi-section-table' }, [
							E('tr', { 'class': 'tr table-titles' }, [
								E('th', { 'class': 'th' }, _('Name')),
								E('th', { 'class': 'th' }, _('Type')),
								E('th', { 'class': 'th' }, _('Status')),
								E('th', { 'class': 'th' }, _('Local')),
								E('th', { 'class': 'th' }, _('Remote')),
								E('th', { 'class': 'th' }, _('Error'))
							])
						]) : E('div', {}, _('No running proxies')))
					])
				])
			])
		]);
		container.appendChild(runtimeSection);

		poll.add(() => Promise.all([callFrpcStatus(), callRuntimeInfo()]).then((res) => {
			const s = res[0] || {};
			const r = res[1] || {};
			const next = renderState(s);

			const statusNode = document.getElementById('frpc-status-text');
			if (statusNode) {
				statusNode.textContent = next.text;
				statusNode.style.color = next.color;
			}

			const runtimeConfigNode = document.getElementById('frpc-runtime-config');
			if (runtimeConfigNode)
				runtimeConfigNode.textContent = s.runtime_config || '-';

			const proxyCountNode = document.getElementById('frpc-proxy-count');
			if (proxyCountNode)
				proxyCountNode.textContent = String(s.proxy_count || 0);

			const versionNode = document.getElementById('frpc-version');
			if (versionNode)
				versionNode.textContent = s.version || '-';

			const runtimeSectionNode = document.getElementById('frpc-runtime-section');
			if (runtimeSectionNode)
				runtimeSectionNode.style.display = (s.state === 'managed') ? '' : 'none';

			const webNode = document.getElementById('frpc-web-api');
			if (webNode) {
				if (r.web_url && webNode.tagName === 'A') {
					webNode.href = r.web_url;
				} else if (r.web_url && webNode.tagName !== 'A') {
					const btn = E('a', {
						id: 'frpc-web-api',
						'class': 'btn cbi-button',
						href: r.web_url,
						target: '_blank',
						rel: 'noopener noreferrer'
					}, _('Open'));
					webNode.parentNode.replaceChild(btn, webNode);
				} else if (!r.web_url && webNode.tagName === 'A') {
					const span = E('span', { id: 'frpc-web-api' }, '-');
					webNode.parentNode.replaceChild(span, webNode);
				} else if (!r.web_url && webNode.tagName !== 'A') {
					webNode.textContent = '-';
				}
			}

			const serverNode = document.getElementById('frpc-connected-server');
			if (serverNode)
				serverNode.textContent = (r.server_addr && r.server_port) ? (r.server_addr + ':' + r.server_port) : '-';

			const listWrap = document.getElementById('frpc-proxy-list-wrap');
			if (listWrap) {
				const rows = flattenProxies(r.status);
				listWrap.innerHTML = '';
				if (rows.length === 0) {
					listWrap.appendChild(E('div', {}, _('No running proxies')));
				} else {
					const table = E('table', { 'class': 'table cbi-section-table' }, [
						E('tr', { 'class': 'tr table-titles' }, [
							E('th', { 'class': 'th' }, _('Name')),
							E('th', { 'class': 'th' }, _('Type')),
							E('th', { 'class': 'th' }, _('Status')),
							E('th', { 'class': 'th' }, _('Local')),
							E('th', { 'class': 'th' }, _('Remote')),
							E('th', { 'class': 'th' }, _('Error'))
						])
					]);
					rows.forEach((row) => {
						table.appendChild(E('tr', { 'class': 'tr' }, [
							E('td', { 'class': 'td' }, row.name),
							E('td', { 'class': 'td' }, row.type),
							E('td', { 'class': 'td' }, row.status),
							E('td', { 'class': 'td' }, row.local),
							E('td', { 'class': 'td' }, row.remote),
							E('td', { 'class': 'td' }, row.err || '-')
						]));
					});
					listWrap.appendChild(table);
				}
			}
		}), 5);

		return container;
	}
});
