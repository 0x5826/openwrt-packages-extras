'use strict';
'require view';
'require rpc';
'require poll';
'require ui';
'require dom';

var callGetStatus = rpc.declare({
	object: 'luci.fancontrol',
	method: 'get_status'
});

var callSetLevel = rpc.declare({
	object: 'luci.fancontrol',
	method: 'set_level',
	params: [ 'level' ]
});

var callServiceAction = rpc.declare({
	object: 'luci.fancontrol',
	method: 'service',
	params: [ 'action' ]
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return callGetStatus();
	},

	render: function(status) {
		var container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('风扇控制') + ' - ' + _('状态概览')),
			E('div', { 'class': 'cbi-map-descr' }, _('实时监控香蕉派 BPI-R4 处理器温度与 PWM 风扇运行档位，提供硬件即时测试功能。'))
		]);

		// 运行状态卡片
		var statusSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('运行状态')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('table', { 'class': 'table cbi-section-table' }, [
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left', 'width': '33%' }, _('服务状态')),
						E('td', { 'class': 'td left' }, [
							E('span', { id: 'fan-service-state', style: 'font-weight:bold; margin-right:15px;' }, '-'),
							E('button', {
								id: 'fan-restart-btn',
								'class': 'btn cbi-button cbi-button-reload',
								click: ui.createHandlerFn(this, 'handleServiceAction', 'restart')
							}, _('重启服务'))
						])
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('运行模式')),
						E('td', { 'class': 'td left', 'id': 'fan-service-mode', 'style': 'font-weight:bold;' }, '-')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('处理器温度')),
						E('td', { 'class': 'td left', 'id': 'fan-cpu-temp', 'style': 'font-size:16px; font-weight:bold;' }, '-')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('当前风扇档位')),
						E('td', { 'class': 'td left', 'id': 'fan-cur-level', 'style': 'font-weight:bold;' }, '-')
					]),
					E('tr', { 'class': 'tr' }, [
						E('td', { 'class': 'td left' }, _('脉宽占空比')),
						E('td', { 'class': 'td left', 'id': 'fan-pwm-duty' }, '-')
					])
				])
			])
		]);
		container.appendChild(statusSection);

		// 快速测试面板
		var testSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('硬件快速测试')),
			E('div', { 'class': 'cbi-section-node' }, [
				E('p', { 'style': 'margin-bottom:15px; color:#666;' },
					_('点击按钮可即时下发档位进行硬件测试，测试结果立即生效并在状态栏回显。若服务处于运行中，后续温控检测将按设定规则恢复。')),
				E('div', { 'style': 'display:flex; gap:10px; flex-wrap:wrap;' }, [
					E('button', {
						'class': 'btn cbi-button cbi-button-reset',
						click: ui.createHandlerFn(this, 'handleSetLevel', 0)
					}, _('停止风扇 (0 级)')),
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						click: ui.createHandlerFn(this, 'handleSetLevel', 1)
					}, _('低速测试 (1 级)')),
					E('button', {
						'class': 'btn cbi-button cbi-button-action',
						click: ui.createHandlerFn(this, 'handleSetLevel', 2)
					}, _('中速测试 (2 级)')),
					E('button', {
						'class': 'btn cbi-button cbi-button-apply',
						click: ui.createHandlerFn(this, 'handleSetLevel', 3)
					}, _('全速测试 (3 级)'))
				])
			])
		]);
		container.appendChild(testSection);

		// 初始刷新
		this.updateStatusView(status);

		// 启动定时轮询 (每 3 秒)
		poll.add(L.bind(function() {
			return callGetStatus().then(L.bind(function(res) {
				this.updateStatusView(res);
			}, this));
		}, this), 3);

		return container;
	},

	updateStatusView: function(status) {
		if (!status) return;

		var stateEl = document.getElementById('fan-service-state');
		if (stateEl) {
			if (status.state === 'managed') {
				stateEl.textContent = _('运行中 [受控]') + (status.pid ? ' [PID: ' + status.pid + ']' : '');
				stateEl.style.color = '#2e7d32';
			} else if (status.state === 'unmanaged') {
				stateEl.textContent = _('运行中 [非受控]') + (status.pid ? ' [PID: ' + status.pid + ']' : '');
				stateEl.style.color = '#ef6c00';
			} else {
				stateEl.textContent = _('已停止');
				stateEl.style.color = '#c62828';
			}
		}

		var modeEl = document.getElementById('fan-service-mode');
		if (modeEl) {
			if (status.mode === 'auto') {
				modeEl.textContent = _('阶梯温控模式');
				modeEl.style.color = '#1565c0';
			} else if (status.mode === 'manual') {
				modeEl.textContent = _('手动定速模式');
				modeEl.style.color = '#6a1b9a';
			} else if (status.mode === 'kernel') {
				modeEl.textContent = _('内核接管模式');
				modeEl.style.color = '#455a64';
			} else {
				modeEl.textContent = status.mode || '-';
				modeEl.style.color = '#333';
			}
		}

		var tempEl = document.getElementById('fan-cpu-temp');
		if (tempEl) {
			var tempVal = parseFloat(status.temp) || 0;
			tempEl.textContent = tempVal.toFixed(1) + ' °C';
			if (tempVal >= 75) {
				tempEl.style.color = '#c62828';
			} else if (tempVal >= 60) {
				tempEl.style.color = '#ef6c00';
			} else {
				tempEl.style.color = '#2e7d32';
			}
		}

		var levelEl = document.getElementById('fan-cur-level');
		if (levelEl) {
			var lvl = parseInt(status.level) || 0;
			var lvlName = '';
			switch (lvl) {
				case 0: lvlName = _('0 级 [停转]'); break;
				case 1: lvlName = _('1 级 [低速 31%]'); break;
				case 2: lvlName = _('2 级 [中速 50%]'); break;
				case 3: lvlName = _('3 级 [全速 100%]'); break;
				default: lvlName = lvl + ' ' + _('级'); break;
			}
			levelEl.textContent = lvlName;
		}

		var pwmEl = document.getElementById('fan-pwm-duty');
		if (pwmEl) {
			var pwmVal = parseInt(status.pwm) || 0;
			var pct = Math.round((pwmVal / 255) * 100);
			pwmEl.textContent = pwmVal + ' / 255 (' + pct + '%)';
		}
	},

	handleSetLevel: function(lvl) {
		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('正在下发测试档位: %d 级 ...').format(lvl))
		]);

		return callSetLevel(lvl).then(L.bind(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('风扇测试档位下发成功: %d 级').format(lvl)), 'info');
				return callGetStatus().then(L.bind(this.updateStatusView, this));
			} else {
				ui.addNotification(null, E('p', _('风扇档位下发失败，请检查硬件节点。')), 'error');
			}
		}, this)).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC 请求失败: %s').format(err.message)), 'error');
		});
	},

	handleServiceAction: function(action) {
		ui.showModal(null, [
			E('p', { 'class': 'spinning' }, _('正在执行服务操作: %s ...').format(action))
		]);

		return callServiceAction(action).then(L.bind(function(res) {
			ui.hideModal();
			if (res && res.success) {
				ui.addNotification(null, E('p', _('服务操作成功执行。')), 'info');
				return callGetStatus().then(L.bind(this.updateStatusView, this));
			} else {
				ui.addNotification(null, E('p', _('服务操作执行失败。')), 'error');
			}
		}, this)).catch(function(err) {
			ui.hideModal();
			ui.addNotification(null, E('p', _('RPC 请求失败: %s').format(err.message)), 'error');
		});
	}
});
