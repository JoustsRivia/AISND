// components/attachment-uploader —— D9 通用附件上传/预览/删除
// 用法：<attachment-uploader value="{{photos}}" bind:change="onPhotos" />
const api = require('../../utils/api');
Component({
  properties: {
    value: { type: Array, value: [] },   // [{id,url,thumb}]
    max:     { type: Number, value: 6 },
    label:   { type: String, value: '附件' },
  },
  methods: {
    async onAdd() {
      const remain = this.data.max - this.data.value.length;
      if (remain <= 0) return;
      const r = await wx.chooseMedia({ count: remain, mediaType: ['image'] }).catch(() => null);
      if (!r) return;
      wx.showLoading({ title: '上传中', mask: true });
      const ids = await Promise.all(r.tempFiles.map((f) => api.uploadFile(f.tempFilePath, 'image').catch(() => null)));
      wx.hideLoading();
      const ok = ids.filter(Boolean);
      if (!ok.length) return;
      this.emit([...this.data.value, ...ok.map((id) => ({ id, url: id }))]);
    },
    onPreview(e) {
      const i = e.currentTarget.dataset.idx;
      wx.previewImage({ current: this.data.value[i].url, urls: this.data.value.map((v) => v.url) });
    },
    onDelete(e) {
      const i = e.currentTarget.dataset.idx;
      wx.showModal({
        title: '删除', content: '确认删除该附件？',
        success: (res) => {
          if (!res.confirm) return;
          const v = [...this.data.value]; v.splice(i, 1);
          this.emit(v);
        }
      });
    },
    emit(v) { this.triggerEvent('change', { value: v }); }
  }
});
