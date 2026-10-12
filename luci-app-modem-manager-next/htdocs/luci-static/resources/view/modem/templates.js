'use strict';
'require view';
'require rpc';
'require ui';

const callGetTemplates = rpc.declare({
	object: 'luci.modem',
	method: 'get_templates',
	expect: { templates: [] }
});

return view.extend({
	handleSaveApply: null,
	handleSave: null,
	handleReset: null,

	load: function() {
		return L.resolveDefault(callGetTemplates(), []);
	},

	showTemplateDetail: function(tpl) {
		ui.showModal(tpl.name || _('Template Detail'), [
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Template ID')),
				E('div', { 'class': 'cbi-value-field' }, tpl.id || '-')
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Target Vendor')),
				E('div', { 'class': 'cbi-value-field' }, tpl.vendor || '-')
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('USB VID')),
				E('div', { 'class': 'cbi-value-field' }, tpl.vid || '-')
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Mode Switch Command')),
				E('div', { 'class': 'cbi-value-field' }, (tpl.mode_switch && tpl.mode_switch.cmd) ? tpl.mode_switch.cmd : _('Not Defined'))
			]),
			E('div', { 'class': 'cbi-value' }, [
				E('label', { 'class': 'cbi-value-title' }, _('Raw Configuration')),
				E('div', { 'class': 'cbi-value-field' }, [
					E('pre', {
						'style': 'background: #f7f7f7; padding: 10px; border: 1px solid #ddd; max-height: 250px; overflow-y: auto; font-size: 12px; font-family: monospace;'
					}, JSON.stringify(tpl, null, 2))
				])
			]),
			E('div', { 'class': 'right', 'style': 'margin-top: 15px;' }, [
				E('input', {
					'type': 'button',
					'class': 'btn cbi-button',
					'value': _('Close'),
					'click': ui.hideModal
				})
			])
		]);
	},

	render: function(tplData) {
		const self = this;
		const templates = Array.isArray(tplData) ? tplData : ((tplData && Array.isArray(tplData.templates)) ? tplData.templates : []);

		const container = E('div', { 'class': 'cbi-map' }, [
			E('h2', {}, _('Cellular Modem Manager') + ' - ' + _('Configuration Templates')),
			E('div', { 'class': 'cbi-map-descr' }, _('Manage vendor preset command profiles, private AT mappings, band lock masks, and driver switching templates.'))
		]);

		const rows = [];
		templates.forEach(function(tpl) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td left', 'style': 'font-weight: bold;' }, tpl.name || tpl.id),
				E('td', { 'class': 'td left' }, tpl.vendor || '-'),
				E('td', { 'class': 'td left' }, tpl.vid || '*'),
				E('td', { 'class': 'td left' }, (tpl.mode_switch && tpl.mode_switch.cmd) ? tpl.mode_switch.cmd : '-'),
				E('td', { 'class': 'td right' }, [
					E('input', {
						'type': 'button',
						'class': 'btn cbi-button cbi-button-action',
						'value': _('View Details'),
						'click': ui.createHandlerFn(self, 'showTemplateDetail', tpl)
					})
				])
			]));
		});

		if (rows.length === 0) {
			rows.push(E('tr', { 'class': 'tr' }, [
				E('td', { 'class': 'td center', 'colspan': '5' }, _('No templates installed.'))
			]));
		}

		const tableRows = [
			E('tr', { 'class': 'tr table-titles' }, [
				E('th', { 'class': 'th left' }, _('Template Name')),
				E('th', { 'class': 'th left' }, _('Vendor')),
				E('th', { 'class': 'th left' }, _('Vendor ID')),
				E('th', { 'class': 'th left' }, _('Mode Switching Command')),
				E('th', { 'class': 'th right' }, _('Actions'))
			])
		].concat(rows);

		const listSection = E('fieldset', { 'class': 'cbi-section' }, [
			E('legend', {}, _('Preset Template Library')),
			E('table', { 'class': 'table cbi-section-table' }, tableRows)
		]);
		container.appendChild(listSection);

		return container;
	}
});
