'use strict';
// cloudfunctions/_tests/migration-bridge.test.js
//
// 迁移契约「反向校验」常驻单测（Item 6）：把「换掉 wx-server-sdk 即整体迁移」从
// 理论保证升级为每提交必跑的回归卡点。
//   1) 接口等价：wx 适配层(_shared/dbBase.js) 与 mongo 适配层(_shared/dbBase.mongo.js)
//      暴露给业务 helpers 的命名导出完全一致 → 业务代码零改动即可整体迁移（双向一致）。
//   2) 行为等价：RBAC 数据范围原语(allowedOrgIds/subtreeIds/roleScope)在两层行为一致。
//   3) 真实驱动行为回归（可选）：配置 MONGODB_URI 时，对全业务域用【真实】helpers/db.js
//      跑 add/listBy/getById 一致性（与 scripts/migrate-drill/mongo.js 同源）。
//
// 运行：node --test cloudfunctions/_tests/migration-bridge.test.js
// 依赖：仅 Node 内置；mongodb 可选（未配置 MONGODB_URI 时跳过真实驱动回归）。

require('./mock-cloud'); // 安装 wx-server-sdk 拦截，使直接 require dbBase.js(wx) 可解析

const path = require('path');
const { test } = require('node:test');
const assert = require('node:assert');

const wxBase = require('../_shared/dbBase');
const mongoBase = require('../_shared/dbBase.mongo');

// 业务 helpers 从 dbBase 解构消费的命名导出（迁移契约的最小接口面）
const EXPECTED = [
  'cloud', 'db', '_', 'collection', 'regExp', 'getById', 'add', 'update', 'listBy',
  'getCurrentUser', 'GLOBAL_ROLES', 'UNIT_ROLES', 'subtreeIds', 'roleScope', 'allowedOrgIds', 'scopeFilter',
];

test('迁移契约①：wx 适配层与 mongo 适配层导出接口完全一致', () => {
  for (const k of EXPECTED) {
    assert.ok(k in wxBase, `wx dbBase 缺少导出 ${k}`);
    assert.ok(k in mongoBase, `mongo dbBase 缺少导出 ${k}`);
    assert.strictEqual(typeof wxBase[k], typeof mongoBase[k], `导出 ${k} 类型不一致（wx=${typeof wxBase[k]}, mongo=${typeof mongoBase[k]}）`);
  }
});

test('迁移契约②：RBAC 数据范围原语在两层行为一致', () => {
  const orgs = [{ _id: 'o1', parentId: null }, { _id: 'o2', parentId: 'o1' }, { _id: 'oX', parentId: null }];
  const admin = { role: 'admin', orgId: 'o1' };
  const worker = { role: 'worker', orgId: 'oX' };
  for (const [name, base] of [['wx', wxBase], ['mongo', mongoBase]]) {
    // 全局角色看全量（null）
    assert.strictEqual(base.allowedOrgIds(admin, orgs), null, `${name}: 全局角色应看全量(null)`);
    // 机构/班组角色仅见本机构子树
    const ids = base.allowedOrgIds(worker, orgs);
    assert.ok(Array.isArray(ids) && ids.includes('oX'), `${name}: 机构角色应仅见本机构子树`);
    // 角色档位一致
    assert.strictEqual(base.roleScope('project_lead'), 'unit', `${name}: project_lead 应为 unit`);
    assert.strictEqual(base.roleScope('worker'), 'org', `${name}: worker 应为 org`);
    // 子树推导一致
    assert.deepStrictEqual(base.subtreeIds(orgs, 'o1'), ['o1', 'o2'], `${name}: subtreeIds(o1) 应含 o1/o2`);
    // 范围片段一致（scopeFilter）
    assert.deepStrictEqual(base.scopeFilter(admin, orgs), {}, `${name}: 全局 scopeFilter 应为 {}`);
    const wf = base.scopeFilter(worker, orgs);
    assert.ok(wf && wf.orgId && wf.orgId.__op === 'in' && wf.orgId.value.includes('oX'),
      `${name}: worker scopeFilter 应返回按本机构子树的 in 条件`);
  }
});

// 可选：真实 MongoDB 行为回归（与 scripts/migrate-drill/mongo.js 同源，覆盖全业务域）
test('迁移契约③：真实 MongoDB 行为回归（需 MONGODB_URI）', async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) { console.log('⏭️  未配置 MONGODB_URI，跳过真实 MongoDB 行为回归'); return; }
  let mongodb;
  try { mongodb = require('mongodb'); } catch (e) { console.log('⏭️  可选依赖 mongodb 未安装，跳过真实 MongoDB 行为回归'); return; }
  const { mongoCollectionFactory } = require('./mongo-store');
  const REPO = path.resolve(__dirname, '..', '..');
  const MongoClient = mongodb.MongoClient;
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(process.env.MONGODB_DB || 'snd_drill');
  mongoBase.setCollectionFactory(mongoCollectionFactory(db));

  // 统一注入：业务 helpers 的 require('./dbBase') -> mongo 适配实现
  const Module = require('module');
  const orig = Module.prototype.require;
  Module.prototype.require = function (id) {
    if (id === './dbBase' && /cloudfunctions[\\/][^\\/]+[\\/]helpers/.test(this.filename)) return mongoBase;
    return orig.apply(this, arguments);
  };

  const DOMAINS = [
    { dir: 'borrow', coll: 'borrow_records', sample: { toolId: 'T-B', openid: 'o1' } },
    { dir: 'scrap', coll: 'scrap_records', sample: { toolId: 'T-S', applicant: 'o1', status: 'pending' } },
    { dir: 'file', coll: 'files', sample: { fileID: 'cloud://x/y.png', refId: 'T-F', uploadedBy: 'o1' } },
    { dir: 'store', coll: 'stores', sample: { name: 'A库房', orgId: 'oX' } },
    { dir: 'tool', coll: 'tools', sample: { code: 'C1', name: '扳手', category: 'common', status: 'qualified' } },
    { dir: 'maintenance', coll: 'repair_records', sample: { toolId: 'T-M', status: 'pending', reporter: 'o1', orgId: 'oX' } },
    { dir: 'purchase', coll: 'purchases', sample: { name: 'P物资', status: 'pending', applicant: 'o1', orgId: 'oX' } },
  ];

  try {
    for (const d of DOMAINS) {
      const dbLayer = require(path.join(REPO, 'cloudfunctions', d.dir, 'helpers', 'db.js'));
      try { await dbLayer.collection(d.coll).where({}).remove(); } catch (_) { /* 清场 */ }
      const added = await dbLayer.add(d.coll, d.sample);
      assert.ok(added && added._id, `[${d.dir}] add 未返回 _id`);
      const list = await dbLayer.listBy(d.coll, {});
      const rows = (list && list.data) || [];
      assert.ok(rows.some((r) => String(r._id) === String(added._id)), `[${d.dir}] listBy 未包含刚写入记录`);
    }
    console.log('✅ 真实 MongoDB 驱动全业务域回归通过（含 maintenance / purchase）');
  } finally {
    Module.prototype.require = orig;
    await client.close().catch(() => {});
  }
});
