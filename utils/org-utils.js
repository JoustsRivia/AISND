// utils/org-utils.js
// ★ 前端组织树工具单一源（OPT-05）。客户端用的子树推导 / 组织路径解析，避免各页面重复实现。
// 云函数侧另有 shared/dbBase.js 的 subtreeIds（接收 orgs，纯函数），职责不同、不互相引用。

// 从组织树推导 rootId 及其全部后代 ID（含自身），用于分台账可选项收窄 / 前端权限判断
function subtreeIds(tree, rootId) {
  if (!rootId || !Array.isArray(tree) || !tree.some((o) => o._id === rootId)) return [];
  const ids = [rootId];
  const queue = [rootId];
  while (queue.length) {
    const cur = queue.shift();
    for (const o of tree) {
      if (o.parentId === cur && !ids.includes(o._id)) {
        ids.push(o._id);
        queue.push(o._id);
      }
    }
  }
  return ids;
}

// 从扁平组织树解析 orgId 的完整路径（根 → 自身），如 ['安装公司', '工程部', '木工班']。
// 返回从根节点到目标节点的 name 数组；orgId 缺失或树中查不到返回 []。
function orgPath(tree, orgId) {
  if (!orgId || !Array.isArray(tree) || !tree.length) return [];
  const byId = {};
  tree.forEach((o) => { byId[o._id] = o; });
  const node = byId[orgId];
  if (!node) return [];
  const path = [];
  let cur = node;
  while (cur) {
    path.unshift(cur.name || '');
    cur = cur.parentId ? byId[cur.parentId] : null;
  }
  return path;
}

// 组织路径展示串：'安装公司 / 工程部 / 木工班'；无路径返回 ''（调用方自行处理"未分配"文案）
function orgPathText(tree, orgId) {
  return orgPath(tree, orgId).join(' / ');
}

module.exports = { subtreeIds, orgPath, orgPathText };
