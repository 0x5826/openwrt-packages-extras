'use strict';
'require view';
'require form';
'require uci';

return view.extend({
	render: function() {
		var m, s, o;

		m = new form.Map('cf-optimizer', _('Cloudflare 优选加速') + ' - ' + _('参数配置'),
			_('配置待优选的 Cloudflare 代理域名、测速周期及采样算法参数。'));

		s = m.section(form.NamedSection, 'settings', 'cf-optimizer', _('基础设置'));
		s.anonymous = true;

		o = s.option(form.Flag, 'enabled', _('启用服务'),
			_('开启后守护进程将按设定周期自动执行优选测速，并通过 dnsmasq 内存级重载生效。'));
		o.rmempty = false;

		o = s.option(form.DynamicList, 'domains', _('加速域名列表'),
			_('填入需要优选加速的域名，支持 Cloudflare Tunnel 穿透域名和小黄云代理域名。'));
		o.datatype = 'host';
		o.rmempty = false;

		o = s.option(form.ListValue, 'interval', _('自动优选周期'),
			_('两次自动测速优选之间的休眠间隔时间。'));
		o.value('30', _('30 分钟'));
		o.value('60', _('1 小时'));
		o.value('120', _('2 小时'));
		o.value('240', _('4 小时'));
		o.value('360', _('6 小时'));
		o.value('720', _('12 小时'));
		o.value('1440', _('24 小时'));
		o.default = '120';

		s = m.section(form.NamedSection, 'settings', 'cf-optimizer', _('高级探测参数'));
		s.anonymous = true;

		o = s.option(form.Value, 'sample_count', _('采样探测次数'),
			_('初筛后对候选节点进行连续采样的次数，用于计算平均时延与丢包率，推荐范围 3-10 次。'));
		o.datatype = 'range(2, 20)';
		o.default = '4';

		o = s.option(form.Value, 'hysteresis_pct', _('防震荡迟滞阈值'),
			_('新节点平均延迟相比在用节点必须降低超过此百分比才触发切换，避免网络微小波动导致局域网长连接频繁重连。'));
		o.datatype = 'range(0, 50)';
		o.default = '15';

		o = s.option(form.Value, 'concurrency', _('初筛并发数'),
			_('初筛阶段并发探测的进程数量，推荐范围 5-20。'));
		o.datatype = 'range(2, 30)';
		o.default = '10';

		o = s.option(form.ListValue, 'ip_source', _('候选 IP 来源'),
			_('选择优选测速的候选节点 IP 来源。'));
		o.value('builtin', _('内置优选 IP 池'));
		o.value('custom', _('自定义 IP 或网段'));
		o.value('mixed', _('混合模式'));
		o.default = 'builtin';

		o = s.option(form.DynamicList, 'custom_ips', _('自定义候选 IP 列表'),
			_('填入自定义的 Cloudflare Anycast IP 地址或网段。'));
		o.datatype = 'or(ip4addr, ip4prefix)';
		o.depends('ip_source', 'custom');
		o.depends('ip_source', 'mixed');

		return m.render();
	}
});
