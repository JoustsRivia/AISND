// components/org-cascading-picker/org-cascading-picker.js
// R03 组织层级联动选择器：单位 → 项目部 → 班组三级联动
// 基于扁平 orgTree 构建级联，@change 返回 { unitId, unitName, deptId, deptName, teamId, teamName }
Component({
  properties: {
    // 扁平组织树：[{ _id, name, parentId, level, kind }]
    orgTree: { type: Array, value: [] },
    // 是否只需要两级（单位+项目部），默认三级
    twoLevel: { type: Boolean, value: false },
    // 当前选中的 unitId（用于回显）
    unitId: { type: String, value: '' },
    // 当前选中的 deptId
    deptId: { type: String, value: '' },
    // 当前选中的 teamId
    teamId: { type: String, value: '' },
    // placeholder
    placeholder: { type: String, value: '请选择组织' },
  },

  data: {
    units: [],        // level 0 单位列表
    depts: [],        // level 1 项目部列表（随 unit 变化）
    teams: [],        // level 2 班组列表（随 dept 变化）
    unitIndex: -1,
    deptIndex: -1,
    teamIndex: -1,
  },

  observers: {
    orgTree(tree) {
      this._buildUnits(tree);
    },
    unitId(val) {
      this._selectUnit(val);
    },
    deptId(val) {
      this._selectDept(val);
    },
    teamId(val) {
      this._selectTeam(val);
    },
  },

  methods: {
    // 构建单位列表
    _buildUnits(tree) {
      const list = tree || [];
      const units = list.filter((o) => o.level === 0 || (!o.parentId && o.kind === 'unit'));
      this.setData({ units });
      if (this.data.unitId) this._selectUnit(this.data.unitId);
    },

    // 选择单位 → 加载其下属项目部
    _selectUnit(unitId) {
      const { units, orgTree } = this.data;
      const tree = orgTree || [];
      const idx = units.findIndex((u) => u._id === unitId);
      if (idx < 0) { this.setData({ unitIndex: -1, depts: [], teams: [], deptIndex: -1, teamIndex: -1 }); return; }
      const depts = tree.filter((o) => o.parentId === unitId && (o.level === 1 || o.kind === 'project'));
      this.setData({ unitIndex: idx, depts, teams: [], deptIndex: -1, teamIndex: -1 });
    },

    // 选择项目部 → 加载其下属班组
    _selectDept(deptId) {
      const { depts, orgTree } = this.data;
      const tree = orgTree || [];
      const idx = depts.findIndex((d) => d._id === deptId);
      if (idx < 0) { this.setData({ deptIndex: -1, teams: [], teamIndex: -1 }); return; }
      const teams = tree.filter((o) => o.parentId === deptId && (o.level === 2 || o.kind === 'team'));
      this.setData({ deptIndex: idx, teams, teamIndex: -1 });
    },

    _selectTeam(teamId) {
      const { teams } = this.data;
      const idx = teams.findIndex((t) => t._id === teamId);
      this.setData({ teamIndex: idx });
    },

    // picker change：单位
    onUnitChange(e) {
      const idx = Number(e.detail.value);
      const unit = this.data.units[idx];
      if (!unit) return;
      const tree = this.data.orgTree || [];
      const depts = tree.filter((o) => o.parentId === unit._id && (o.level === 1 || o.kind === 'project'));
      this.setData({ unitIndex: idx, depts, teams: [], deptIndex: -1, teamIndex: -1 });
      this._emitChange(unit, null, null);
    },

    // picker change：项目部
    onDeptChange(e) {
      const idx = Number(e.detail.value);
      const dept = this.data.depts[idx];
      if (!dept) return;
      const tree = this.data.orgTree || [];
      const teams = tree.filter((o) => o.parentId === dept._id && (o.level === 2 || o.kind === 'team'));
      this.setData({ deptIndex: idx, teams, teamIndex: -1 });
      const unit = this.data.units[this.data.unitIndex];
      this._emitChange(unit, dept, null);
    },

    // picker change：班组
    onTeamChange(e) {
      const idx = Number(e.detail.value);
      const team = this.data.teams[idx];
      if (!team) return;
      this.setData({ teamIndex: idx });
      const unit = this.data.units[this.data.unitIndex];
      const dept = this.data.depts[this.data.deptIndex];
      this._emitChange(unit, dept, team);
    },

    // 统一派发 change 事件
    _emitChange(unit, dept, team) {
      this.triggerEvent('change', {
        unitId: unit ? unit._id : '',
        unitName: unit ? unit.name : '',
        deptId: dept ? dept._id : '',
        deptName: dept ? dept.name : '',
        teamId: team ? team._id : '',
        teamName: team ? team.name : '',
        // 兼容旧契约：orgId 取最细粒度
        orgId: team ? team._id : (dept ? dept._id : (unit ? unit._id : '')),
      });
    },
  },
});
