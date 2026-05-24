const API_BASE = 'https://lottery-system-production-2252.up.railway.app'

Page({
  data: {
    avatarUrl: '',
    nickname: '',
    loading: false,
    showSuccess: false
  },

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  joinLottery() {
    if (!this.data.nickname) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    this.setData({ loading: true })

    const doJoin = (avatarUrl) => {
      wx.login({
        success: (loginRes) => {
          if (!loginRes.code) {
            wx.showToast({ title: '登录失败', icon: 'none' })
            this.setData({ loading: false })
            return
          }
          wx.request({
            url: API_BASE + '/api/miniapp/join',
            method: 'POST',
            header: { 'Content-Type': 'application/json' },
            data: {
              code: loginRes.code,
              nickname: this.data.nickname,
              avatar: avatarUrl || ''
            },
            success: (res) => {
              this.setData({ loading: false })
              if (res.data.success) {
                this.setData({ showSuccess: true })
              } else {
                wx.showModal({
                  title: '提示',
                  content: res.data.message || '参与失败',
                  showCancel: false
                })
              }
            },
            fail: () => {
              wx.showToast({ title: '网络错误', icon: 'none' })
              this.setData({ loading: false })
            }
          })
        },
        fail: () => {
          wx.showToast({ title: '登录失败', icon: 'none' })
          this.setData({ loading: false })
        }
      })
    }

    // 有头像先上传
    if (this.data.avatarUrl) {
      wx.getFileSystemManager().readFile({
        filePath: this.data.avatarUrl,
        success: (res) => {
          wx.request({
            url: API_BASE + '/api/upload-avatar',
            method: 'POST',
            header: { 'Content-Type': 'image/png' },
            data: res.data,
            success: (r) => doJoin(r.data?.success ? r.data.url : ''),
            fail: () => doJoin('')
          })
        },
        fail: () => doJoin('')
      })
    } else {
      doJoin('')
    }
  },

  resetForm() {
    this.setData({ avatarUrl: '', nickname: '', showSuccess: false })
  }
})
