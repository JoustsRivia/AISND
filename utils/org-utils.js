// utils/org-utils.js
// ★ 前端组织树工具单一源（OPT-05）。客户端用的子树推导，避免各页面重复实现 clientSubtree。
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

module.exports = { subtreeIds };
