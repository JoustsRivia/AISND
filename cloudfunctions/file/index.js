// cloudfunctions/file/index.js
// 业务逻辑层（M14 条码文件 / 上传元数据）：只引用 ./helpers，绝不直接 cloud.database()/getWXContext()。
const { getOpenid } = require('./helpers/user');
const { findTool, add, listBy, findUser, listOrgs, allowedOrgIds, roleScope, _ } = require('./helpers/db');

const ok = (data) => ({ code: 0, data });
const fail = (message, code = 1) => ({ code, message });

// 生成标签打印文件元数据（M14.1.2）：PDF/标签渲染由前端/打印服务完成
async function genLabel(payload) {
  const { id } = payload;
  const res = await findTool(id);
  if (!res.data) return fail('器具不存在', 404);
  const t = res.data;
  return ok({
    fileType: 'label',
    fields: {
      code: t.code, name: t.name,
      category: t.category, spec: t.spec,
      lastTestDate: t.lastTestDate, expireAt: t.expireAt,
      store: t.store, keeper: t.keeper,
    },
    generatedAt: new Date(),
  });
}

// 保存上传文件元数据（M1.3.5 附件 / M14 条码文件）
async function saveFileMeta(payload) {
  const openid = getOpenid();
  const { fileID, type, refId, name } = payload;
  if (!fileID) return fail('缺少 fileID');
  // 归属 orgId：优先取 refId 对应器具（若存在），服务端收窄防越权挂靠
  let orgId;
  if (refId) {
    const tRes = await findTool(refId);
    orgId = tRes.data && tRes.data.orgId;
  }
  const added = await add('files', {
    fileID, type: type || 'image', refId: refId || '',
    name: name || '', uploadedBy: openid, orgId, createdAt: new Date(),
  });
  return ok({ _id: added._id, fileID });
}

// 查询某器具的附件列表
async function listFiles(payload) {
  const { refId } = payload;
  if (!refId) return fail('缺少 refId');
  const openid = getOpenid();
  let where = { refId };
  // RBAC 数据范围（item 1）：在已知 refId 基础上，按组织子树再收窄
  const me = await findUser(openid);
  const u = me.data && me.data[0];
  const orgs = (await listOrgs(500)).data || [];
  const ids = allowedOrgIds(u, orgs, { orgId: payload.orgId, unitId: payload.unitId });
  if (ids === null) {
    // 全局角色：看全量（不过滤 orgId）
  } else if (ids.includes('__unbound__')) {
    where.orgId = '__unbound__'; // 无任何可见组织数据 → 命中空集
  } else {
    where.orgId = _.in(ids);
  }
  const res = await listBy('files', where, 50);
  return ok(res.data || []);
}

exports.main = async (event) => {
  const { action, payload = {} } = event;
  try {
    switch (action) {
      case 'genLabel': return genLabel(payload);
      case 'saveFileMeta': return saveFileMeta(payload);
      case 'listFiles': return listFiles(payload);
      default: return fail('未知 action: ' + action);
    }
  } catch (e) {
    return fail(e.message || '服务异常');
  }
};
