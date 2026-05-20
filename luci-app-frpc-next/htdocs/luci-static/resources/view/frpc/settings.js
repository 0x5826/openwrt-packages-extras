'use strict';
'require view';
'require rpc';
'require ui';

const callGetConfig = rpc.declare({
	object: 'luci.frpc',
	method: 'get_config'
});

const callSaveConfig = rpc.declare({
	object: 'luci.frpc',
	method: 'save_config',
	params: [ 'config' ]
});

const callValidateConfig = rpc.declare({
	object: 'luci.frpc',
	method: 'validate_config',
	params: [ 'config' ]
});

const callStatus = rpc.declare({
	object: 'luci.frpc',
	method: 'get_status'
});

const callSetEnabled = rpc.declare({
	object: 'luci.frpc',
	method: 'set_enabled',
	params: [ 'enabled' ]
});

const callServiceAction = rpc.declare({
	object: 'luci.frpc',
	method: 'service_action',
	params: [ 'action' ]
});

function escapeHtml(s) {
	return String(s || '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

function highlightToml(text) {
	const lines = String(text || '').split('\n');
	const out = [];

	for (let i = 0; i < lines.length; i++) {
		let l = escapeHtml(lines[i]);

		if (/^\s*#/.test(lines[i])) {
			out.push('<span class="frpc-hl-comment">' + l + '</span>');
			continue;
		}

		l = l.replace(/^(\s*\[\[?[^\]]+\]?\]\s*)$/, '<span class="frpc-hl-section">$1</span>');
		l = l.replace(/^(\s*[A-Za-z0-9_.-]+\s*=)/, '<span class="frpc-hl-key">$1</span>');
		l = l.replace(/("(?:[^"\\]|\\.)*")/g, '<span class="frpc-hl-string">$1</span>');
		l = l.replace(/\b(true|false)\b/g, '<span class="frpc-hl-bool">$1</span>');
		l = l.replace(/\b([0-9]+)\b/g, '<span class="frpc-hl-num">$1</span>');
		out.push(l);
	}

	return out.join('\n');
}

function parseErrorPosition(errText) {
	const s = String(errText || '');
	let m = s.match(/line\s+(\d+)\s*[,;:]?\s*(?:col|column)\s+(\d+)/i);
	if (m)
		return { line: +m[1], col: +m[2] };

	m = s.match(/at\s+line\s+(\d+)\s*[,;:]?\s*column\s+(\d+)/i);
	if (m)
		return { line: +m[1], col: +m[2] };

	m = s.match(/line\s+(\d+)/i);
	if (m)
		return { line: +m[1], col: null };

	return null;
}

return view.extend({
	_validateTimer: null,
	_errorLine: null,
	_previewEnabled: false,

	injectStyle: function() {
		if (document.getElementById('frpc_editor_style'))
			return;

		const css = [
			'.frpc-editor-wrap{border:1px solid #ccc;border-radius:4px;overflow:hidden;background:#fff;}',
			'.frpc-editor-main{display:flex;min-height:420px;max-height:65vh;}',
			'.frpc-editor-gutter{width:56px;background:#f7f7f7;color:#666;border-right:1px solid #e5e5e5;overflow:hidden;font:12px/1.45 monospace;padding:8px 6px;text-align:right;user-select:none;}',
			'.frpc-editor-gutter-line{height:1.45em;}',
			'.frpc-editor-gutter-line.err{background:#ffe8e8;color:#b00020;font-weight:700;}',
			'.frpc-editor-input-wrap{flex:1;overflow:auto;background:#fff;}',
			'.frpc-editor-input{width:100%;min-height:100%;box-sizing:border-box;border:0;outline:none;resize:none;overflow-wrap:anywhere;white-space:pre-wrap;word-break:break-word;font:12px/1.45 monospace;padding:8px 10px;}',
			'.frpc-preview-wrap{border-top:1px solid #e5e5e5;background:#fcfcfc;}',
			'.frpc-preview-title{padding:6px 10px;color:#666;font-size:12px;border-bottom:1px solid #eee;}',
			'.frpc-editor-preview{margin:0;padding:8px 10px;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word;font:12px/1.45 monospace;background:#fcfcfc;color:#222;}',
			'.frpc-hl-comment{color:#6a737d;}',
			'.frpc-hl-section{color:#005cc5;font-weight:700;}',
			'.frpc-hl-key{color:#6f42c1;}',
			'.frpc-hl-string{color:#032f62;}',
			'.frpc-hl-num{color:#b31d28;}',
			'.frpc-hl-bool{color:#d73a49;font-weight:700;}'
		].join('');

		document.head.appendChild(E('style', { id: 'frpc_editor_style' }, css));
	},

	refreshEditor: function() {
		const ta = document.getElementById('frpc_config');
		const gutter = document.getElementById('frpc_editor_gutter');
		const preview = document.getElementById('frpc_editor_preview');
		if (!ta || !gutter || !preview)
			return;

		const text = ta.value || '';
		preview.innerHTML = highlightToml(text) + '\n';

		const lineCount = Math.max(1, text.split('\n').length);
		gutter.innerHTML = '';
		for (let i = 1; i <= lineCount; i++) {
			gutter.appendChild(E('div', {
				'class': 'frpc-editor-gutter-line' + (this._errorLine === i ? ' err' : '')
			}, String(i)));
		}
	},

	renderEditor: function(configText) {
		const gutter = E('div', { id: 'frpc_editor_gutter', 'class': 'frpc-editor-gutter' });
		const ta = E('textarea', {
			id: 'frpc_config',
			'class': 'frpc-editor-input',
			spellcheck: 'false',
			wrap: 'soft'
		}, configText || '');
		const inputWrap = E('div', { 'class': 'frpc-editor-input-wrap' }, [ ta ]);
		const preview = E('pre', { id: 'frpc_editor_preview', 'class': 'frpc-editor-preview' }, '');

		ta.addEventListener('input', L.bind(function() {
			this.refreshEditor();
			this.scheduleValidate();
		}, this));
		ta.addEventListener('scroll', function() {
			gutter.scrollTop = ta.scrollTop;
		});

		window.setTimeout(L.bind(function() { this.refreshEditor(); }, this), 0);

		return E('div', { 'class': 'frpc-editor-wrap' }, [
			E('div', { 'class': 'frpc-editor-main' }, [ gutter, inputWrap ]),
			E('div', { id: 'frpc_preview_wrap', 'class': 'frpc-preview-wrap', style: 'display:none' }, [
				E('div', {
					'class': 'frpc-preview-title',
					style: 'display:flex; align-items:center; justify-content:space-between;'
				}, [
					E('span', {}, _('Highlight Preview (Read-only)')),
					E('button', {
						'class': 'btn cbi-button',
						style: 'padding:2px 8px; line-height:1.2;',
						click: ui.createHandlerFn(this, function() {
							this.disablePreview();
						})
					}, _('Hide Preview'))
				]),
				preview
			])
		]);
	},

	enablePreview: function() {
		this._previewEnabled = true;
		const wrap = document.getElementById('frpc_preview_wrap');
		if (wrap)
			wrap.style.display = '';
	},

	disablePreview: function() {
		this._previewEnabled = false;
		const wrap = document.getElementById('frpc_preview_wrap');
		if (wrap)
			wrap.style.display = 'none';
	},

	setValidateHint: function(ok, message, pos) {
		const hint = document.getElementById('frpc_validate_hint');
		if (!hint)
			return;

		hint.style.color = ok ? 'green' : 'red';
		hint.textContent = message;
		this._errorLine = (!ok && pos && pos.line) ? pos.line : null;
		this.refreshEditor();
	},

	runValidate: function(showPreview) {
		if (showPreview === true)
			this.enablePreview();

		const content = document.getElementById('frpc_config')?.value || '';
		if (!content.trim()) {
			this.setValidateHint(true, _('Configuration is empty.'));
			return Promise.resolve();
		}

		return callValidateConfig(content).then(L.bind(function(res) {
			if (res && res.success) {
				this.setValidateHint(true, _('TOML syntax looks valid.'));
				return;
			}

			const err = (res && res.error) ? String(res.error).trim() : _('Unknown error');
			const pos = parseErrorPosition(err);
			let msg = _('Syntax error: ') + err;
			if (pos && pos.line)
				msg += ' (' + _('Line') + ' ' + pos.line + (pos.col ? ', ' + _('Column') + ' ' + pos.col : '') + ')';
			this.setValidateHint(false, msg, pos);
		}, this));
	},

	scheduleValidate: function() {
		if (this._validateTimer)
			window.clearTimeout(this._validateTimer);

		this._validateTimer = window.setTimeout(L.bind(function() {
			this.runValidate(false).catch(function() {});
		}, this), 700);
	},

	load: function() {
		return Promise.all([ callGetConfig(), callStatus() ]);
	},

	render: function(data) {
		this.injectStyle();
		const cfg = data && data[0] ? data[0] : {};
		const st = data && data[1] ? data[1] : {};
		const configText = cfg.config || '';
		const enabled = (st.enabled === 1 || st.enabled === true);

		window.setTimeout(L.bind(function() {
			this.runValidate(false).catch(function() {});
		}, this), 0);

		return E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Frp Client Title') + ' - ' + _('Settings')),
			E('div', { 'class': 'cbi-map-descr' }, _('Configure the Frp client parameters. Complete the server link details and local port forwarding rules to build an intranet penetration channel.')),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', { 'class': 'cbi-section-title' }, _('Service Control')),
				E('div', { 'class': 'cbi-value' }, [
					E('label', { 'class': 'cbi-value-title' }, _('Enabled')),
					E('div', { 'class': 'cbi-value-field' }, [
						E('input', {
							id: 'frpc_enabled',
							type: 'checkbox',
							checked: enabled ? 'checked' : null,
							change: ui.createHandlerFn(this, function(ev) {
								let on = ev.currentTarget && ev.currentTarget.checked ? 1 : 0;
								return callSetEnabled(on).then(function(res) {
									if (!(res && res.success)) {
										ui.addNotification(null, E('p', _('Failed to update service enable state.')), 'danger');
										return;
									}

									ui.addNotification(null, E('p', _('Service enable state updated.')), 'info');
									return callServiceAction(on ? 'start' : 'stop').then(function(actRes) {
										if (!(actRes && actRes.success))
											ui.addNotification(null, E('p', _('Failed to apply service state.')), 'danger');
									});
								});
							})
						})
					])
				])
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('h3', { 'class': 'cbi-section-title' }, _('Configuration Editor')),
				this.renderEditor(configText)
			]),
			E('div', { 'class': 'cbi-section' }, [
				E('button', {
					'class': 'btn cbi-button cbi-button-apply',
					click: ui.createHandlerFn(this, function() {
						return this.runValidate(true);
					})
				}, _('Validate TOML Syntax')),
				E('span', { id: 'frpc_validate_hint', style: 'margin-left:12px;' }, '')
			])
		]);
	},

	saveConfig: function() {
		const configText = document.getElementById('frpc_config')?.value || '';

		return callSaveConfig(configText).then(function(res) {
			if (res && res.success) {
				if (res.applied === false) {
					ui.addNotification(null, E('p', _('Configuration saved, but service is not running or reload failed. Please force restart service.')), 'warning');
				} else {
					ui.addNotification(null, E('p', _('Configuration saved and applied successfully.')), 'info');
				}
				return;
			}

			ui.addNotification(null, E('p', _('Configuration save failed: ') + (res && res.error ? res.error : _('Unknown error'))), 'danger');
			throw new Error('frpc config save failed');
		});
	},

	validateAndSave: function() {
		const configText = document.getElementById('frpc_config')?.value || '';

		return callValidateConfig(configText).then(L.bind(function(res) {
			if (!res || !res.success) {
				const err = (res && res.error) ? String(res.error).trim() : _('Unknown error');
				this.setValidateHint(false, _('Syntax error: ') + err, parseErrorPosition(err));
				ui.addNotification(null, E('pre', { style: 'white-space:pre-wrap; margin:0;' }, _('frpc config verify failed:\n') + err), 'danger');
				throw new Error('frpc verify failed');
			}

			this.setValidateHint(true, _('TOML syntax looks valid.'));
			return this.saveConfig();
		}, this));
	},

	handleSave: function() {
		return this.validateAndSave();
	},

	handleSaveApply: function() {
		return this.validateAndSave();
	}
});
